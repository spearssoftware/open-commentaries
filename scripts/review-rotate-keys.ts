// Generates a fresh salt and maintainer token, stores the salt and the token's hash as Worker
// secrets, and writes the token to .env.local. Nothing secret is printed. Rotating the salt
// invalidates every existing reviewer link.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const envPath = join(root, ".env.local");

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

const salt = hex(crypto.getRandomValues(new Uint8Array(32)));
const token = hex(crypto.getRandomValues(new Uint8Array(32)));
const hash = hex(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${token}`)),
);

async function putSecret(name: string, value: string): Promise<void> {
  const proc = Bun.spawn(["npx", "wrangler", "secret", "put", name], {
    cwd: join(root, "review-site"),
    stdin: new TextEncoder().encode(value),
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await proc.exited) !== 0) {
    throw new Error(`wrangler secret put ${name} failed; run \`npx wrangler login\` and retry`);
  }
}

const kept = existsSync(envPath)
  ? readFileSync(envPath, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("MAINTAINER_TOKEN="))
  : [];
writeFileSync(envPath, `${[...kept, `MAINTAINER_TOKEN=${token}`].join("\n")}\n`, { mode: 0o600 });

await putSecret("REVIEW_TOKEN_SALT", salt);
await putSecret("MAINTAINER_TOKEN_HASH", hash);
console.log(
  "Rotated REVIEW_TOKEN_SALT and MAINTAINER_TOKEN_HASH; MAINTAINER_TOKEN written to .env.local",
);
