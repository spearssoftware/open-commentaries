// Shared behavior of the stub `claude` and `codex` executables used by the runner tests.
// Each stub asserts the isolation contract, records its invocation, and replays a scripted
// response from $TMPDIR/oc-stub/<cli>.json (one entry per call, in order).
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface StubResponse {
  output?: unknown;
  /** Text returned instead of schema output, to simulate malformed replies. */
  raw?: string;
  /** Exit non-zero with this message, like a usage limit. */
  fail?: string;
  /** Emit a tool call of this name. */
  tool?: string;
  /** Tools to list in the init event (claude only). */
  initTools?: string[];
  /** Write a file into the working directory. */
  writeFile?: boolean;
}

const REPO = resolve(import.meta.dir, "../..");
const ALLOWED_ENV = new Set(["HOME", "PATH", "TMPDIR", "USER", "LANG"]);

export function stubDir(): string {
  const dir = join(process.env.TMPDIR ?? "/tmp", "oc-stub");
  if (!existsSync(dir)) throw new Error(`stub: ${dir} does not exist`);
  return dir;
}

export function violation(message: string): never {
  console.error(`STUB VIOLATION: ${message}`);
  process.exit(97);
}

export function assertIsolation(cli: string, args: string[], extraEnv: string[] = []): void {
  const cwd = process.cwd();
  if (readdirSync(cwd).length) violation(`working directory ${cwd} is not empty`);
  if (cwd.startsWith(REPO)) violation(`working directory ${cwd} is inside the repo`);
  for (const arg of args) {
    if (arg.includes("prompts/")) violation(`argument mentions prompts/: ${arg.slice(0, 80)}`);
    if (arg.includes(REPO)) violation(`argument contains the repo path: ${arg.slice(0, 80)}`);
  }
  const allowed = new Set([...ALLOWED_ENV, ...extraEnv]);
  const extra = Object.keys(process.env).filter((k) => !allowed.has(k) && !isRuntimeVar(k));
  if (extra.length) violation(`${cli} received environment variables ${extra.join(", ")}`);
}

/** Variables Bun sets for its own child processes. */
function isRuntimeVar(key: string): boolean {
  return key === "_" || key === "PWD" || key === "OLDPWD" || key === "SHLVL";
}

export function requireFlags(args: string[], flags: (string | [string, string])[]): void {
  for (const flag of flags) {
    if (typeof flag === "string") {
      if (!args.includes(flag)) violation(`missing flag ${flag}`);
      continue;
    }
    const at = args.indexOf(flag[0]);
    if (at < 0 || args[at + 1] !== flag[1])
      violation(`missing ${flag[0]} ${JSON.stringify(flag[1])}`);
  }
}

/** Records the call and returns the next scripted response. */
export function nextResponse(cli: string, record: Record<string, unknown>): StubResponse {
  const dir = stubDir();
  const log = join(dir, `${cli}.calls.jsonl`);
  const calls = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).length : 0;
  appendFileSync(log, `${JSON.stringify(record)}\n`);
  const script = JSON.parse(readFileSync(join(dir, `${cli}.json`), "utf8")) as StubResponse[];
  const response = script[calls];
  if (!response)
    violation(`${cli} called ${calls + 1} times but only ${script.length} responses are scripted`);
  return response;
}

export async function readStdin(): Promise<string> {
  return await new Response(Bun.stdin.stream()).text();
}
