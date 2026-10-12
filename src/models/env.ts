import { homedir } from "node:os";
import { join } from "node:path";

/** The only variables a model CLI ever receives. Credentials and Claude Code session state are never passed. */
const ENV_ALLOWLIST = ["HOME", "PATH", "TMPDIR", "USER", "LANG"] as const;

/** Codex's dedicated home: its own login and nothing else, so Kevin's main config never loads. */
export const CODEX_HOME = join(homedir(), ".local/share/open-commentaries/codex-home");

export function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  env.LANG ??= "en_US.UTF-8";
  return { ...env, ...extra };
}
