# checkr — Roadmap

---

## v1.0 — Core (MVP)

The minimum viable tool. Everything needed to replace the current `check-all.js` script with a proper engine.

**Engine**
- [ ] Rule discovery — auto-discover `check_*.js` files
- [ ] Rule validation — check naming conventions and export contracts at startup
- [ ] Single-pass file reading — read each file once, pass to all checks
- [ ] Sequential step execution with bail support
- [ ] Violation collection and reporting
- [ ] Exit code 0/1

**CLI**
- [ ] `checkr run` — full scan
- [ ] `checkr fix` — dry-run fixers
- [ ] `checkr fix --apply` — apply fixers
- [ ] `checkr init` — scaffold example files
- [ ] `checkr validate` — validate rule files
- [ ] `--reporter default | json | compact`
- [ ] `--report <file>` — write report to file

**Config**
- [ ] `checkr.config.js` support
- [ ] Zero-config mode with sensible defaults
- [ ] `steps` array for ordered execution
- [ ] `ignoreMarker` customization

**Utils (`@checkr/utils`)**
- [ ] `walkFiles()`
- [ ] `buildIgnoredLines()`
- [ ] Terminal color helpers

**Packages**
- [ ] `@checkr/core`
- [ ] `@checkr/cli`
- [ ] `@checkr/utils`

---

## v1.1 — Performance

Make it fast enough that developers run it constantly without thinking about it.

- [ ] Parallel file processing with `Promise.all` per step
- [ ] Configurable concurrency (`--concurrency N`)
- [ ] `--changed` mode — git diff since last commit
- [ ] `--staged` mode — git diff staged files
- [ ] Benchmark suite — track performance regressions

**Target:** 1000 files × 10 checks in under 5 seconds.

---

## v1.2 — Caching

Make repeated runs instant for unchanged files.

- [ ] File-level result cache keyed on `hash(content) + hash(ruleFn)`
- [ ] Cache stored in `.checkr-cache/`
- [ ] `--no-cache` flag to bypass
- [ ] Cache invalidation on rule source change
- [ ] Cache invalidation on checkr version change
- [ ] Cache stats in `--verbose` output

**Target:** Cached file check in under 1ms.

---

## v1.3 — Watch Mode

Developer-friendly live feedback during AI-assisted coding sessions. Full design spec in `FUTURE.md` (F-06).

- [ ] `checkr watch` command
- [ ] File system watcher (built-in `fs.watch` — no chokidar dependency in v1.x)
- [ ] Re-check only changed files on save
- [ ] Re-run affected check when a check file itself changes
- [ ] Preserve results for unchanged files
- [ ] Clear and re-render on each change
- [ ] `r` to force full re-run, `q` to quit
- [ ] `--watch` flag alias for `checkr run --watch`

---

## v1.4 — Inner Args (`--` separator)

Pass arguments through to individual fixers.

- [ ] Parse `--` separator in CLI
- [ ] Pass `args[]` as 4th argument to fix functions
- [ ] Document convention in RULE_AUTHORING.md
- [ ] Example fixer using inner args

---

## v1.5 — Reporting Improvements

Better output for humans and machines.

- [ ] Compact reporter — one line per violation
- [ ] JSON reporter — full machine-readable output
- [ ] Summary statistics — files scanned, time taken, cache hit rate
- [ ] `--report <file>` — write report alongside stdout
- [ ] Diff view — show before/after for fixers in dry-run mode

## v1.6 — HTML Report

Self-contained HTML violation report for human review. Full spec in `FUTURE.md` (F-08).

- [ ] `--reporter html` flag
- [ ] Self-contained HTML file — no external dependencies, opens from filesystem
- [ ] Step-by-step breakdown with collapsible sections
- [ ] Per-violation syntax-highlighted source context (3 lines before/after)
- [ ] Ignored blocks report — lists every `@checkr-ignore` block with justification
- [ ] Filter controls — by step, severity, file path
- [ ] CI artifact integration — attach HTML report to PR

---

## v1.7 — Safe Violations Database

Acknowledge violations as intentional without modifying source. Full design spec in `FUTURE.md` (F-09).

- [ ] SQLite database at `.checkr/safe.db` — add `better-sqlite3` dependency to `@checkr/core`
- [ ] `SafeDB` module — `open()`, `save()`, `filter()`, `reset()` in `@checkr/core/safe-db.js`
- [ ] Context block extraction — capture 3 lines before/after each violation at save time
- [ ] Context block matching — match on `(file_path, check_id, violation_line, context_before, context_after)` not line number
- [ ] `checkr run --save-safe` — run checks then save all violations to the database
- [ ] `checkr violations.json --save-safe` — import violations from a JSON report file
- [ ] `checkr --reset` — delete safe.db with confirmation prompt
- [ ] `checkr --reset --yes` — skip confirmation (for scripts)
- [ ] Safe filter applied after ignore-block filter, before reporting
- [ ] `INSERT OR IGNORE` deduplication — re-saving the same context block is a no-op
- [ ] `--verbose` output shows how many violations were suppressed by the safe database
- [ ] Document `.checkr/safe.db` gitignore/commit decision in README

---

## v1.8 — Severity Levels

Per-check severity with a run-time level filter. Full design spec in `FUTURE.md` (F-10).

- [ ] Three severity levels: `info` (1), `warning` (2), `error` (3)
- [ ] `severity` named export on check files — optional, defaults to `error`
- [ ] Numeric aliases — `export const severity = 2` identical to `'warning'`
- [ ] `rules` map in `checkr.config.js` — override per-check severity without editing rule files
- [ ] Config severity takes precedence over check file's own export
- [ ] `--level <info|warning|error|1|2|3>` flag on `checkr run`
- [ ] Default level is `error` — new `info`/`warning` checks are invisible to CI until opted in
- [ ] Checks below active level are dropped before scanning — zero performance cost
- [ ] `Violation` type gains `severity` field (inherited from its check)
- [ ] Default reporter prefixes violations with level icon: ❌ ⚠️ ℹ️
- [ ] JSON and compact reporters include `severity` on each violation and step result
- [ ] `checkr list` shows severity column
- [ ] `checkr validate` warns if `severity` export is not `info | warning | error | 1 | 2 | 3`

---

## v2.0 — Plugin Ecosystem

Make it easy to share rule sets across projects.

- [ ] Rule packages — `npm install @checkr/rules-react` adds rules to your project
- [ ] Rule package format — a package that exports an array of rule objects
- [ ] `extends` in config — inherit a rule set and override individual rules
- [ ] Rule disable — disable specific rules per file or per line

```js
// checkr.config.js
export default {
  extends: ['@checkr/rules-react', '@checkr/rules-tokens'],
  rules: {
    'check_raw_colors': 'warn',   // downgrade to warning
    'check_raw_sizes': 'error',   // keep as error
    'check_box_as_primitive': 'off',  // disable
  }
}
```

---

## v2.1 — IDE Integration

Real-time feedback without leaving the editor.

- [ ] VS Code extension — show violations inline as you type
- [ ] LSP server — language server protocol for editor-agnostic support
- [ ] Problem matcher — integrate with VS Code's problem panel
- [ ] Quick fix suggestions — show fix hints in the editor

---

## v2.2 — AI Integration

Close the loop — feed violations back to the AI.

- [ ] `checkr run --format ai` — output violations in a format optimized for AI context
- [ ] Violation summary prompt — generate a prompt that tells the AI what to fix
- [ ] Auto-retry mode — run check → feed violations to AI → re-generate → re-check

---

## Backlog (unscheduled)

- Cross-file rules — `checkProject(fileMap)` hook for rules that need to see all files at once
- Rule testing utilities — `@checkr/testing` with `expectViolation()` and `expectNoViolation()`
- Rule documentation generation — auto-generate docs from rule files
- Turbo integration — make each step a turbo task with proper caching
- GitHub Actions integration — annotate PRs with violations
- Metrics — track violation trends over time

---

## Version policy

- **Patch** (1.0.x) — bug fixes, no API changes
- **Minor** (1.x.0) — new features, backward compatible
- **Major** (x.0.0) — breaking changes to rule contract or config format

The rule contract (function signature, Violation shape) is considered stable from v1.0 and will not change without a major version bump.
