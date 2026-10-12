import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runClaude } from "../src/models/claude.ts";
import { featuresToDisable, runCodex } from "../src/models/codex.ts";
import {
  CliError,
  IsolationError,
  MalformedOutputError,
  type ModelCall,
} from "../src/models/runner.ts";
import type { StubResponse } from "./stubs/common.ts";

const STUBS = join(import.meta.dir, "stubs");
const originalTmp = process.env.TMPDIR;
const roots: string[] = [];

process.env.CLAUDE_BIN = join(STUBS, "claude");
process.env.CODEX_BIN = join(STUBS, "codex");
// Present in the parent; the stubs fail if any of these reach them.
process.env.ANTHROPIC_API_KEY = "sk-should-not-leak";
process.env.CLAUDECODE = "1";
process.env.CLAUDE_CODE_ENTRYPOINT = "cli";
process.env.OPENAI_API_KEY = "sk-should-not-leak";

const call: ModelCall = {
  model: "test-model",
  system: "You extract claims.",
  prompt: "Original text goes here.",
  schema: {
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
    additionalProperties: false,
  },
};

function script(cli: "claude" | "codex", responses: StubResponse[]): void {
  writeFileSync(
    join(process.env.TMPDIR as string, "oc-stub", `${cli}.json`),
    JSON.stringify(responses),
  );
}

function calls(
  cli: "claude" | "codex",
): { args: string[]; stdin: string; system?: string; model: string }[] {
  const log = join(process.env.TMPDIR as string, "oc-stub", `${cli}.calls.jsonl`);
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

beforeEach(() => {
  const root = mkdtempSync(join(originalTmp ?? tmpdir(), "oc-runner-test-"));
  roots.push(root);
  process.env.TMPDIR = root;
  mkdirSync(join(root, "oc-stub"));
});

afterAll(() => {
  // Assigning undefined would store the string "undefined" and break later tests' tmpdir().
  if (originalTmp === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = originalTmp;
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const leftoverDirs = () => readdirSync(process.env.TMPDIR as string).filter((d) => d !== "oc-stub");

describe("runClaude", () => {
  test("returns validated output with model, version, and usage", async () => {
    script("claude", [{ output: { answer: "ok" } }]);
    const result = await runClaude(call);
    expect(result.output).toEqual({ answer: "ok" });
    expect(result.model).toBe("test-model");
    expect(result.cliVersion).toBe("2.0.0 (stub)");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 });
    expect(result.attempts).toBe(1);
    const [c] = calls("claude");
    expect(c?.stdin).toBe(call.prompt);
    expect(c?.system).toBe(call.system);
    expect(leftoverDirs()).toEqual([]);
  });

  test("retries malformed output up to two times", async () => {
    script("claude", [
      { raw: "not json" },
      { output: { wrong: 1 } },
      { output: { answer: "third" } },
    ]);
    const result = await runClaude(call);
    expect(result.output).toEqual({ answer: "third" });
    expect(result.attempts).toBe(3);
    expect(calls("claude")).toHaveLength(3);
  });

  test("gives up after three malformed replies", async () => {
    script("claude", [{ raw: "a" }, { raw: "b" }, { raw: "c" }, { output: { answer: "never" } }]);
    expect(runClaude(call)).rejects.toBeInstanceOf(MalformedOutputError);
    await Bun.sleep(0);
  });

  test("a CLI failure is not retried", async () => {
    script("claude", [{ fail: "Claude usage limit reached" }, { output: { answer: "never" } }]);
    const error = await runClaude(call).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CliError);
    expect(String(error)).toContain("usage limit");
    expect(calls("claude")).toHaveLength(1);
  });

  test("a tool call fails the call", async () => {
    script("claude", [{ output: { answer: "x" }, tool: "Read" }]);
    expect(await runClaude(call).catch((e: unknown) => e)).toBeInstanceOf(IsolationError);
  });

  test("an init event listing tools fails the call", async () => {
    script("claude", [{ output: { answer: "x" }, initTools: ["StructuredOutput", "Bash"] }]);
    const error = await runClaude(call).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IsolationError);
    expect(String(error)).toContain("Bash");
  });

  test("writing to the working directory fails the call", async () => {
    script("claude", [{ output: { answer: "x" }, writeFile: true }]);
    expect(await runClaude(call).catch((e: unknown) => e)).toBeInstanceOf(IsolationError);
    expect(leftoverDirs()).toEqual([]);
  });
});

describe("runCodex", () => {
  test("disables every non-allowlisted feature and reads the output file", async () => {
    script("codex", [{ output: { answer: "ok" } }]);
    const result = await runCodex(call);
    expect(result.output).toEqual({ answer: "ok" });
    expect(result.model).toBe("test-model");
    expect(result.cliVersion).toBe("codex-cli 0.0.0-stub");
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 7, cachedInputTokens: 0 });
    const [c] = calls("codex");
    expect(c?.stdin).toBe(`${call.system}\n\n${call.prompt}`);
    expect(c?.args).not.toContain("auth_elicitation");
    expect(c?.args).not.toContain("resize_all_images");
    expect(leftoverDirs()).toEqual([]);
  });

  test("an unreadable features list fails closed", () => {
    const fake = join(process.env.TMPDIR as string, "fake-codex");
    writeFileSync(
      fake,
      "#!/bin/sh\necho 'feature,stage,enabled'\necho 'shell_tool,stable,true'\n",
      { mode: 0o755 },
    );
    expect(() => featuresToDisable(fake, { PATH: process.env.PATH ?? "" })).toThrow(IsolationError);
  });

  test("a command execution item fails the call", async () => {
    script("codex", [{ output: { answer: "x" }, tool: "command_execution" }]);
    const error = await runCodex(call).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IsolationError);
    expect(String(error)).toContain("command_execution");
  });

  test("malformed output is retried; failures are not", async () => {
    script("codex", [{ raw: "{oops" }, { output: { answer: "ok" } }]);
    expect((await runCodex(call)).attempts).toBe(2);
    rmSync(join(process.env.TMPDIR as string, "oc-stub", "codex.calls.jsonl"));
    script("codex", [{ fail: "rate limited" }]);
    expect(await runCodex(call).catch((e: unknown) => e)).toBeInstanceOf(CliError);
  });
});
