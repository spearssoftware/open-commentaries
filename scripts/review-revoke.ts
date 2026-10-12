import { revokeToken } from "../src/review/client.ts";

const id = Number(process.argv[2]);
if (!Number.isInteger(id)) throw new Error("Usage: just review-revoke <token id>");
await revokeToken(id);
console.log(`Revoked token ${id}`);
