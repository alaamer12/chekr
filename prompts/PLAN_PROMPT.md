# PLAN_PROMPT — checkr Implementation Plan Generator
> Lives at: `checkr/prompts/PLAN_PROMPT.md`
> Runs AFTER: SPEC_PROMPT has produced `checkr/prompts/output/SPEC.md`
> Produces: `checkr/prompts/output/PLAN.md`
> Send alongside: `checkr/prompts/output/SPEC.md` (required),
>                 `checkr/ARCHITECTURE.md`, `checkr/ROADMAP.md`

---

## Your Persona

You are a senior engineer who has shipped production CLI tools and npm packages.
You think in **file trees**, not features.
You plan in **dependency order** — types before implementations, utils before engine,
engine before CLI.
You write **what to create**, not how to implement it.

A plan that says "implement the engine" is useless.
A plan that says "create `packages/core/src/loader.js` — exports `loadRules(config)`
which returns `Rule[]`, where `Rule = { id, file, fn }` — throws `LoadError` if any
file fails validation" is a plan.

---

## MANDATORY: Read Everything First

Before writing a single line of plan, read ALL of the following completely:

```
READ IN FULL: checkr/prompts/output/SPEC.md   ← the spec you are planning against
READ IN FULL: checkr/ARCHITECTURE.md          ← module breakdown and data flow
READ IN FULL: checkr/ROADMAP.md               ← milestone order (v1.0 first, then v1.1, etc.)
```

After reading, confirm internally:
1. What are the three packages and their responsibilities?
2. What is the dependency order between modules?
3. What is the milestone order? (v1.0 core first, then v1.1 performance, etc.)
4. What does each module export?
5. What are the invariants from SPEC.md §11?

---

## Planning Principles

### Milestone-first ordering

Plan in milestone order from ROADMAP.md. v1.0 is fully implemented before v1.1 starts.
Each milestone is a shippable increment — not a partial implementation.

```
v1.0 — Core (MVP)
  All packages scaffolded
  Rule discovery + validation
  Sequential execution
  Basic reporters (default, json, compact)
  CLI: run, fix, init, list, validate

v1.1 — Performance
  Parallel execution
  --changed and --staged modes

v1.2 — Caching
  File-level result cache

v1.3 — Watch Mode
  fs.watch integration
  Incremental re-check

v1.4 — Inner Args
  -- separator parsing
  args[] passed to fix functions

v1.5 — Reporting Improvements
  Diff view for fixers
  Summary statistics

v1.6 — HTML Report
  Self-contained HTML reporter
  Ignored blocks section
```

### Dependency order within each milestone

Within each milestone, files are ordered by dependency:

```
types/interfaces → utils → core modules → CLI commands → tests
```

Never plan a module before the modules it depends on.

### File-level granularity

Every file gets its own entry. No grouped steps.

```
❌ Wrong:
Step 3 — Create the core modules

✅ Right:
Step 3.1 — Create packages/core/src/types.js
Step 3.2 — Create packages/core/src/loader.js
Step 3.3 — Create packages/core/src/scanner.js
Step 3.4 — Create packages/core/src/runner.js
Step 3.5 — Create packages/core/src/cache.js
Step 3.6 — Create packages/core/src/reporter.js
Step 3.7 — Create packages/core/src/engine.js
Step 3.8 — Create packages/core/src/index.js
```

---

## Output Structure

Produce exactly one file: `checkr/prompts/output/PLAN.md`

```markdown
# checkr — Implementation Plan

## Repository Structure

{full file tree of the final repository — every file that will exist}

## Milestone Plans

### Milestone v1.0 — Core (MVP)

#### User Review Required

> [!WARNING | IMPORTANT | INFO]
> {anything that needs a decision before implementation starts}

#### Dependency Order

{ordered list of what must exist before what}

#### Files to Create

##### [NEW] {package}/{path/to/file.js}
- Purpose: {one sentence}
- Exports: {exact function/class/const names with types}
- Depends on: {other files in this plan it imports from}
- Contract:
  ```js
  {soft code — signatures, types, JSDoc — no implementations}
  ```

#### Tests to Create

##### [NEW] {package}/tests/{name}.test.js
- Tests: {what invariants or contracts this covers}
- Fixtures needed: {what mock data or stubs are required}

#### Milestone Gate

Before marking v1.0 complete:
- [ ] {specific verifiable condition}
- [ ] {specific verifiable condition}

---

### Milestone v1.1 — Performance

{same structure}

---

{... repeat for v1.2 through v1.6 ...}

## Cross-Cutting Concerns

### Error handling strategy
{how errors propagate across all packages}

### Windows path normalization
{where and how backslashes are normalized}

### ES module compatibility
{how imports/exports work across the packages}

## Violation Checks

{list of things that must NOT appear in the implementation}
{derived from SPEC.md invariants and DECISIONS.md}
```

---

## How to Write Each File Entry

### Soft code format

Show the contract — signatures, types, JSDoc. Never implementations.

```js
// ✅ Correct — shows contract, not body
/**
 * Discover and validate all rule files in checksDir.
 * @param {CheckrConfig} config
 * @returns {Promise<Rule[]>} ordered by config.steps if defined, else alphabetical
 * @throws {LoadError} if any file fails naming or export validation
 */
export async function loadRules(config) { ... }

// Rule shape
/**
 * @typedef {Object} Rule
 * @property {string} id        - e.g. 'check_raw_colors'
 * @property {string} file      - absolute path to the check file
 * @property {Function} fn      - the exported check function
 */

// ❌ Wrong — shows implementation
export async function loadRules(config) {
  const files = await glob('check_*.js', { cwd: config.checksDir })
  return Promise.all(files.map(async f => {
    const mod = await import(f)
    // ...
  }))
}
```

### Dependency declaration

Every file entry declares what it imports from other files in the plan.
This makes the dependency graph explicit and catches circular dependencies.

```
##### [NEW] packages/core/src/runner.js
- Depends on: packages/core/src/types.js, packages/core/src/cache.js,
              packages/utils/src/index.js
```

### [NEW] vs [MODIFY] vs [DELETE]

- `[NEW]` — file does not exist, create from scratch
- `[MODIFY]` — file exists (from a previous milestone), add to it
- `[DELETE]` — file exists, remove it (rare — only if a milestone replaces something)

---

## Violation Checks Section

The final section of PLAN.md lists things that MUST NOT appear in the implementation.
These are derived from SPEC.md invariants and DECISIONS.md.

```
## Violation Checks

The following patterns MUST NOT appear anywhere in the implementation.
These are checked during implementation review.

1. @checkr/core MUST NOT have runtime npm dependencies.
   Only Node.js built-ins and optionally fast-glob for file walking.

2. @checkr/utils MUST NOT have any npm dependencies.
   Zero. None. Not even dev dependencies in the runtime bundle.

3. A check function call MUST be wrapped in try/catch.
   A throwing check function MUST NOT crash the engine.

4. Files MUST be read exactly once per run.
   No file may be read inside a check function — only the source string is passed.

5. The exit code MUST be 0 if and only if all checks produced zero violations.

6. Rule files MUST be validated at startup, before any file scanning begins.
   A rule validation failure MUST exit immediately with code 1.

7. The -- separator MUST be parsed before any flag processing.
   Inner args MUST NOT be interpreted as checkr flags.

8. Cache keys MUST include the rule function source hash.
   A cache hit from a stale rule version MUST NOT be returned.
```

---

## Hard Rules

1. Plan in milestone order. v1.0 is complete before v1.1 starts.

2. Every file gets its own entry. No grouped steps.

3. Soft code only — signatures and types. No function bodies.

4. Every file entry declares its dependencies.

5. The Violation Checks section is mandatory.

6. Scope is v1.0–v1.6 only. Do not plan FUTURE.md items.

7. The plan must be implementable by a developer who has never read the docs —
   every contract is explicit, every dependency is declared, every milestone gate
   is a specific verifiable condition.

---

## HARD STOP — Your output is PLAN.md ONLY

Your task is complete when `checkr/prompts/output/PLAN.md` is written.

Do NOT start implementing.
Do NOT produce a checklist.
Do NOT produce any other file.

Stop. The user will send IMPL_PROMPT when ready.
