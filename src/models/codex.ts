import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CODEX_HOME, childEnv } from "./env.ts";
import {
  CliError,
  checkOutput,
  IsolationError,
  MalformedOutputError,
  type ModelCall,
  type ModelResult,
  runIsolated,
  spawnCli,
  summarize,
} from "./runner.ts";

/** Features that may stay enabled: transport and auth plumbing, none of which gives the model a capability. */
export const FEATURE_ALLOWLIST = new Set([
  "auth_elicitation",
  "compaction_image_budget",
  "content_item_kinds",
  "enable_request_compression",
  "guardian_reuse_parent_compaction",
  "system_proxy_fallback",
  "unbounded_connection_retries",
]);

/** Stream items the model may produce. Anything else (commands, file changes, MCP, search) fails the call. */
const ALLOWED_ITEMS = new Set(["agent_message", "reasoning", "error"]);

/**
 * Features that must appear in `codex features list`. If any is missing the output format has
 * changed, and parsing it could silently disable nothing, so the call fails instead.
 */
const MUST_BE_LISTED = [
  "shell_tool",
  "unified_exec",
  "apps",
  "plugins",
  "hooks",
  "multi_agent",
  "browser_use",
];

/** Every enabled feature outside the allowlist, read from `codex features list` so new ones are caught. */
export function featuresToDisable(bin: string, env: Record<string, string>): string[] {
  const result = Bun.spawnSync([bin, "features", "list"], { env, cwd: tmpdir() });
  if (result.exitCode !== 0) {
    throw new CliError(`${bin} features list failed: ${summarize(result.stderr.toString())}`);
  }
  const rows = result.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim().split(/\s{2,}/))
    .filter((cols) => cols.length === 3 && (cols[2] === "true" || cols[2] === "false"));
  const listed = new Set(rows.map(([name]) => name));
  const missing = MUST_BE_LISTED.filter((f) => !listed.has(f));
  if (missing.length) {
    throw new IsolationError(
      `\`${bin} features list\` did not list ${missing.join(", ")}; its format may have changed, so features cannot be disabled reliably`,
    );
  }
  return rows
    .filter(([, stage, enabled]) => enabled === "true" && stage !== "removed")
    .map(([name]) => name as string)
    .filter((name) => !FEATURE_ALLOWLIST.has(name));
}

export function codexArgs(call: ModelCall, work: string, io: string, disable: string[]): string[] {
  return [
    "exec",
    "-",
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--skip-git-repo-check",
    "-C",
    work,
    "-s",
    "read-only",
    "-m",
    call.model,
    "-c",
    'approval_policy="never"',
    "-c",
    'web_search="disabled"',
    "-c",
    "project_doc_max_bytes=0",
    "-c",
    "project_doc_fallback_filenames=[]",
    ...disable.flatMap((f) => ["--disable", f]),
    "--output-schema",
    join(io, "schema.json"),
    "-o",
    join(io, "last.json"),
    "--json",
  ];
}

type Event = Record<string, unknown>;

export async function runCodex<T = unknown>(call: ModelCall): Promise<ModelResult<T>> {
  const bin = process.env.CODEX_BIN ?? "codex";
  const env = childEnv({ CODEX_HOME });
  const disable = featuresToDisable(bin, env);
  const result = await runIsolated("codex", bin, env, async ({ work, io }) => {
    writeFileSync(join(io, "schema.json"), JSON.stringify(call.schema));
    const { stdout, stderr, exitCode } = await spawnCli(
      [bin, ...codexArgs(call, work, io, disable)],
      {
        stdin: `${call.system}\n\n${call.prompt}`,
        cwd: work,
        env,
      },
    );
    const events: Event[] = [];
    for (const line of stdout.split("\n").filter((l) => l.trim())) {
      try {
        events.push(JSON.parse(line) as Event);
      } catch {
        throw new CliError(`codex printed a non-JSON line: ${summarize(line)}`);
      }
    }
    for (const e of events) {
      const item = e.item as Event | undefined;
      if (item && !ALLOWED_ITEMS.has(String(item.type))) {
        throw new IsolationError(`codex produced a ${String(item.type)} item`);
      }
    }
    const failed = events.find((e) => e.type === "turn.failed" || e.type === "error");
    if (exitCode !== 0 || failed) {
      const detail = failed ? JSON.stringify(failed.error ?? failed.message ?? failed) : stderr;
      throw new CliError(`codex exited ${exitCode}: ${summarize(detail)}`);
    }
    const completed = events.findLast((e) => e.type === "turn.completed");
    if (!completed)
      throw new CliError(`codex finished without turn.completed: ${summarize(stderr)}`);
    let output: unknown;
    try {
      output = JSON.parse(readFileSync(join(io, "last.json"), "utf8"));
    } catch {
      throw new MalformedOutputError("codex's last message is not valid JSON");
    }
    const usage = (completed.usage as Record<string, number> | undefined) ?? {};
    return {
      output: checkOutput(output, call.schema),
      model: call.model,
      usage: {
        inputTokens: usage.input_tokens ?? null,
        outputTokens: usage.output_tokens ?? null,
        cachedInputTokens: usage.cached_input_tokens ?? null,
      },
    };
  });
  return result as ModelResult<T>;
}
