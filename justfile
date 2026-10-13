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
    Then, after the first deploy, from the repo root:
      just review-rotate-keys                           # sets both secrets and writes .env.local
    EOF
    if grep -q REPLACE_ME review-site/wrangler.jsonc; then
      echo "review-site/wrangler.jsonc still contains REPLACE_ME; create the D1 database and set database_id first." >&2
      exit 1
    fi
    cd review-site && npm ci && npm run deploy

# Generate a new salt and maintainer token, set both Worker secrets, and write .env.local (invalidates all review links).
[confirm("This invalidates every review link already issued. Continue?")]
review-rotate-keys:
    bun scripts/review-rotate-keys.ts

# Collect glossary candidates from both models, one isolated call per chapter. Resumable.
glossary-candidates book:
    bun scripts/glossary-candidates.ts "$1"

# Stamp today's approval date into the glossaries (Kevin, after review).
glossary-approve:
    bun scripts/glossary-approve.ts

# Check that the glossaries cover every candidate and carry an approval date (required before Stage 1).
glossary-check:
    bun scripts/glossary-check.ts

# Browse ingested sections and triage the glossaries in a local page (http://127.0.0.1:4173).
review-local book="John":
    bun scripts/review-local.ts "$1"
