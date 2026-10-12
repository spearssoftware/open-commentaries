import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// Runs the suite inside workerd with a real local D1 from wrangler.jsonc. The two secrets are
// injected here with test values: MAINTAINER_TOKEN_HASH = SHA-256("test-salt:test-maintainer").
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            REVIEW_TOKEN_SALT: "test-salt",
            MAINTAINER_TOKEN_HASH: "7fd03cdc9d2018f09889565fa59dc2ae243896bb3ec7678c5b9d45e7e70747d8",
          },
        },
      },
    },
  },
});
