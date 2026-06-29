# chekr — CLI Reference (v2)

---

## Installation

```bash
bun add -D @chekr/cli
# or link from monorepo: bun ../../packages/cli/src/index.js
```

---

## Commands

### `chekr run`

Run all checks against source files.

```bash
chekr run
chekr run --changed
chekr run --staged
chekr run --no-bail
chekr run --reporter json
chekr run --report ./report.json
chekr run src/
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

### `chekr list`

List discovered checks.

```bash
chekr list
```

---

### `chekr validate`

Validate check/fix file naming and exports without running checks.

```bash
chekr validate
```

---

### `chekr init`

Scaffold `.chekr/checks`, `.chekr/fixes`, and `chekr.config.js`.

```bash
chekr init
```

---

### `chekr fix`

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
chekr run

# Only changed files
chekr run --changed

# JSON for CI
chekr run --reporter json --report ./chekr-report.json

# Pre-commit hook
chekr run --staged
```
