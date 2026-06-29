# checkr — CLI Reference (v2)

---

## Installation

```bash
bun add -D @checkr/cli
# or link from monorepo: bun ../../packages/cli/src/index.js
```

---

## Commands

### `checkr run`

Run all checks against source files.

```bash
checkr run
checkr run --changed
checkr run --staged
checkr run --no-bail
checkr run --reporter json
checkr run --report ./report.json
checkr run src/
```

**Flags:**

| Flag | Config patch |
|------|--------------|
| `--config <file>` | Load config from path |
| `--no-bail` | `{ bail: false }` |
| `--no-cache` | `{ cache: false }` |
| `--clear-cache` | Delete cache dir before run |
| `--concurrency N` | `{ concurrency: N }` |
| `--no-parallel` | `{ parallel: false }` |
| `--reporter <type>` | `{ reporter }` — `default`, `json`, `compact` |
| `--report <file>` | `{ reportFile }` |
| `--verbose` | `{ verbose: true }` |
| `--ignore-marker <s>` | `{ ignoreMarker }` |
| `--gitignore <path>` | `{ gitignore }` |
| `--no-gitignore` | `{ gitignore: null }` |
| `--checks-dir <path>` | `{ checksDir }` |
| `--fixes-dir <path>` | `{ fixesDir }` |
| `--changed` | `{ scanMode: 'changed' }` |
| `--staged` | `{ scanMode: 'staged' }` |
| `--skip a,b,c` | `{ skip: [...] }` |
| `--only a,b` | `{ only: [...] }` |
| `--steps a,b,c` | `{ stepOrder: [...] }` |
| `--disable <id>` | `{ disable: [...] }` |
| `--enable <id>` | `{ enable: [...] }` |
| `[path]` | `{ scanPath }` |

**Exit codes:** `0` pass, `1` fail

---

### `checkr list`

List discovered checks.

```bash
checkr list
```

---

### `checkr validate`

Validate check/fix file naming and exports without running checks.

```bash
checkr validate
```

---

### `checkr init`

Scaffold `.checkr/checks`, `.checkr/fixes`, and `checkr.config.js`.

```bash
checkr init
```

---

### `checkr fix`

Not yet implemented (post-MVP).

---

## Global flags

| Flag | Description |
|------|-------------|
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show version |

---

## Examples

```bash
# Run all checks
checkr run

# Only changed files
checkr run --changed

# JSON for CI
checkr run --reporter json --report ./checkr-report.json

# Pre-commit hook
checkr run --staged
```
