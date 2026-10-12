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
