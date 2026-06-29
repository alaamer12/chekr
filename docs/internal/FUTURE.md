# checkr — Future Vision

This document captures planned evolution beyond the v1.x/v2.x roadmap. These are not committed features — they are directional decisions that shape how v1.x is built so it doesn't block v3.x.

---

## F-01: Multi-language support via independent binary

**Current state (v1.x):** checkr is a Node.js tool. Rule files are JS/TS. Source files scanned are JS/TS. The engine is coupled to the Node.js runtime.

**Future state (v3.x):** checkr ships as a standalone binary (`.exe` on Windows, native binary on macOS/Linux) with no Node.js dependency. Rule files can be written in any language that compiles to the binary's plugin interface.

**Why this matters:**
- Python projects, Rust projects, Go projects all have AI-generated code that drifts from design contracts
- A Node.js tool is a hard dependency for non-JS projects — a binary has no runtime dependency
- Performance: a compiled binary can scan 10x more files per second than a Node.js process

**How it works:**
- The engine core is rewritten in a compiled language (Rust is the likely candidate — fast, cross-platform, excellent binary distribution)
- Rule files communicate with the engine via a defined IPC protocol (stdin/stdout JSON or a shared library interface)
- Language-specific SDKs provide the rule authoring utilities (`@checkr/sdk-js`, `checkr-sdk-python`, etc.)
- The binary is distributed via npm (`@checkr/cli` becomes a thin wrapper that downloads the platform binary), Homebrew, and direct download

**Migration path from v1.x:**
- Existing JS/TS rule files continue to work via the JS SDK
- No rule rewrites required for JS/TS projects
- New projects on other languages use the native SDK for their language

---

## F-02: Single-line ignore comments

**Current state (v1.x):** Only block-style ignore comments are supported:
```js
// @checkr-ignore-start
const raw = '#5B8FF9'
// @checkr-ignore-end
```

**Future state (v2.x):** Single-line ignore on the next line:
```js
// @checkr-ignore-next
const raw = '#5B8FF9'
```

And inline ignore on the same line:
```js
const raw = '#5B8FF9' // @checkr-ignore
```

**Why deferred:** Block ignores cover all cases. Single-line ignores are a convenience feature. Adding them in v1.x would complicate `buildIgnoredLines()` and the ignore block parser before the core is stable.

**Implementation note:** `buildIgnoredLines()` in `@checkr/utils` will be extended to return a `Set<number>` that includes:
- All lines inside `@checkr-ignore-start` / `@checkr-ignore-end` blocks (existing)
- The line immediately following `@checkr-ignore-next` (new)
- Lines containing `@checkr-ignore` as an inline comment (new)

Rule authors don't need to change their code — they already call `ignored.has(lineNum)` and the set will just contain more line numbers.

---

## F-03: Comment type configuration

**Current state (v1.x):** Ignore markers use `//` (JS/TS single-line comment syntax) hardcoded.

**Future state (v2.x):** The comment syntax is configurable per file type:

```js
// checkr.config.js
export default {
  ignoreMarker: '@checkr-ignore',
  commentStyles: {
    '.py':   '#',      // Python
    '.rb':   '#',      // Ruby
    '.rs':   '//',     // Rust
    '.go':   '//',     // Go
    '.java': '//',     // Java
    '.css':  '/*',     // CSS block comments
    '.html': '<!--',   // HTML
  }
}
```

This is a prerequisite for F-01 (multi-language support) — you can't ignore lines in Python files with `//` comments.

---

## F-04: Git hooks integration

**Current state (v1.x):** checkr can be manually added to git hooks. `checkr run --staged` is designed for pre-commit use but requires manual hook setup.

**Future state (v2.x):** First-class git hook support:

```bash
checkr hooks install          # install pre-commit hook
checkr hooks install --pre-push  # install pre-push hook
checkr hooks uninstall        # remove hooks
checkr hooks status           # show installed hooks
```

The installed hook runs `checkr run --staged` automatically on every commit. No manual `.git/hooks/` editing required.

**Integration with popular hook managers:**
- `husky` — generate husky config
- `lint-staged` — generate lint-staged config that runs checkr on staged files
- `lefthook` — generate lefthook config

```bash
checkr hooks install --husky
checkr hooks install --lint-staged
checkr hooks install --lefthook
```

---

## F-05: Dependency reduction

**Current state (v1.x):** checkr uses npm dependencies for convenience during initial development:
- `fast-glob` — file walking
- `chokidar` — file watching (watch mode)
- `picocolors` or `chalk` — terminal colors
- Possibly a minimal arg parser

**Future state (v2.x → v3.x):** Progressive replacement of dependencies with purpose-built implementations:

| Dependency | Replacement | When |
|------------|-------------|------|
| `fast-glob` | Custom file walker using `fs.readdir` recursively | v2.x |
| `chokidar` | Native `fs.watch` wrapper | v2.x |
| `chalk` / `picocolors` | Inline ANSI escape codes | v1.x (already simple) |
| Arg parser | Custom 50-line parser | v1.x |

**Rationale:** Each dependency is a potential supply chain risk, a version conflict source, and a maintenance burden. The operations checkr needs (walk files, watch files, color output, parse args) are simple enough to implement in < 200 lines each. The goal is `@checkr/core` with zero runtime dependencies by v2.x.

**Note:** Rule files can still use any dependencies they want — this only applies to the engine itself.

---

## F-06: Watch mode (full spec)

**Current state:** Planned for v1.3 (see ROADMAP.md) but not yet designed in detail.

**Full design:**

```
checkr watch
  │
  ├─ Phase 1: Initial full run
  │     Run all checks against all files
  │     Display results
  │     Print "Watching for changes..."
  │
  └─ Phase 2: Incremental loop
        On file save:
          Re-read changed file
          Run all checks against that file only
          Merge results with previous run
            (replace old results for this file, keep others)
          Re-render full results panel
          Show diff: "2 violations fixed, 1 new violation"
        
        On check file save (in .checkr/checks/):
          Reload the changed check
          Re-run that check against ALL files
          (the rule changed, not the source — full re-check for that rule)
        
        On config file save:
          Reload config
          Full re-run
```

**Terminal UI in watch mode:**
```
checkr watch — 847 files, 12 checks

✅ check_ipc_direct          (0 violations)
✅ check_capability_deps     (0 violations)
❌ check_raw_sizes           (3 violations)
  src/Button.tsx:42  Raw px value "16px"
  src/Card.tsx:18    Raw px value "32px"
  src/Modal.tsx:91   Raw px value "8px"

Watching... Last check: 0.3s ago  [q to quit]
```

On fix:
```
✅ check_raw_sizes           (0 violations)  ← was 3, now 0

3 violations fixed. All checks passing. ✨
```

**Key behaviors:**
- Never exits on violation — watch mode is for development, not CI
- Ctrl+C or `q` to quit
- `r` to force full re-run
- Results persist between saves — fixing one file doesn't re-check others

---

## F-07: Rule testing utilities (`@checkr/testing`)

**Future package:** `@checkr/testing` — utilities for writing tests for your rules.

```js
import { expectViolation, expectNoViolation, expectFix } from '@checkr/testing'
import { checkRawColors } from '../.checkr/checks/check_raw_colors.js'
import { fixRawColors } from '../.checkr/fixes/fix_raw_colors.js'

// Assert a violation is detected
expectViolation(checkRawColors, {
  source: 'const color = "#5B8FF9"',
  filePath: 'src/Button.tsx',
  message: /raw hex color/i,
  line: 1,
})

// Assert no violation
expectNoViolation(checkRawColors, {
  source: 'const color = palette.blue[500]',
  filePath: 'src/Button.tsx',
})

// Assert fix produces correct output
expectFix(fixRawColors, {
  source: 'const color = "#5B8FF9"',
  expected: 'const color = palette.blue[500]',
})
```

This makes rule development test-driven and prevents regressions when rules are updated.

---

## Architectural constraints for v1.x

These decisions in v1.x are made specifically to not block the future items above:

1. **`buildIgnoredLines()` returns `Set<number>`** — adding single-line ignore support only requires adding more line numbers to the set. Rule authors don't change their code.

2. **Rule contract is `(source, filePath) => Violation[]`** — this signature works for any language's source files. The binary version (F-01) uses the same contract over IPC.

3. **Engine has no knowledge of JS/TS** — it treats source files as strings. The JS/TS-specific logic lives in the rules, not the engine. This makes the engine language-agnostic from day one.

4. **Config is a JS module** — when the binary lands (F-01), config can be JSON or TOML for non-JS projects. The JS module format is the JS-specific default, not a hard requirement.

---

## F-08: HTML report output

**Current state (v1.x):** checkr outputs to stdout in three formats: `default` (colored terminal), `json`, and `compact`. All are text-based.

**Future state (v2.x):** A fourth reporter — `html` — generates a self-contained HTML file with a full interactive violation report.

```bash
checkr run --reporter html --report ./checkr-report.html
```

**What the HTML report includes:**

- Summary header — total violations, files scanned, time taken, pass/fail status
- Step-by-step breakdown — each check as a collapsible section
- Per-violation detail — file path (clickable if served locally), line number, offending text, message, fix hint
- Ignored blocks report — a separate section listing every `@checkr-ignore` block in the codebase with file, line range, and the comment explaining why it was suppressed
- Syntax-highlighted source context — 3 lines before and after each violation
- Filter controls — filter by step, severity, file path
- Copy-to-clipboard for violation details

**Why HTML over JSON for humans:**

JSON is for machines — CI systems, scripts, dashboards. HTML is for humans who want to review a full violation report without a terminal. Useful for:
- Sharing a report with a team member who doesn't have the repo checked out
- Attaching to a PR review as an artifact
- Reviewing a large batch of violations from an AI generation session before deciding what to fix

**The ignored blocks section** is particularly valuable — it gives visibility into every suppression in the codebase so suppressions don't silently accumulate. A reviewer can see at a glance whether ignore blocks are justified or lazy.

**Self-contained:** The HTML file has no external dependencies — all CSS and JS is inlined. It opens correctly from the filesystem without a server.

**Implementation note:** The HTML reporter is a separate module in `@checkr/core/reporters/html.js`. It receives the same `ReportResult` object as the JSON reporter and renders it to a string. No new data structures needed — the existing violation and step result types are sufficient.

---

## F-09: Safe violations database (`--save-safe`)

**Current state (v1.x):** Every violation found is reported on every run. The only way to suppress a violation is to add an `@checkr-ignore` block in the source file. There is no way to acknowledge a violation as intentional without modifying source.

**Future state (v2.x):** A local SQLite database (`.checkr/safe.db`) records violations that have been explicitly marked safe. On subsequent runs, violations matched against the database are silently skipped — they do not appear in output and do not affect the exit code.

---

### Commands

```bash
# Mark all current violations as safe
checkr run --save-safe

# Mark violations from a saved JSON report as safe
checkr violations.json --save-safe

# Wipe the entire safe database
checkr --reset
```

---

### The `--save-safe` flag

When `--save-safe` is passed alongside `checkr run`, the engine runs normally, collects all violations, then writes each one to the database before exiting with code `0`.

```bash
checkr run --save-safe
# → Runs all checks
# → Finds N violations
# → Saves each violation as safe in .checkr/safe.db
# → Exits 0
# → Output: "N violations saved as safe."
```

On the next run (without `--save-safe`), those violations are looked up in the database and suppressed:

```bash
checkr run
# → Runs all checks
# → Finds N violations
# → Filters out the N safe violations
# → Exits 0 (nothing left to report)
```

---

### Reading from a violations JSON file

`checkr violations.json --save-safe` accepts a path to a JSON report (produced by `checkr run --reporter json --report violations.json`) and marks every violation in that file as safe, without re-running the checks.

```bash
# Step 1: generate a report
checkr run --reporter json --report violations.json

# Step 2: review the report, decide these are acceptable

# Step 3: mark them all safe
checkr violations.json --save-safe
# → "47 violations from violations.json saved as safe."
```

This is useful when a large AI generation session introduces many violations that are all intentional — you can review the JSON once and bulk-approve rather than running `--save-safe` interactively.

---

### How matching works — the context block hypothesis

A violation is not matched by file path + line number alone. Line numbers shift as code is edited. Instead, each safe record stores a **context block**: the lines immediately surrounding the violation at the time it was saved.

```
context_before  — up to 3 lines before the violation line
violation_line  — the exact text of the violating line
context_after   — up to 3 lines after the violation line
```

On a subsequent run, when a violation is found at `src/Button.tsx:42`, checkr reads the actual file and extracts the same window around line 42. It then checks the database for a safe record where:

1. `file_path` matches (normalized, repo-relative)
2. `check_id` matches
3. The stored context block matches the current context block (exact string match)

If all three match, the violation is considered safe. If the surrounding code has changed — even one line — the match fails and the violation surfaces again. This prevents the database from silently suppressing violations after the code has been refactored in a meaningful way.

**What "safe" means under this model:** the specific block of code that was violating, in its exact form, was reviewed and accepted. If that block changes, the acceptance lapses and the violation must be re-reviewed. This is intentional — it keeps the database honest as the codebase evolves.

---

### The `--reset` flag

```bash
checkr --reset
```

Deletes `.checkr/safe.db` entirely. All safe records are discarded. The next `checkr run` will report all violations as if `--save-safe` had never been used.

A confirmation prompt is shown before deletion:

```
This will delete .checkr/safe.db and remove all 47 safe violation records.
Are you sure? (y/N)
```

Pass `--yes` to skip the prompt in scripts:

```bash
checkr --reset --yes
```

---

### Database schema (SQLite)

```sql
CREATE TABLE safe_violations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path     TEXT    NOT NULL,   -- normalized, repo-relative path
  check_id      TEXT    NOT NULL,   -- e.g. "check_raw_colors"
  line          INTEGER NOT NULL,   -- line number at time of saving (informational)
  violation_line TEXT   NOT NULL,   -- exact text of the violating line
  context_before TEXT   NOT NULL,   -- up to 3 lines before, joined by \n
  context_after  TEXT   NOT NULL,   -- up to 3 lines after, joined by \n
  message       TEXT    NOT NULL,   -- violation message at time of saving
  saved_at      TEXT    NOT NULL,   -- ISO 8601 timestamp
  source        TEXT    NOT NULL    -- "run" | "json-import"
);

CREATE UNIQUE INDEX idx_safe_violations_context
  ON safe_violations (file_path, check_id, violation_line, context_before, context_after);
```

The `UNIQUE INDEX` on `(file_path, check_id, violation_line, context_before, context_after)` means re-saving the same violation is a no-op (`INSERT OR IGNORE`).

---

### `.checkr/safe.db` and version control

The safe database is a local file. Whether to commit it is a project decision:

- **Commit it** — the team shares a common set of accepted violations. `--save-safe` on one machine is respected by everyone.
- **Gitignore it** — each developer maintains their own safe set. Useful for personal development workflows where one developer wants to ignore noise that others still want to see.

checkr does not make this decision — it only creates the file. The project's `.gitignore` controls whether it is shared.

---

### Interaction with `@checkr-ignore` blocks

`@checkr-ignore` blocks in source files take precedence and are evaluated first. Lines inside an ignore block never reach the safe database lookup. The database is only consulted for violations that survive the ignore-block filter.

This means `@checkr-ignore` is still the right tool for permanent, code-level suppressions. `--save-safe` is for project-level or developer-level acceptance of violations that cannot or should not be annotated in source (third-party files, generated files, intentional one-off exceptions).

---

### Architectural note for v1.x

The safe database is designed so it does not change the rule contract or the violation data shape. It is a filter applied in the engine's reporting layer, after all violations are collected. Rules have no knowledge of the database. This means:

- The database can be added without touching any rule files
- `buildIgnoredLines()` is unchanged — the database operates at a different layer
- The `Violation` type gains no new fields — context extraction happens inside the engine when saving and matching

The only new engine surface is a `SafeDB` module in `@checkr/core/safe-db.js` with four operations: `open()`, `save(violations[])`, `filter(violations[]) → violations[]`, and `reset()`.

---

## F-10: Severity levels

**Current state (v1.x):** All checks are equal — a violation is a violation. Every check contributes to the exit code. There is no way to distinguish noise from a hard failure.

**Future state (v1.8):** Each check declares a severity level. The engine filters and reports violations by level. Only checks at or above the active threshold affect the exit code.

---

### The three levels

| Level | Alias | Meaning |
|-------|-------|---------|
| `1`   | `info`    | Informational — flag it, never block a commit |
| `2`   | `warning` | Worth fixing, but not blocking |
| `3`   | `error`   | Hard violation — blocks CI, fails the run |

**Default:** all checks are `error` (level 3) unless explicitly set. Existing check files require no changes — they behave exactly as before.

---

### Setting severity in a check file

A check file exports its severity via a `severity` named export alongside its check function:

```js
// .checkr/checks/check_raw_colors.js

export const severity = 'error'   // level 3 — default, can be omitted

export function checkRawColors(source, filePath) {
  // ...
}
```

```js
// .checkr/checks/check_todo_comments.js

export const severity = 'info'   // level 1 — never blocks

export function checkTodoComments(source, filePath) {
  // ...
}
```

```js
// .checkr/checks/check_deprecated_api.js

export const severity = 'warning'   // level 2

export function checkDeprecatedApi(source, filePath) {
  // ...
}
```

Numeric aliases work too — `export const severity = 2` is identical to `'warning'`.

The `severity` export is optional. If absent, the engine treats the check as `error`.

---

### Overriding severity in config

Severity can also be set or overridden per check in `checkr.config.js`, without touching the check file itself:

```js
// checkr.config.js
export default {
  rules: {
    'check_todo_comments':  'info',     // downgrade
    'check_deprecated_api': 'warning',  // explicit
    'check_raw_colors':     'error',    // default, explicit for clarity
  }
}
```

Config takes precedence over the check file's own `severity` export. This lets a project tune severity for third-party rule packages without forking them.

---

### The `--level` flag

```bash
checkr run --level error      # only error-level checks (default)
checkr run --level warning    # warning + error
checkr run --level info       # all checks — info + warning + error
```

Numeric aliases:

```bash
checkr run --level 3   # same as --level error
checkr run --level 2   # same as --level warning
checkr run --level 1   # same as --level info
```

`--level` sets the **minimum** severity to include. Checks below the threshold are skipped entirely — they don't run, don't produce output, and don't affect the exit code.

**Default behavior (no `--level` flag):** only `error`-level checks run. This means adding a new `info` or `warning` check to a project does not change CI behavior until someone explicitly opts in with `--level`.

---

### Exit code behavior by level

| Check level | `--level error` (default) | `--level warning` | `--level info` |
|-------------|--------------------------|-------------------|----------------|
| `error`     | ✅ runs, affects exit code | ✅ runs, affects exit code | ✅ runs, affects exit code |
| `warning`   | ⏭ skipped                 | ✅ runs, affects exit code | ✅ runs, affects exit code |
| `info`      | ⏭ skipped                 | ⏭ skipped          | ✅ runs, affects exit code |

All levels that run affect the exit code equally — a `warning` violation still exits `1` when `--level warning` is active. The level controls what runs, not what counts.

---

### Output display

The default reporter prefixes each violation with its level:

```
❌ check_raw_colors        (2 violations)  [error]
  src/Button.tsx:14   Raw hex color "#5B8FF9"
  src/Card.tsx:8      Raw hex color "#FF4D4F"

⚠️  check_deprecated_api   (1 violation)   [warning]
  src/api.ts:33       Use of deprecated endpoint /v1/users

ℹ️  check_todo_comments     (4 violations)  [info]
  src/Button.tsx:22   TODO: replace with design token
  src/Card.tsx:41     TODO: remove after migration
  src/Modal.tsx:7     TODO: add aria-label
  src/api.ts:19       TODO: handle error case
```

Compact and JSON reporters include the level field on each violation and step result.

---

### Typical usage patterns

**CI (strict)** — only hard failures block the pipeline:
```bash
checkr run                        # default: --level error
```

**CI (with warnings surfaced)** — warnings appear in output but a warning-only run still exits 0 if that's desired... or exits 1 to enforce them:
```bash
checkr run --level warning
```

**Local development** — see everything including informational notes:
```bash
checkr run --level info
```

**Pre-commit hook** — fast, errors only:
```bash
checkr run --staged               # default level: error
```

---

### Architectural note for v1.x

The `severity` field is added to the check's metadata object, which the engine already builds during rule discovery. The filter runs once at startup — checks below the active level are dropped from the execution list before any file scanning begins. Rules below the threshold don't run at all; they don't incur any performance cost.

The `Violation` type gains a `severity` field (inherited from the check that produced it) so reporters can display and filter it. The field is informational — the engine does not use it per-violation, only per-check at startup.
