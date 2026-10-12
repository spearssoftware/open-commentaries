# Task runner for open-commentaries. `just` with no arguments lists these.

set positional-arguments

[private]
default:
    @just --list

# Install dependencies.
setup:
    bun install
    npm ci --prefix review-site

# CI gate: lint, type-check, and tests.
check: lint typecheck test review-site-check

# Run the unit and integration tests.
test *args:
    bun test "$@"

# Lint and check formatting.
lint:
    bunx biome check .

# Type-check without emitting.
typecheck:
    bunx tsc --noEmit

# Apply formatting and safe lint fixes.
fmt:
    bunx biome check --write .

# Download the pinned sources (first run) or report upstream drift (later runs).
fetch-sources:
    bun scripts/fetch-sources.ts

# Re-hash the committed sources offline against sources/manifest.json.
verify-sources:
    bun test tests/sources.test.ts

# Parse the sources into section state files, e.g. `just ingest John`.
ingest book:
    bun scripts/ingest.ts "$1"

# Make one real isolated call to each model CLI and check that nothing leaks in.
probe-models:
    bun scripts/probe-models.ts

# Upload a book's sections for review, e.g. `just review-deploy John 1-3`.
review-deploy book chapters:
    bun scripts/review-deploy.ts "$1" "$2"

# Create a private review link, e.g. `just review-assign pastor John 1-3`.
review-assign reviewer book chapters:
    bun scripts/review-assign.ts "$1" "$2" "$3"

# Revoke a review link by its token id.
review-revoke id:
    bun scripts/review-revoke.ts "$1"

# Pull reviewer decisions into the section state files and reviews/private/.
import-reviews:
    bun scripts/import-reviews.ts

# Type-check and test the review site.
review-site-check:
    cd review-site && npm run typecheck && npx vitest run

# Deploy the review site (one-time Cloudflare setup is printed first).
review-site-deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    cat <<'EOF'
    One-time setup (from review-site/):
      npx wrangler login
      npx wrangler d1 create open-commentaries-review   # put the id in wrangler.jsonc
      SALT=$(openssl rand -hex 32); echo "$SALT"; npx wrangler secret put REVIEW_TOKEN_SALT
      TOKEN=$(openssl rand -base64 32); echo "$TOKEN"
      printf '%s' "$SALT:$TOKEN" | shasum -a 256         # npx wrangler secret put MAINTAINER_TOKEN_HASH
      export MAINTAINER_TOKEN="$TOKEN"                   # for the review-* recipes
    EOF
    if grep -q REPLACE_ME review-site/wrangler.jsonc; then
      echo "review-site/wrangler.jsonc still contains REPLACE_ME; create the D1 database and set database_id first." >&2
      exit 1
    fi
    cd review-site && npm ci && npm run deploy
