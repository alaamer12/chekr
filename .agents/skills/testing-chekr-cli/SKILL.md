---
name: testing-chekr-cli
description: Test the chekr CLI tool end-to-end. Use when verifying CLI commands, flag handling, and output formatting.
---

# Testing chekr CLI

## Environment Setup

- **Package manager**: bun (not npm/yarn)
- **Run CLI**: `node packages/cli/src/index.js <command> [flags]`
- **Run from another repo**: `node /absolute/path/to/chekr/packages/cli/src/index.js <command>` from target repo's cwd
- **Link to another project**: Use absolute path to chekr's index.js entry point. No npm link needed.

## Key Commands

```bash
# Lint
bun run lint

# Type check
bun run typecheck

# Run all CLI tests
bun run test:cli

# Run specific test directory
bun run test:cli -- --run packages/cli/__tests__/core/graph/

# Full verify (lint + typecheck + test + smoke)
bun run verify

# Smoke test
bun run smoke
```

## Testing the `chekr index` Command

The `chekr index` command is experimental and requires `@ladybugdb/core` native addon for full graph functionality.

### Graceful Degradation

The native addon might not be available on all platforms. When missing:
- `chekr index` still runs the pipeline but reports all files as "skipped"
- `chekr index --status` shows "Graph engine not available" message
- No process.dlopen crash (engine pre-checks for `.node` binary existence)

### Flags to Test

| Flag | Expected Behavior |
|------|------------------|
| (none) | Full or incremental index, shows progress + stats |
| `--status` | Show graph stats or "engine not available" |
| `--reset` | Delete `.chekr-graph/` dir, safe on missing dir |
| `--full` | Force full rebuild, shows "Full rebuild requested" |
| `--verbose` | Print warning details inline instead of just count |

### Command Routing

The `index` command must be registered in `packages/cli/src/argv/parse-argv.js`:
- `COMMANDS` set must include `"index"`
- `BOOLEAN_FLAGS` set must include `"full"`, `"status"`, `"reset"`

Without this, `chekr index` falls through to the default `run` command.

### Testing Against Another Repo

To test file scanning on a large codebase:
```bash
cd /path/to/large-repo
node /path/to/chekr/packages/cli/src/index.js index
```

The output should show:
- "Files in scope: N" (matching the repo's JS/TS file count)
- "Git HEAD: <hash>" (if it's a git repo)
- Stats section with Total/Indexed/Skipped/Warnings

### Known Limitation

LadybugDB (`@ladybugdb/core`) might not ship prebuilt binaries for all platforms. If the native `.node` binary is missing, the engine falls back to no-op mode. Full graph testing requires macOS arm64/x86_64 or Linux x86_64 with glibc.

## Devin Secrets Needed

None — this is a local CLI tool with no external service dependencies.
