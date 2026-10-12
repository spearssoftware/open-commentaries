# Task runner for open-commentaries. `just` with no arguments lists these.

set positional-arguments

[private]
default:
    @just --list

# Install dependencies.
setup:
    bun install

# CI gate: lint, type-check, and tests.
check: lint typecheck test

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
