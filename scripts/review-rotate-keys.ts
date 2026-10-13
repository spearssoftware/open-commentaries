// Generates a fresh salt and maintainer token, stores the salt and the token's hash as Worker
// secrets, and writes the token to .env.local. Nothing secret is printed. Rotating the salt
// invalidates every existing reviewer link.
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateToken, hashToken } from "../review-site/src/tokens.ts";

const root = join(import.meta.dir, "..");
const envPath = join(root, ".env.local");

const salt = generateToken("");
const token = generateToken("");
const secrets = {
  REVIEW_TOKEN_SALT: salt,
  MAINTAINER_TOKEN_HASH: await hashToken(salt, token),
};

const proc = Bun.spawn(["npx", "wrangler", "secret", "bulk"], {
  cwd: join(root, "review-site"),
  stdin: new TextEncoder().encode(JSON.stringify(secrets)),
  stdout: "inherit",
  stderr: "inherit",
});
if ((await proc.exited) !== 0) {
  throw new Error(
    "wrangler secret bulk failed (see its output above); check `npx wrangler whoami` and that the Worker is deployed, then retry",
  );
}

const lines = existsSync(envPath) ? readFileSync(envPath, "utf8").split("\n") : [];
const isTokenLine = (line: string) => line.startsWith("MAINTAINER_TOKEN=");
const fileToken = lines.find(isTokenLine)?.slice("MAINTAINER_TOKEN=".length);
const kept = lines.filter((line) => line && !isTokenLine(line));
writeFileSync(envPath, `${[...kept, `MAINTAINER_TOKEN=${token}`].join("\n")}\n`, { mode: 0o600 });
chmodSync(envPath, 0o600);
// Bun loads .env.local only for variables the shell has not already set.
if (process.env.MAINTAINER_TOKEN && process.env.MAINTAINER_TOKEN !== fileToken) {
  console.warn("MAINTAINER_TOKEN is exported in this shell and overrides .env.local; unset it.");
}
console.log(
  "Rotated REVIEW_TOKEN_SALT and MAINTAINER_TOKEN_HASH; MAINTAINER_TOKEN written to .env.local. Admin calls may return 403 for up to a minute while the secrets propagate.",
);
