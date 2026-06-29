# chekr — Architecture

**Version:** 1.0  
**Status:** Draft

---

## 1. Package Structure

```
@chekr/core     ← engine (no CLI, no I/O assumptions)
@chekr/cli      ← CLI wrapper, process.exit, stdout/stderr
@chekr/utils    ← utilities for rule authors
```

Separation rationale: `@chekr/core` can be embedded in editors, CI systems, or other tools without pulling in CLI dependencies. `@chekr/cli` is the thin shell that wires core to a terminal.

---

## 2. Core Engine — Data Flow

```
chekr run
  │
  ├─ 1. Load config (chekr.config.js or defaults)
  │
  ├─ 2. Discover + validate rule files
  │       .chekr/checks/check_*.js → load + validate exports
  │       .chekr/fixes/fix_*.js    → load + validate exports (if --fix)
  │
  ├─ 3. Resolve file list
  │       --changed  → git diff --name-only HEAD
  │       --staged   → git diff --name-only --cached
  │       default    → walkFiles(include, exclude)
  │
  ├─ 4. Read all files into memory (single I/O pass)
  │       Map<filePath, source>
  │
  ├─ 5. Execute checks (parallel across files, sequential across steps)
  │       For each step:
  │         Promise.all(files.map(f => check(source, path)))
  │         Collect violations
  │         If bail && violations.length > 0 → stop
  │
  ├─ 6. Report results
  │       default | json | compact reporter
  │
  └─ 7. Exit 0 (pass) or 1 (fail)
```

---

## 3. Module Breakdown

### `@chekr/core`

```
src/
  engine.js          ← orchestrates the full run
  loader.js          ← discovers and validates rule files
  scanner.js         ← resolves file list (full / git-diff / staged)
  runner.js          ← executes checks with parallelism + bail logic
  cache.js           ← file-level result caching
  reporter.js        ← formats and outputs results
  types.js           ← shared type definitions (JSDoc or .d.ts)
  index.js           ← public API
```

### `@chekr/cli`

```
src/
  cli.js             ← argument parsing, command dispatch
  commands/
    run.js
    fix.js
    watch.js
    init.js
    list.js
    validate.js
```

### `@chekr/utils`

```
src/
  file-walker.js     ← walkFiles()
  ignore-handler.js  ← buildIgnoredLines()
  colors.js          ← terminal color helpers
  index.js
```

---

## 4. Rule Loading — `loader.js`

```js
// Discovery
const files = glob('check_*.js', { cwd: config.checksDir })
// config.checksDir defaults to '.chekr/checks'

// Validation per file
for (const file of files) {
  const mod = await import(file)
  const checkFns = Object.entries(mod)
    .filter(([name, fn]) => name.startsWith('check') && typeof fn === 'function')

  if (checkFns.length === 0) {
    throw new LoadError(file, `No exported function starting with "check" found.
Expected: export function checkXxx(source, filePath) { ... }`)
  }

  if (checkFns.length > 1) {
    throw new LoadError(file, `Multiple exported functions starting with "check" found: ${checkFns.map(([n]) => n).join(', ')}.
Each check file must export exactly one check function.
Expected: export function checkXxx(source, filePath) { ... }`)
  }

  // Derive step id from filename
  // .chekr/checks/check_raw_colors.js → 'check_raw_colors'
  const id = path.basename(file, '.js')
  const [[, fn]] = checkFns

  rules.push({ id, file, fn })
}
```

---

## 5. Execution Model — `runner.js`

### Step ordering

```
If config.steps defined:
  Run in config.steps order
Else:
  Run in alphabetical order by filename
```

### Parallelism within a step

Each step runs its check function against all files in parallel:

```js
async function runStep(rule, fileMap, config) {
  const entries = [...fileMap.entries()]

  // Chunk into batches of config.concurrency
  const batches = chunk(entries, config.concurrency)
  const violations = []

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(([filePath, source]) => {
        // Check cache first
        const cached = cache.get(filePath, rule.id)
        if (cached) return cached

        // Run check — never throws (wrapped)
        return safeRun(rule.fn, source, filePath)
          .then(v => { cache.set(filePath, rule.id, v); return v })
      })
    )
    violations.push(...results.flat())
  }

  return violations
}
```

### Bail logic

```js
for (const step of orderedSteps) {
  const violations = await runStep(step, fileMap, config)

  if (violations.length > 0) {
    report.addFailure(step, violations)
    if (config.bail) break   // stop here, don't run remaining steps
  } else {
    report.addPass(step)
  }
}
```

---

## 6. Caching — `cache.js`

Cache key: `sha256(fileContent) + sha256(ruleFnSource) + chekrVersion`

```
.chekr-cache/
  <sha256-of-key>.json    ← { violations: Violation[], timestamp: number }
```

Cache is read before running a check and written after. If the key matches, the stored violations are returned directly — the check function is never called.

Cache invalidation is automatic — any change to file content or rule source produces a different key.

---

## 7. Git Integration — `scanner.js`

```js
async function getChangedFiles(mode) {
  try {
    const cmd = mode === 'staged'
      ? 'git diff --name-only --cached'
      : 'git diff --name-only HEAD'

    const output = execSync(cmd, { encoding: 'utf8' })
    return output.trim().split('\n').filter(Boolean)
  } catch {
    // Not a git repo or git not available
    warn('Not a git repository — falling back to full scan')
    return null  // caller falls back to walkFiles
  }
}
```

---

## 8. CLI Argument Passing — `--` Separator

The `--` separator passes inner arguments to the fixer being invoked:

```
chekr fix -- --dry-run --verbose
chekr fix fix_raw_sizes -- --only-jsx --path src/
```

Parsing:

```js
const separatorIdx = process.argv.indexOf('--')
const chekrArgs = separatorIdx === -1
  ? process.argv.slice(2)
  : process.argv.slice(2, separatorIdx)

const innerArgs = separatorIdx === -1
  ? []
  : process.argv.slice(separatorIdx + 1)

// innerArgs are passed to the fix function as the 4th argument
fixFn(source, filePath, violations, innerArgs)
```

Fix function signature with inner args:

```js
export function fixRawSizes(source, filePath, violations, args = []) {
  const dryRun = args.includes('--dry-run')
  // ...
}
```

---

## 9. Watch Mode — `watch.js`

```
chekr watch
  │
  ├─ Initial full run
  │
  └─ fs.watch on .chekr/checks/ + include patterns
       On file change:
         Re-read changed file
         Run all checks against that file only
         Re-print results for that file
         (does not re-run unchanged files)
```

Watch mode never exits. Ctrl+C to stop.

---

## 10. Public API — `@chekr/core`

```js
import { run, fix, validate, loadConfig } from '@chekr/core'

// Programmatic usage
const result = await run({
  config: './chekr.config.js',
  changed: true,
  bail: false,
})

console.log(result.passed)        // boolean
console.log(result.violations)    // Violation[]
console.log(result.steps)         // StepResult[]
```

This allows embedding chekr in editors, CI scripts, or other tools without going through the CLI.

---

## 11. Dependency Philosophy

`@chekr/core` has zero runtime dependencies beyond Node.js built-ins. The only optional dependency is `fast-glob` for file walking.

`@chekr/cli` depends on `@chekr/core` and a minimal arg parser.

`@chekr/utils` has zero dependencies.

Rule files can depend on anything — that's the rule author's concern, not the engine's.
