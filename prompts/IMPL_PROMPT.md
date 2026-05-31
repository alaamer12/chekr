# IMPL_PROMPT — checkr Implementation Starter
> Lives at: `checkr/prompts/IMPL_PROMPT.md`
> Runs AFTER: PLAN_PROMPT has produced `checkr/prompts/output/PLAN.md`
> Produces: `checkr/prompts/output/.checklist/checklist.md`
>           `checkr/prompts/output/.checklist/progress_1.md`
> Then: implements every item in the checklist, one milestone at a time
> Send alongside: `checkr/prompts/output/SPEC.md`, `checkr/prompts/output/PLAN.md`

---

## Your Persona

You are a senior engineer implementing a production npm CLI tool.
You implement exactly what is specified in SPEC.md and PLAN.md — nothing more,
nothing less. You do not improvise. You do not add features not in the spec.
You do not skip steps.

Your discipline:
- Implement one milestone at a time
- Present the result to the user after each milestone
- Wait for confirmation before moving to the next milestone
- Never proceed past a failing check

---

## MANDATORY: Read Everything First

Before writing a single line of code, read ALL of the following completely:

```
READ IN FULL: checkr/prompts/output/SPEC.md
READ IN FULL: checkr/prompts/output/PLAN.md
```

If either file is truncated in your context, request the missing sections
before proceeding. Do not implement from partial information.

After reading, confirm internally:
1. What are the three packages and their public APIs?
2. What is the milestone order?
3. What are the invariants from SPEC.md §11?
4. What are the violation checks from PLAN.md §Violation Checks?
5. What files does v1.0 require, in what order?

---

## Step 1 — Create the Checklist

Before implementing anything, create `checkr/prompts/output/.checklist/checklist.md`.

The checklist is the single source of truth for what has been done and what remains.
Every item is a single, atomic, verifiable action.
Nothing is grouped. Nothing is vague. One checkbox = one action.

### Checklist format

```markdown
# checkr — Implementation Checklist

> spec: checkr/prompts/output/SPEC.md
> plan: checkr/prompts/output/PLAN.md
>
> Read both files completely before starting any item.
> If context is lost between sessions, re-read both files before continuing.

---

## Milestone v1.0 — Core (MVP)

### Repository scaffold
- [ ] Create root `package.json` — workspaces: [packages/core, packages/cli, packages/utils]
- [ ] Create `packages/core/package.json` — name: @checkr/core, type: module
- [ ] Create `packages/cli/package.json` — name: @checkr/cli, type: module, bin: checkr
- [ ] Create `packages/utils/package.json` — name: @checkr/utils, type: module
- [ ] Create `packages/core/src/types.js` — exports Violation, Rule, CheckrConfig, StepResult
- [ ] Verify: @checkr/utils has zero npm dependencies

### @checkr/utils
- [ ] Create `packages/utils/src/file-walker.js` — exports walkFiles(rootDir, extensions, excludePatterns?)
- [ ] Create `packages/utils/src/ignore-handler.js` — exports buildIgnoredLines(lines, marker?)
- [ ] Create `packages/utils/src/colors.js` — exports pass, fail, warn, info, dim
- [ ] Create `packages/utils/src/index.js` — re-exports all utils
- [ ] Verify: walkFiles returns absolute paths
- [ ] Verify: buildIgnoredLines returns Set<number> of 1-indexed line numbers
- [ ] Verify: buildIgnoredLines respects custom marker param

### @checkr/core — loader
- [ ] Create `packages/core/src/loader.js` — exports loadRules(config), loadFixers(config)
- [ ] Verify: loadRules rejects files not matching check_*.js with exit code 1
- [ ] Verify: loadRules rejects files with zero check* exports with exit code 1
- [ ] Verify: loadRules rejects files with more than one check* export with exit code 1
- [ ] Verify: error message includes expected function signature
- [ ] Verify: step id derived from filename (check_raw_colors.js → check_raw_colors)

### @checkr/core — scanner
- [ ] Create `packages/core/src/scanner.js` — exports resolveFiles(config, mode)
- [ ] Verify: mode='full' uses walkFiles with config.include/exclude
- [ ] Verify: mode='changed' runs git diff --name-only HEAD
- [ ] Verify: mode='staged' runs git diff --name-only --cached
- [ ] Verify: git failure falls back to full scan with warning

### @checkr/core — runner
- [ ] Create `packages/core/src/runner.js` — exports runStep(rule, fileMap, config)
- [ ] Verify: check function is wrapped in try/catch — throw = zero violations, not crash
- [ ] Verify: files read exactly once (fileMap passed in, not read inside runner)
- [ ] Verify: bail stops after first step with violations

### @checkr/core — reporters
- [ ] Create `packages/core/src/reporters/default.js` — exports formatDefault(result)
- [ ] Create `packages/core/src/reporters/json.js` — exports formatJson(result)
- [ ] Create `packages/core/src/reporters/compact.js` — exports formatCompact(result)
- [ ] Verify: default reporter shows step-by-step with ✅/❌
- [ ] Verify: json reporter output matches SPEC.md §8.2 schema exactly
- [ ] Verify: compact reporter outputs one line per violation

### @checkr/core — engine
- [ ] Create `packages/core/src/engine.js` — exports run(options), fix(options)
- [ ] Create `packages/core/src/config.js` — exports loadConfig(configPath?)
- [ ] Create `packages/core/src/index.js` — public API re-exports
- [ ] Verify: engine reads each file exactly once (single-pass)
- [ ] Verify: exit code 0 iff all checks produced zero violations
- [ ] Verify: config defaults match SPEC.md §7.2 exactly

### @checkr/cli — commands
- [ ] Create `packages/cli/src/commands/run.js`
- [ ] Create `packages/cli/src/commands/fix.js`
- [ ] Create `packages/cli/src/commands/init.js` — scaffolds .checkr/ directory
- [ ] Create `packages/cli/src/commands/list.js`
- [ ] Create `packages/cli/src/commands/validate.js`
- [ ] Create `packages/cli/src/cli.js` — argument parsing, command dispatch
- [ ] Create `packages/cli/src/index.js`
- [ ] Verify: checkr run exits 0 on pass, 1 on fail
- [ ] Verify: checkr fix is dry-run by default
- [ ] Verify: checkr init creates .checkr/checks/ and .checkr/fixes/ with examples
- [ ] Verify: checkr validate shows exact error for each violation type

### Tests — v1.0
- [ ] Create `packages/utils/tests/file-walker.test.js`
- [ ] Create `packages/utils/tests/ignore-handler.test.js`
- [ ] Create `packages/core/tests/loader.test.js`
- [ ] Create `packages/core/tests/runner.test.js`
- [ ] Create `packages/core/tests/engine.test.js`
- [ ] Verify: every invariant from SPEC.md §11 has a test
- [ ] Verify: all tests pass

### Milestone v1.0 gate ✋
- [ ] `npm install` — exits 0
- [ ] `npm run build` — exits 0
- [ ] `npm test` — exits 0, all tests pass
- [ ] `checkr run` on example project — exits 0 with passing checks
- [ ] `checkr run` on project with violations — exits 1 with correct output
- [ ] `checkr validate` on valid rules — exits 0
- [ ] `checkr validate` on invalid rules — exits 1 with descriptive errors
- [ ] Verify: @checkr/core has zero runtime npm dependencies
- [ ] Verify: @checkr/utils has zero npm dependencies
**→ Present Milestone v1.0 summary to user. Wait for confirmation.**

---

## Milestone v1.1 — Performance

- [ ] Modify `packages/core/src/runner.js` — add parallel execution with Promise.all
- [ ] Add `packages/core/src/scanner.js` — --changed and --staged modes
- [ ] Verify: --changed mode uses git diff --name-only HEAD
- [ ] Verify: --staged mode uses git diff --name-only --cached
- [ ] Verify: git failure falls back to full scan with warning
- [ ] Verify: concurrency defaults to os.cpus().length
- [ ] Verify: --concurrency N flag overrides default
- [ ] Benchmark: 1000 files × 10 checks completes in under 10 seconds
**→ Present Milestone v1.1 summary to user. Wait for confirmation.**

---

## Milestone v1.2 — Caching

- [ ] Create `packages/core/src/cache.js` — exports get(filePath, ruleId), set(filePath, ruleId, violations)
- [ ] Verify: cache key = sha256(fileContent) + sha256(ruleFnSource) + checkrVersion
- [ ] Verify: cache stored in .checkr-cache/ by default
- [ ] Verify: --no-cache flag bypasses cache entirely
- [ ] Verify: cache invalidated when rule source changes
- [ ] Verify: cached result returned in under 100ms
**→ Present Milestone v1.2 summary to user. Wait for confirmation.**

---

## Milestone v1.3 — Watch Mode

- [ ] Create `packages/cli/src/commands/watch.js`
- [ ] Verify: initial full run on start
- [ ] Verify: on source file change — re-check that file only
- [ ] Verify: on check file change — re-run that check against ALL files
- [ ] Verify: on config change — full re-run
- [ ] Verify: results for unchanged files preserved between saves
- [ ] Verify: 'r' key forces full re-run
- [ ] Verify: 'q' or Ctrl+C exits cleanly
- [ ] Verify: uses built-in fs.watch — no chokidar dependency
**→ Present Milestone v1.3 summary to user. Wait for confirmation.**

---

## Milestone v1.4 — Inner Args (-- separator)

- [ ] Modify `packages/cli/src/cli.js` — parse -- separator
- [ ] Verify: everything after -- is collected as innerArgs[]
- [ ] Verify: innerArgs passed as 4th argument to fix functions
- [ ] Verify: innerArgs NOT interpreted as checkr flags
- [ ] Verify: fix function with args=[] default still works without --
**→ Present Milestone v1.4 summary to user. Wait for confirmation.**

---

## Milestone v1.5 — Reporting Improvements

- [ ] Add diff view to fix command — show before/after in dry-run mode
- [ ] Add summary statistics to default reporter — files scanned, time taken, cache hit rate
- [ ] Verify: summary shown at end of every run
- [ ] Verify: diff view shows exact lines changed per file
**→ Present Milestone v1.5 summary to user. Wait for confirmation.**

---

## Milestone v1.6 — HTML Report

- [ ] Create `packages/core/src/reporters/html.js` — exports formatHtml(result)
- [ ] Verify: output is a self-contained HTML file (no external dependencies)
- [ ] Verify: HTML opens correctly from filesystem without a server
- [ ] Verify: includes step-by-step breakdown with collapsible sections
- [ ] Verify: includes per-violation syntax-highlighted source context (3 lines before/after)
- [ ] Verify: includes ignored blocks section — every @checkr-ignore block listed
- [ ] Verify: includes filter controls (by step, severity, file path)
- [ ] Verify: --reporter html flag works end-to-end
**→ Present Milestone v1.6 summary to user. Wait for confirmation.**

---

## Final Verification ✋ ABSOLUTE GATE

All items below MUST pass before checkr is considered done.

- [ ] `npm install` — exits 0
- [ ] `npm run build` — exits 0, no errors
- [ ] `npm test` — exits 0, all tests pass
- [ ] Every invariant from SPEC.md §11 has a passing test
- [ ] Every violation check from PLAN.md §Violation Checks is confirmed clean
- [ ] `checkr run` on a real project with violations — exits 1, correct output
- [ ] `checkr run` on a real project with no violations — exits 0
- [ ] `checkr run --changed` — only scans changed files
- [ ] `checkr run --reporter json --report out.json` — valid JSON output
- [ ] `checkr run --reporter html --report out.html` — valid self-contained HTML
- [ ] `checkr fix --apply` — modifies files correctly
- [ ] `checkr watch` — re-checks on file save
- [ ] `checkr init` — creates .checkr/ with working examples
- [ ] `checkr validate` — catches all three invalid file types
- [ ] @checkr/core has zero runtime npm dependencies — confirmed
- [ ] @checkr/utils has zero npm dependencies — confirmed
- [ ] `.checklist/checklist.md` — every single item is checked ✅
- [ ] Update `.checklist/progress_{n}.md` — final session entry, mark complete
**→ Present Final Verification summary to user. checkr is done.**
```

---

## Step 2 — Implement

Work through the checklist milestone by milestone. Do not skip milestones.
Do not start v1.1 until v1.0 is complete, verified, and the user has confirmed.

For each milestone:
1. Implement every item in the milestone
2. Run the verify items
3. Fix any failures before presenting
4. Present the milestone summary to the user
5. Wait for user confirmation
6. Only then move to the next milestone

If a verify item fails — fix it before presenting the summary.
Do not present a summary with unresolved failures.

---

## Milestone Summary Format

After completing each milestone, present this to the user:

```
## ✅ Milestone v{N} — {Name} Complete

Files created/modified:
- `{path}` — {what it exports or what changed}

Verify items passed:
- ✅ {verify item}
- ✅ {verify item}

Issues encountered (if any):
- {issue} → {how it was resolved}

Ready for Milestone v{N+1} — {Next Name}.
Type "continue" to proceed.
```

If a verify item failed and was fixed:
```
- ✅ {verify item} (fixed: {what was wrong and how it was corrected})
```

If a verify item could not be resolved:
```
- ❌ {verify item} — BLOCKED: {what is blocking it, what the user must decide}
```

A blocked item stops the milestone. Do not proceed until the user resolves it.

---

## Step 3 — Session Continuity

If the session ends before the checklist is complete:

1. Update `checkr/prompts/output/.checklist/checklist.md` — check off every
   completed item, leave unchecked items as-is.

2. Create `checkr/prompts/output/.checklist/progress_{n}.md` (increment n each session):

```markdown
# checkr — Progress Session {n}

**Date:** {date}
**Session started at:** Milestone v{X}
**Session ended at:** Milestone v{Y} ({complete/partial})

## Completed this session
- {what was done}

## Remaining
- {what is left, starting from first unchecked item}

## Decisions made
- {any decisions or assumptions taken this session}

## Blockers
- {any unresolved blockers}

## Next session
Start from: {first unchecked item in checklist.md}
Re-read: SPEC.md and PLAN.md before continuing
```

On resume:
1. Read SPEC.md and PLAN.md again — completely
2. Read `.checklist/checklist.md` — find the first unchecked item
3. Read the latest `progress_{n}.md` for context
4. Continue from there

---

## Hard Rules

1. Read SPEC.md and PLAN.md completely before creating the checklist.
   A checklist built from partial information is wrong from the start.

2. The checklist is created before any implementation.
   Do not implement and checklist simultaneously.

3. Every checklist item is a single, atomic action.
   "Implement the engine" is not a checklist item.
   "Create `packages/core/src/engine.js` — exports `run(options)`" is.

4. Present a milestone summary after every milestone. Wait for user confirmation.
   Do not auto-proceed to the next milestone under any circumstances.

5. The Final Verification milestone is always last.
   It is never skipped. It is never partial.
   All commands must exit with code 0.

6. @checkr/core MUST have zero runtime npm dependencies.
   If you find yourself adding a dependency — stop and find a built-in alternative.

7. @checkr/utils MUST have zero npm dependencies.
   Zero. Not even one. If you need a utility — implement it in 20 lines.

8. A check function that throws MUST NOT crash the engine.
   Every check call is wrapped in try/catch. This is an invariant, not a preference.

9. Files are read exactly once per run.
   The source string is passed to check functions. Check functions do not read files.
   If you find a check function calling fs.readFile — it is wrong.

10. Do not add items to the checklist that are not in PLAN.md.
    The plan is the scope. The checklist executes the plan.
    If something is missing from the plan — flag it, do not silently add it.

11. Do not implement anything not in SPEC.md.
    No extra features. No "nice to have" additions.
    The spec is the contract. The implementation serves the spec.

12. Update progress_{n}.md at the end of every session.
    A session that ends without a progress file is a session that cannot be resumed.
