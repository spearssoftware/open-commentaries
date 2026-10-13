// Generates a fresh salt and maintainer token, stores the salt and the token's hash as Worker
// secrets, and writes the token to .env.local. Nothing secret is printed. Rotating the salt
// invalidates every existing reviewer link.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
  throw new Error("wrangler secret bulk failed; run `npx wrangler login` and retry");
}

const kept = existsSync(envPath)
  ? readFileSync(envPath, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("MAINTAINER_TOKEN="))
  : [];
writeFileSync(envPath, `${[...kept, `MAINTAINER_TOKEN=${token}`].join("\n")}\n`, { mode: 0o600 });
console.log(
  "Rotated REVIEW_TOKEN_SALT and MAINTAINER_TOKEN_HASH; MAINTAINER_TOKEN written to .env.local. Allow a few seconds for the new secrets to reach the edge.",
);
