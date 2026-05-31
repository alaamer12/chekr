# checkr — CLI Reference

---

## Installation

```bash
npm install -g @checkr/cli
# or
bun add -g @checkr/cli
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
checkr run --level warning
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--changed` | Only scan files changed since last commit |
| `--staged` | Only scan staged files |
| `--no-bail` | Run all steps even if one fails |
| `--no-cache` | Disable result caching |
| `--concurrency N` | Set parallel worker count |
| `--reporter <type>` | Output format: `default`, `json`, `compact`, `html` |
| `--report <file>` | Write report to file |
| `--level <level>` | Minimum severity to run: `info`/`1`, `warning`/`2`, `error`/`3` (default: `error`) |
| `--verbose` | Show all files, not just violations |
| `--config <file>` | Path to config file |

**Exit codes:**
- `0` — all checks passed
- `1` — one or more checks failed

---

### `checkr fix`

Run all fixers. Dry-run by default — use `--apply` to write changes.

```bash
checkr fix                    # dry-run: show what would change
checkr fix --apply            # write changes to disk
checkr fix fix_raw_sizes      # run a specific fixer only
checkr fix --apply --changed  # fix only changed files
```

**Passing inner args to fixers** — use `--` separator:

```bash
checkr fix -- --dry-run --verbose
checkr fix fix_raw_sizes -- --only-jsx --path src/
```

Everything after `--` is passed to the fix function as the `args` array:

```js
export function fixRawSizes(source, filePath, violations, args = []) {
  const onlyJsx = args.includes('--only-jsx')
  // ...
}
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--apply` | Write changes to disk (default: dry-run) |
| `--changed` | Only fix files changed since last commit |
| `--staged` | Only fix staged files |
| `--verbose` | Show each substitution made |
| `--config <file>` | Path to config file |

---

### `checkr watch`

Watch mode — re-run checks when files change.

```bash
checkr watch
checkr watch --no-bail
```

On file change, only the changed file is re-checked. Results for unchanged files are preserved from the last run.

Press `Ctrl+C` to stop.

---

### `checkr init`

Scaffold a new checkr setup in the current directory.

```bash
checkr init
```

Creates:
```
.checkr/
  checks/
    check_example.js     ← example check with comments
  fixes/
    fix_example.js       ← example fix with comments
checkr.config.js         ← config with all options documented (project root)
```

---

### `checkr list`

List all discovered checks and their current status.

```bash
checkr list
```

Output:
```
📋 Discovered checks (5)

  Step  ID                        File
  ────  ────────────────────────  ──────────────────────────────────────────────
  1     check_ipc_direct          .checkr/checks/check_ipc_direct.js
  2     check_capability_deps     .checkr/checks/check_capability_deps.js
  18    check_raw_colors          .checkr/checks/check_raw_colors.js
  22    check_raw_sizes           .checkr/checks/check_raw_sizes.js
  24    check_pseudo_selectors    .checkr/checks/check_pseudo_selectors.js
```

---

### `checkr validate`

Validate all check and fix files without running them. Checks naming conventions and export contracts.

```bash
checkr validate
```

Output:
```
✅ .checkr/checks/check_raw_colors.js     — exports checkRawColors(source, filePath)
✅ .checkr/checks/check_raw_sizes.js      — exports checkRawSizes(source, filePath)
❌ .checkr/checks/my_check.js             — filename must start with "check_"
❌ .checkr/checks/check_broken.js         — no exported function starting with "check"
   Expected: export function checkBroken(source, filePath) { ... }
❌ .checkr/checks/check_ambiguous.js      — exports 2 functions starting with "check": checkFoo, checkBar
   Each check file must export exactly one check function
```

---

### `checkr --save-safe`

Mark violations as safe so they are silently skipped on future runs. Accepts either a live run or a saved JSON report.

```bash
# Run checks and mark every violation found as safe
checkr run --save-safe

# Mark violations from a saved JSON report as safe (no re-run)
checkr violations.json --save-safe
```

Safe records are stored in `.checkr/safe.db` (SQLite). On subsequent runs, violations whose surrounding context block matches a safe record are suppressed — they do not appear in output and do not affect the exit code.

Matching uses the lines immediately surrounding the violation (up to 3 before, up to 3 after), not just the line number. If that context changes, the safe record lapses and the violation surfaces again.

**Flags:**

| Flag | Description |
|------|-------------|
| `--save-safe` | Save all found (or imported) violations to the safe database |

---

### `checkr --reset`

Delete the safe violations database. All accepted violations are forgotten and will be reported again on the next run.

```bash
checkr --reset          # prompts for confirmation
checkr --reset --yes    # skip confirmation (for scripts/CI)
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--yes` | Skip the confirmation prompt |

---

## Global flags

These flags work with all commands:

| Flag | Description |
|------|-------------|
| `--config <file>` | Path to config file (default: `./checkr.config.js`) |
| `--version` | Print checkr version |
| `--help` | Print help |

---

## Examples

```bash
# Run only error-level checks (default)
checkr run

# Run warning + error level checks
checkr run --level warning

# Run all checks including info
checkr run --level info

# Numeric aliases work too
checkr run --level 2

# Run all checks, show all failures
checkr run --no-bail

# Only check files changed since last commit
checkr run --changed

# Only check staged files (useful as a pre-commit hook)
checkr run --staged

# Output JSON for CI integration
checkr run --reporter json --report ./checkr-report.json

# Output HTML report for human review
checkr run --reporter html --report ./checkr-report.html

# Dry-run all fixers
checkr fix

# Apply all fixers
checkr fix --apply

# Apply fixers only to changed files
checkr fix --apply --changed

# Apply a specific fixer with inner args
checkr fix fix_raw_sizes --apply -- --verbose --only-jsx

# Watch mode during development
checkr watch

# Validate rule files before committing them
checkr validate

# Mark all current violations as safe (review first, then accept)
checkr run --save-safe

# Bulk-import safe violations from a saved JSON report
checkr violations.json --save-safe

# Reset the safe violations database
checkr --reset
```

---

## Pre-commit hook

Add to `.git/hooks/pre-commit` or use with `husky`:

```bash
#!/bin/sh
checkr run --staged
```

With husky:
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "checkr run --staged"
    }
  }
}
```

---

## CI integration

```yaml
# GitHub Actions
- name: Run checkr
  run: checkr run --reporter json --report checkr-report.json

- name: Upload report
  uses: actions/upload-artifact@v3
  with:
    name: checkr-report
    path: checkr-report.json
```
