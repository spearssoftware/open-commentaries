import { childEnv } from "./env.ts";
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

/** --json-schema adds this one tool; nothing else may be present. */
const STRUCTURED_OUTPUT_TOOL = "StructuredOutput";

export function claudeArgs(call: ModelCall): string[] {
  return [
    "-p",
    "--safe-mode",
    "--restricted",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--tools",
    "",
    "--disable-slash-commands",
    "--permission-mode",
    "dontAsk",
    "--permission-prompts",
    "none",
    "--no-session-persistence",
    "--model",
    call.model,
    "--system-prompt",
    call.system,
    "--output-format",
    "stream-json",
    "--verbose",
    "--json-schema",
    JSON.stringify(call.schema),
  ];
}

type Event = Record<string, unknown>;

function parseEvents(stdout: string): Event[] {
  return stdout
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line) as Event;
      } catch {
        throw new CliError(`claude printed a non-JSON line: ${summarize(line)}`);
      }
    });
}

const listed = (init: Event, key: string): unknown[] => {
  const value = init[key];
  if (!Array.isArray(value)) {
    throw new IsolationError(`claude init event has no ${key} list; cannot confirm isolation`);
  }
  return value;
};

/** Checks the session's tools and extensions and returns the model it runs. */
function checkInit(init: Event | undefined): string {
  if (!init) throw new IsolationError("claude emitted no init event; cannot confirm isolation");
  const extraTools = listed(init, "tools").filter((t) => t !== STRUCTURED_OUTPUT_TOOL);
  const nonEmpty = ["mcp_servers", "slash_commands", "skills"].filter(
    (key) => listed(init, key).length > 0,
  );
  if (extraTools.length || nonEmpty.length) {
    throw new IsolationError(
      `claude started with tools [${extraTools.join(", ")}] and non-empty ${nonEmpty.join(", ") || "nothing else"}`,
    );
  }
  if (typeof init.model !== "string")
    throw new CliError("claude init event does not name its model");
  return init.model;
}

function checkToolUse(events: Event[]): void {
  for (const e of events) {
    if (e.type !== "assistant") continue;
    const content = ((e.message as Event | undefined)?.content as Event[] | undefined) ?? [];
    for (const block of content) {
      if (block.type === "tool_use" && block.name !== STRUCTURED_OUTPUT_TOOL) {
        throw new IsolationError(`claude called tool ${String(block.name)}`);
      }
    }
  }
}

export async function runClaude<T = unknown>(call: ModelCall): Promise<ModelResult<T>> {
  const bin = process.env.CLAUDE_BIN ?? "claude";
  const env = childEnv();
  const result = await runIsolated("claude", bin, env, async ({ work }) => {
    const { stdout, stderr, exitCode } = await spawnCli([bin, ...claudeArgs(call)], {
      stdin: call.prompt,
      cwd: work,
      env,
    });
    const events = parseEvents(stdout);
    const final = events.find((e) => e.type === "result");
    if (exitCode !== 0 && !final) {
      throw new CliError(`claude exited ${exitCode}: ${summarize(stderr || stdout)}`);
    }
    const model = checkInit(events.find((e) => e.type === "system" && e.subtype === "init"));
    checkToolUse(events);
    if (!final) throw new CliError(`claude produced no result event: ${summarize(stderr)}`);
    if (final.subtype !== "success" || final.is_error === true) {
      const detail = summarize(String(final.result ?? final.subtype ?? stderr));
      if (String(final.subtype).includes("structured_output")) {
        throw new MalformedOutputError(`claude could not produce schema output: ${detail}`);
      }
      throw new CliError(`claude returned ${String(final.subtype)}: ${detail}`);
    }
    if (final.structured_output === undefined) {
      throw new MalformedOutputError("claude result has no structured_output");
    }
    const usage = (final.usage as Record<string, number> | undefined) ?? {};
    return {
      output: checkOutput(final.structured_output, call.schema),
      model,
      usage: {
        inputTokens: usage.input_tokens ?? null,
        outputTokens: usage.output_tokens ?? null,
        cachedInputTokens: usage.cache_read_input_tokens ?? null,
      },
    };
  });
  return result as ModelResult<T>;
}
