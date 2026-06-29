# chekr — Requirements Specification

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** May 2026

---

## 1. Purpose and Scope

### 1.1 Problem Statement

AI code generation tools produce syntactically correct code that violates project-specific design contracts. These violations are not catchable by general-purpose linters because they require knowledge of:

- Project-specific token systems (design tokens, size scales, color palettes)
- Component hierarchies and substitution rules
- Architectural boundaries and import constraints
- Framework-specific patterns and anti-patterns

Writing these rules in the ESLint ecosystem requires significant boilerplate (AST visitors, rule schemas, plugin registration) and couples the rules to ESLint's release cycle and API surface.

### 1.2 Solution

chekr is a standalone pipeline tool that:

1. Discovers and loads project-defined rule files from a `.chekr/checks/` directory
2. Scans source files (all or git-diff subset) against those rules
3. Reports violations with file, line, message, and fix hint
4. Optionally applies auto-fixes via corresponding `.chekr/fixes/` files
5. Exits with code 0 (pass) or 1 (fail) for CI integration

### 1.3 Non-Goals

- chekr does **not** replace ESLint, Prettier, or TypeScript
- chekr does **not** perform AST-level analysis (rules operate on source strings)
- chekr does **not** enforce code style or formatting
- chekr does **not** run tests

---

## 2. Functional Requirements

### 2.1 Rule Discovery

**FR-01** — The engine MUST auto-discover rule files in the configured `checksDir` (default: `./.chekr/checks`).

**FR-02** — Rule files MUST be named with the prefix `check_` followed by a snake_case identifier. Example: `check_raw_colors.js`.

**FR-03** — Fix files MUST be named with the prefix `fix_` followed by a snake_case identifier. Example: `fix_raw_sizes.js`.

**FR-04** — Each rule file MUST export exactly one function whose name starts with `check` (camelCase). Example: `export function checkRawColors(source, filePath)`.

**FR-05** — Each fix file MUST export exactly one function whose name starts with `fix` (camelCase). Example: `export function fixRawSizes(source, filePath, violations)`.

**FR-06** — The engine MUST validate rule files at startup and exit with a descriptive error if:
- A file in `checksDir` does not match the `check_*.js` naming pattern
- A file in `checksDir` does not export exactly one function starting with `check`
- A file in `checksDir` exports more than one function starting with `check`
- A file in `fixesDir` does not match the `fix_*.js` naming pattern
- A file in `fixesDir` does not export exactly one function starting with `fix`
- A file in `fixesDir` exports more than one function starting with `fix`

### 2.2 Rule Contract

**FR-07** — A check function MUST have the signature:
```js
function checkXxx(source: string, filePath: string): Violation[]
```

**FR-08** — A check function MUST return an array of `Violation` objects (empty array if no violations).

**FR-09** — A check function MUST NOT throw. Errors must be caught internally and returned as violations with `isError: true`, or silently skipped.

**FR-10** — A `Violation` object MUST contain:
```ts
{
  file: string      // absolute or relative file path
  line: number      // 1-indexed line number
  text: string      // the offending line text (trimmed)
  message: string   // human-readable violation description
}
```

**FR-11** — A `Violation` object MAY contain:
```ts
{
  fix?: string      // suggested fix hint (shown in output)
  rule?: string     // rule id (auto-populated by engine if omitted)
  severity?: 'error' | 'warn'  // default: 'error'
}
```

**FR-12** — A fix function MUST have the signature:
```js
function fixXxx(source: string, filePath: string, violations: Violation[]): string
```

**FR-13** — A fix function MUST return the modified source string. If no changes are needed, it MUST return the original source unchanged.

### 2.3 Configuration

**FR-14** — chekr MUST operate in zero-config mode when no config file is present, using these defaults:
```
checksDir:    ./.chekr/checks
fixesDir:     ./.chekr/fixes
include:      **/*.{ts,tsx,js,jsx}
exclude:      **/node_modules/**, **/*.stories.*, **/*.test.*, **/*.spec.*
bail:         true
ignoreMarker: @chekr-ignore
```

**FR-15** — chekr MUST support a config file named `chekr.config.js` (or `chekr.config.ts`) in the project root.

**FR-16** — The config file MUST support the following options:

```ts
interface ChekrConfig {
  // Directories
  checksDir?: string           // default: './.chekr/checks'
  fixesDir?: string            // default: './.chekr/fixes'

  // File scanning
  include?: string[]           // glob patterns to include
  exclude?: string[]           // glob patterns to exclude

  // Execution
  bail?: boolean               // stop on first failing step (default: true)
  parallel?: boolean           // run checks in parallel (default: true)
  concurrency?: number         // max parallel workers (default: CPU count)

  // Steps — optional ordered list
  // If omitted, all discovered checks run alphabetically
  steps?: Array<{
    id: string                 // matches check filename without prefix/extension
    step?: number              // display order number
    description?: string       // override display name
  }>

  // Ignore block marker
  ignoreMarker?: string        // default: '@chekr-ignore'

  // Reporting
  reporter?: 'default' | 'json' | 'compact' | 'html'
  reportFile?: string          // write report to file
}
```

**FR-17** — The `steps` array is optional. When provided, only the listed checks run, in the specified order. When omitted, all discovered checks run.

**FR-18** — The config MUST support a custom `ignoreMarker` so projects can keep their existing ignore syntax (e.g. `@symphony-ignore`).

### 2.4 Ignore Blocks

**FR-19** — The engine MUST support inline ignore blocks in source files:
```js
// ---------- @chekr-ignore-start
// code here is excluded from all checks
// ---------- @chekr-ignore-end
```

**FR-20** — Ignored lines MUST be excluded from all rule checks.

**FR-21** — The ignore marker prefix/suffix (`----------`) MUST be optional decoration — only the marker keyword matters.

### 2.5 File Scanning

**FR-22** — The engine MUST support three scanning modes:

| Mode | Flag | Description |
|------|------|-------------|
| Full | (default) | Scan all files matching `include` patterns |
| Changed | `--changed` | Only files changed since last commit (`git diff --name-only HEAD`) |
| Staged | `--staged` | Only staged files (`git diff --name-only --cached`) |

**FR-23** — In `--changed` and `--staged` modes, the engine MUST fall back to full scan if not inside a git repository, with a warning.

**FR-24** — The engine MUST read each file once and pass the source to all applicable checks (single-pass architecture).

### 2.6 Parallel Execution

**FR-25** — The engine MUST support parallel execution of checks across files.

**FR-26** — The default concurrency MUST be the number of logical CPU cores.

**FR-27** — Parallelism MUST be configurable via `concurrency` in config or `--concurrency N` flag.

**FR-28** — When `bail: true`, the engine MUST stop processing as soon as any check produces violations, after completing the current batch.

### 2.7 Caching

**FR-29** — The engine MUST support result caching keyed on `hash(fileContent) + hash(checkerVersion)`.

**FR-30** — Cache MUST be stored in `.chekr-cache/` by default (configurable).

**FR-31** — Cache MUST be invalidated when:
- File content changes
- The check function source changes
- The chekr version changes
- `--no-cache` flag is passed

**FR-32** — Cache MUST be safe to commit to `.gitignore` (binary-safe, deterministic).

### 2.8 CLI

**FR-33** — The CLI MUST support the following commands:

```
chekr run              Run all checks
chekr fix              Run all fixers
chekr watch            Watch mode — re-run on file change
chekr init             Scaffold checks/ and fixes/ directories with examples
chekr list             List all discovered checks and their status
chekr validate         Validate all check/fix files without running them
```

**FR-34** — The CLI MUST support the following global flags:

```
--changed               Only scan files changed since last commit
--staged                Only scan staged files
--fix                   Run fixers after checks (dry-run by default)
--apply                 Apply fixes to disk (used with --fix)
--no-bail               Run all checks even if one fails
--no-cache              Disable caching
--concurrency N         Set parallel worker count
--reporter <type>       Output format: default | json | compact
--report <file>         Write report to file
--verbose               Show all files, not just violations
--config <file>         Path to config file
```

**FR-35** — The CLI MUST support passing inner parameters to individual fixers using the `--` separator:
```
chekr fix -- --dry-run --verbose
chekr fix fix_raw_sizes -- --only-jsx
```

**FR-36** — The CLI MUST exit with code `0` when all checks pass and code `1` when any check fails.

### 2.9 Reporting

**FR-37** — Default reporter output MUST show:
```
🔍 Step 1: check_raw_colors .............. ✅ PASS
🔍 Step 2: check_raw_sizes ............... ❌ FAIL (3 violations)

  src/components/Button.tsx [42]
    ❌ Raw px value "16px" — use a size token instead
       width="16px"
       Fix: space.md

3 violations found. Fix Step 2 before continuing.
```

**FR-38** — JSON reporter MUST output a machine-readable report:
```json
{
  "passed": false,
  "totalViolations": 3,
  "steps": [
    {
      "id": "check_raw_colors",
      "step": 1,
      "status": "pass",
      "violations": []
    },
    {
      "id": "check_raw_sizes",
      "step": 2,
      "status": "fail",
      "violations": [...]
    }
  ],
  "timestamp": "2026-05-04T12:00:00Z"
}
```

**FR-39** — Compact reporter MUST output one line per violation:
```
src/components/Button.tsx:42 [check_raw_sizes] Raw px value "16px"
```

> **Note:** HTML reporter is planned for v1.6. See `FUTURE.md` (F-08) for full spec.

### 2.10 Utilities for Rule Authors

**FR-40** — chekr MUST provide the following utilities importable from `@chekr/utils`:

```js
import {
  walkFiles,           // recursive file walker with glob support
  buildIgnoredLines,   // parse @chekr-ignore blocks → Set<lineNumber>
  readFileLines,       // split source into lines array
} from '@chekr/utils'
```

**FR-41** — `walkFiles(rootDir, extensions, excludePatterns)` MUST return an array of absolute file paths.

**FR-42** — `buildIgnoredLines(lines, marker)` MUST return a `Set<number>` of 1-indexed line numbers that fall within ignore blocks.

---

## 3. Non-Functional Requirements

### 3.1 Performance

**NFR-01** — Full scan of 1000 files with 10 checks MUST complete in under 10 seconds on a modern laptop.

**NFR-02** — `--changed` mode with 10 changed files MUST complete in under 1 second.

**NFR-03** — Cached results MUST be returned in under 100ms per file.

### 3.2 Compatibility

**NFR-04** — chekr MUST run on Node.js 18+ and Bun 1.0+.

**NFR-05** — Rule files MUST be plain ES modules (`.js` or `.ts` with `"type": "module"`).

**NFR-06** — chekr MUST work on macOS, Linux, and Windows.

### 3.3 Developer Experience

**NFR-07** — Error messages for invalid rule files MUST include the expected function signature.

**NFR-08** — `chekr init` MUST generate a working example check and fix file.

**NFR-09** — The engine MUST print a startup summary listing all loaded checks before running.

### 3.4 Extensibility

**NFR-10** — Rule authors MUST be able to import any npm package inside their rule files.

**NFR-11** — The engine MUST NOT impose any restrictions on what a rule function does internally, as long as it satisfies the contract (correct signature, returns `Violation[]`, does not throw).

---

## 4. Constraints

- Rule files are plain JavaScript/TypeScript — no special DSL or framework
- The engine has zero knowledge of any specific design system, token system, or framework
- All project-specific knowledge lives in the rule files, not the engine
- The tool is a pipeline step, not an IDE plugin (no LSP, no real-time feedback)

---

## 5. Glossary

| Term | Definition |
|------|------------|
| **Rule** | A check function that detects violations in source files |
| **Violation** | A single instance of a rule being broken, with file/line/message |
| **Fixer** | A fix function that transforms source to remove violations |
| **Step** | A named execution unit — one check file = one step |
| **Pipeline** | The ordered sequence of steps run by `chekr run` |
| **Ignore block** | Source annotation that excludes lines from all checks |
| **Design contract** | The set of rules that define valid AI output for a project |
