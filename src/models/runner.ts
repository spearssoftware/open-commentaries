// Shared machinery for isolated model calls. Every call runs in a fresh, empty working directory
// outside the repo, receives its input only on stdin, and gets a separate I/O directory for the
// schema and output files. The working directory must still be empty afterwards.
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type JsonSchema, validateJson } from "./schema.ts";

export interface ModelCall {
  model: string;
  system: string;
  prompt: string;
  schema: JsonSchema;
}

export interface Usage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
}

export interface ModelResult<T = unknown> {
  output: T;
  model: string;
  cliVersion: string;
  usage: Usage;
  durationMs: number;
  attempts: number;
}

/** The CLI itself failed (usage limit, auth, crash). Not retried. */
export class CliError extends Error {
  override name = "CliError";
}

/** The CLI ran with tools, servers, or files it must not have. Never retried. */
export class IsolationError extends Error {
  override name = "IsolationError";
}

/** The model's reply was not valid JSON for the schema. Retried up to MAX_RETRIES times. */
export class MalformedOutputError extends Error {
  override name = "MalformedOutputError";
}

const MAX_RETRIES = 2;

interface CallDirs {
  work: string;
  io: string;
}

interface Attempt<T> {
  output: T;
  model: string;
  usage: Usage;
}

interface Spawned {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function spawnCli(
  argv: string[],
  options: { stdin: string; cwd: string; env: Record<string, string> },
): Promise<Spawned> {
  const proc = Bun.spawn(argv, {
    cwd: options.cwd,
    env: options.env,
    stdin: new Blob([options.stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

const versions = new Map<string, string>();

export function cliVersion(bin: string, env: Record<string, string>): string {
  const cached = versions.get(bin);
  if (cached) return cached;
  const result = Bun.spawnSync([bin, "--version"], { env, cwd: tmpdir() });
  if (result.exitCode !== 0)
    throw new CliError(`${bin} --version failed: ${result.stderr.toString().trim()}`);
  const version = result.stdout.toString().trim();
  versions.set(bin, version);
  return version;
}

export function summarize(text: string): string {
  const line = text.trim().split("\n").filter(Boolean).at(-1) ?? "";
  return line.length > 300 ? `${line.slice(0, 300)}…` : line;
}

/** Validates output against the schema; the cast to T is what the schema describes. */
export function checkOutput<T>(output: unknown, schema: JsonSchema): T {
  const problems = validateJson(output, schema);
  if (problems.length)
    throw new MalformedOutputError(`Output does not match the schema: ${problems.join("; ")}`);
  return output as T;
}

/** Parses JSON-lines CLI output; a line that is not JSON means the CLI itself misbehaved. */
export function parseJsonLines(cli: string, stdout: string): Record<string, unknown>[] {
  return stdout
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        throw new CliError(`${cli} printed a non-JSON line: ${summarize(line)}`);
      }
    });
}

/** Runs one attempt per fresh pair of directories, retrying only malformed output. */
export async function runIsolated<T>(
  cli: string,
  bin: string,
  env: Record<string, string>,
  attempt: (dirs: CallDirs) => Promise<Attempt<T>>,
): Promise<ModelResult<T>> {
  const version = cliVersion(bin, env);
  const started = performance.now();
  let lastError: MalformedOutputError | undefined;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    const root = process.env.TMPDIR ?? tmpdir();
    const dirs = {
      work: mkdtempSync(join(root, "oc-work-")),
      io: mkdtempSync(join(root, "oc-io-")),
    };
    try {
      const result = await attempt(dirs);
      const leftovers = readdirSync(dirs.work);
      if (leftovers.length) {
        throw new IsolationError(`${cli} wrote to its working directory: ${leftovers.join(", ")}`);
      }
      return {
        ...result,
        cliVersion: version,
        durationMs: Math.round(performance.now() - started),
        attempts: i + 1,
      };
    } catch (error) {
      if (!(error instanceof MalformedOutputError)) throw error;
      lastError = error;
    } finally {
      rmSync(dirs.work, { recursive: true, force: true });
      rmSync(dirs.io, { recursive: true, force: true });
    }
  }
  throw lastError ?? new MalformedOutputError(`${cli} returned no output`);
}
