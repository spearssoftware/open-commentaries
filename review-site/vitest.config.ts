import { join } from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

// Runs the suite inside workerd with a real local D1 from wrangler.jsonc, migrated from the same
// migrations/ files that deploy uses. The two secrets are injected here with test values:
// MAINTAINER_TOKEN_HASH = SHA-256("test-salt:test-maintainer").
export default defineWorkersConfig(async () => ({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: await readD1Migrations(join(__dirname, "migrations")),
            REVIEW_TOKEN_SALT: "test-salt",
            MAINTAINER_TOKEN_HASH: "7fd03cdc9d2018f09889565fa59dc2ae243896bb3ec7678c5b9d45e7e70747d8",
          },
        },
      },
    },
  },
}));
