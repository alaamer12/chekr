# checkr — Implementation Plan v2

Revised plan: **`checkr.config.js` only** (no `checkr.json`), **global + per-step config**, **`checkr.config.d.ts`**, **gitignore integration**, **`helpers/`** module, **zero chalk**, **one git-related dependency family**, CLI as final override layer.

---

## 1. Product Model

```
┌─────────────────────────────────────────────────────────────┐
│  @checkr/core          Engine — discovers user rules, runs   │
│  @checkr/cli           Terminal — argv → config → engine    │
│  @checkr/utils         Rule-author utilities (zero deps)    │
│  @checkr/helpers       Internal shared primitives (tested)    │
└─────────────────────────────────────────────────────────────┘
                              │
                    user project owns:
                              │
              .checkr/checks/check_*.js    ← user rules
              .checkr/fixes/fix_*.js       ← user fixers
              checkr.config.js             ← project config
              checkr.config.d.ts           ← types (copy or npm types)
```

**Symphony toolkit** = migration source only. Not shipped. Example rules live in `examples/`.

---

## 2. Repository Structure

```
checkr/
├── packages/
│   ├── helpers/                         # @checkr/helpers (internal, shared)
│   │   ├── src/
│   │   │   ├── index.js
│   │   │   ├── parse/
│   │   │   │   ├── parse-args-string.js
│   │   │   │   ├── parse-args-array-string.js
│   │   │   │   ├── parse-boolean-flag.js
│   │   │   │   ├── parse-positive-int.js
│   │   │   │   └── parse-key-value.js
│   │   │   ├── config/
│   │   │   │   ├── merge-config.js
│   │   │   │   ├── resolve-step-config.js
│   │   │   │   └── pick-defined.js
│   │   │   ├── path/
│   │   │   │   ├── normalize-posix-path.js
│   │   │   │   ├── to-absolute.js
│   │   │   │   └── is-inside-dir.js
│   │   │   ├── naming/
│   │   │   │   ├── snake-to-camel.js
│   │   │   │   ├── derive-check-export.js
│   │   │   │   └── derive-fix-export.js
│   │   │   ├── collection/
│   │   │   │   ├── chunk.js
│   │   │   │   ├── unique.js
│   │   │   │   └── filter-defined.js
│   │   │   └── assert/
│   │   │       ├── assert-non-empty-string.js
│   │   │       └── assert-one-of.js
│   │   └── __tests__/                   # 100% coverage target on helpers
│   │
│   ├── core/                            # @checkr/core
│   │   ├── src/
│   │   │   ├── index.js
│   │   │   ├── engine.js
│   │   │   ├── config/
│   │   │   │   ├── defaults.js
│   │   │   │   ├── load-config.js       # load checkr.config.js
│   │   │   │   ├── resolve-config.js    # defaults → file → CLI
│   │   │   │   ├── validate-config.js
│   │   │   │   └── types.d.ts           # re-exports CheckrConfig
│   │   │   ├── git/
│   │   │   │   ├── git-service.js       # simple-git wrapper
│   │   │   │   ├── gitignore-filter.js  # ignore package wrapper
│   │   │   │   └── diff-cache.js        # changed/staged paths + cache keys
│   │   │   ├── loader.js
│   │   │   ├── scanner.js
│   │   │   ├── runner.js
│   │   │   ├── cache.js
│   │   │   └── reporter/
│   │   └── package.json
│   │
│   ├── cli/                             # @checkr/cli
│   │   ├── src/
│   │   │   ├── index.js                 # bin entry
│   │   │   ├── argv/
│   │   │   │   ├── parse-argv.js
│   │   │   │   └── cli-to-config-patch.js
│   │   │   └── commands/
│   │   │       ├── run.js
│   │   │       ├── fix.js
│   │   │       ├── init.js
│   │   │       ├── list.js
│   │   │       └── validate.js
│   │   └── package.json
│   │
│   └── utils/                           # @checkr/utils (public, zero deps)
│       ├── src/
│       │   ├── index.js
│       │   ├── file-walker.js
│       │   ├── ignore-handler.js
│       │   ├── colors.js                # manual ANSI, NO chalk
│       │   └── path-utils.js
│       └── package.json
│
├── types/
│   └── checkr.config.d.ts               # shipped types for user projects
│
├── examples/
│   ├── minimal/
│   └── symphony-rules/
│
├── Docs/
│   ├── IMPLEMENTATION_PLAN.md           # this plan (persisted)
│   ├── CONFIG.md                        # updated for v2 model
│   └── ...
│
├── package.json                         # workspaces root
└── toolkit/                             # DELETE after migration
```

---

## 3. Dependency Policy

| Package | Allowed deps | Rationale |
|---------|--------------|-----------|
| `@checkr/helpers` | **none** | Pure primitives — parse, merge, path, naming |
| `@checkr/utils` | **none** | Rule authors import this; must stay light |
| `@checkr/core` | **`simple-git`**, **`ignore`** | Only git-related libs permitted |
| `@checkr/cli` | `@checkr/core`, `@checkr/helpers` | No other runtime deps |

### Why these two git libs

| Library | Role |
|---------|------|
| [`ignore`](https://www.npmjs.com/package/ignore) | Parse `.gitignore` rules correctly (negation, `**`, trailing slashes) |
| [`simple-git`](https://www.npmjs.com/package/simple-git) | Reliable `status`, `diff`, `rev-parse`, branch HEAD — avoids brittle raw `git` CLI parsing on Windows/PowerShell |

**No chalk. No fast-glob in v1** — file walking uses Node `fs` + config-driven filters; gitignore via `ignore` package.

---

## 4. Configuration Architecture

### 4.1 Resolution layers

```
Layer 0: ENGINE_DEFAULTS          (packages/core/src/config/defaults.js)
Layer 1: checkr.config.js         (project root — optional)
Layer 2: CLI flags                (always wins)
         ↓
   ResolvedGlobalConfig
         ↓
   Per-step: merge(Global, step.overrides, CLI step patch)
         ↓
   ResolvedStepConfig[]  →  runner uses one resolved config per step
```

**No `checkr.json`.** Config is JS (or `.cjs` / `.ts` with loader). Type safety comes from `checkr.config.d.ts`.

### 4.2 `checkr.config.js` — full example

```js
// checkr.config.js
/** @type {import('checkr').CheckrConfig} */
export default {
  // ── Global: directories ──
  checksDir: "./.checkr/checks",
  fixesDir: "./.checkr/fixes",

  // ── Global: file selection ──
  include: ["**/*.{ts,tsx,js,jsx}"],
  exclude: ["**/*.stories.*", "**/*.test.*", "**/*.spec.*"],
  gitignore: ".gitignore",        // null = disabled; string = path to read
  scanPath: ".",

  // ── Global: execution ──
  bail: true,
  parallel: true,
  concurrency: 4,

  // ── Global: source ignore blocks ──
  ignoreMarker: "@checkr-ignore",

  // ── Global: reporting ──
  reporter: "default",
  reportFile: null,
  verbose: false,

  // ── Global: cache ──
  cache: true,
  cacheDir: ".checkr-cache",

  // ── Steps: ordered list with per-step overrides ──
  steps: [
  {
    id: "check_raw_colors",
    step: 1,
    description: "No raw color strings",
    enabled: true,
    // step-level overrides (optional — inherit global if omitted)
    include: ["src/**/*.{tsx,ts}"],
    gitignore: ".gitignore",      // can differ per step
    extensions: [".tsx", ".ts"],  // shortcut filter
  },
  {
    id: "check_raw_sizes",
    step: 2,
    enabled: true,
  },
  {
    id: "check_box_as_primitive",
    enabled: false,               // disabled globally in config
  },
  ],
};
```

If `steps` is **omitted** → discover all `check_*.js`, alphabetical order, each step inherits global config only.

### 4.3 Per-step override rules

`StepConfig` extends a **partial** of global scan/execution fields:

| Field | Global | Step override | Notes |
|-------|--------|---------------|-------|
| `include` | ✓ | ✓ | Step replaces global `include` when set |
| `exclude` | ✓ | ✓ | Merged: global exclude + step exclude |
| `gitignore` | ✓ | ✓ | Step path wins over global |
| `extensions` | — | ✓ | Step-only shortcut |
| `scope` | — | ✓ | Step-only path prefixes (e.g. `src/components/`) |
| `ignoreMarker` | ✓ | ✓ | Step wins |
| `bail` | ✓ | ✓ | Step-level bail (see runner semantics) |
| `concurrency` | ✓ | ✓ | Step wins |
| `enabled` | — | ✓ | Skip step without removing from list |
| `options` | — | ✓ | Opaque bag passed to check via `RunContext` |

Merge implementation lives in `@checkr/helpers/config/resolve-step-config.js` — single source of truth, fully unit-tested.

### 4.4 `gitignore` behavior

```js
gitignore: null          // default — only use include/exclude globs
gitignore: ".gitignore"  // read file, build Ignore filter, apply to candidate paths
gitignore: ".cursorignore"  // any ignore-format file
```

**Pipeline per step:**

```
candidateFiles = walk(scanPath, extensions from resolved step config)
candidateFiles = applyIncludeExclude(candidateFiles, include, exclude)
if (resolved.gitignore) {
  candidateFiles = applyGitignoreFilter(candidateFiles, readFile(gitignore))
}
return candidateFiles
```

Users stop hand-maintaining `.next`, `dist`, `build` in `exclude` when their `.gitignore` already covers them.

CLI: `--gitignore <path>` | `--no-gitignore` (sets `null`)

### 4.5 `checkr.config.d.ts`

Shipped at repo root `types/checkr.config.d.ts` and published from `@checkr/core` (or root `checkr` types entry):

```ts
// types/checkr.config.d.ts
declare module "checkr" {
  export type ReporterType = "default" | "json" | "compact";

  export interface StepConfig {
    id: string;
    step?: number;
    description?: string;
    enabled?: boolean;
    include?: string[];
    exclude?: string[];
    gitignore?: string | null;
    extensions?: string[];
    scope?: string[];
    ignoreMarker?: string;
    bail?: boolean;
    concurrency?: number;
    options?: Record<string, unknown>;
  }

  export interface CheckrConfig {
    checksDir?: string;
    fixesDir?: string;
    include?: string[];
    exclude?: string[];
    gitignore?: string | null;
    scanPath?: string;
    bail?: boolean;
    parallel?: boolean;
    concurrency?: number;
    ignoreMarker?: string;
    reporter?: ReporterType;
    reportFile?: string | null;
    verbose?: boolean;
    cache?: boolean;
    cacheDir?: string;
    steps?: StepConfig[];
  }
}
```

User project setup:

```js
// checkr.config.js
/** @type {import('checkr').CheckrConfig} */
export default { ... }
```

Or copy `checkr.config.d.ts` into project root and reference it in `tsconfig.json` `"types"`.

---

## 5. `@checkr/helpers` — Professional Primitives

Every non-trivial operation goes through helpers. **No ad-hoc string splitting in CLI or core.**

### 5.1 Parse helpers

| Function | Input | Output | Purpose |
|----------|-------|--------|---------|
| `parseArgsString(str)` | `"a,b,c"` | `['a','b','c']` | CLI comma lists without `[]` |
| `parseArgsArrayString(str)` | `"a, b, \"c,d\""` | `['a','b','c,d']` | Quoted tokens, escaped commas |
| `parseBooleanFlag(val)` | `"true"`, `"0"`, `undefined` | `boolean` | Consistent bool coercion |
| `parsePositiveInt(val, fallback)` | `"4"` | `4` | `--concurrency` |
| `parseKeyValue(str)` | `"key=value"` | `{ key, value }` | Future extensibility |

### 5.2 Config helpers

| Function | Purpose |
|----------|---------|
| `pickDefined(obj)` | Strip `undefined` keys before merge |
| `mergeConfig(base, ...overrides)` | Deep merge with array-replace semantics for `include`/`exclude` |
| `resolveStepConfig(global, step, cliStepPatch)` | Produces final per-step config |
| `validateConfig(config)` | Throws `ConfigError` with field path |

### 5.3 Naming helpers

| Function | Example |
|----------|---------|
| `deriveCheckExport('check_raw_colors.js')` | `'checkRawColors'` |
| `deriveFixExport('fix_raw_sizes.js')` | `'fixRawSizes'` |
| `snakeToCamel('raw_colors')` | `'rawColors'` |

### 5.4 Path helpers

| Function | Purpose |
|----------|---------|
| `normalizePosixPath(p)` | Windows `\` → `/` |
| `toAbsolute(p, cwd)` | Resolve relative to project root |
| `isInsideDir(file, dir)` | Scope matching |

**Rule:** if logic appears in more than one package → move to `@checkr/helpers`.

---

## 6. CLI → Config Override Map

CLI builds a `ConfigPatch` object; `resolveConfig(defaults, fileConfig, patch)` applies it.

| CLI flag | Config patch |
|----------|--------------|
| `--config <file>` | Load Layer 1 from path |
| `--no-bail` | `{ bail: false }` |
| `--no-cache` | `{ cache: false }` |
| `--clear-cache` | action (not config) |
| `--concurrency N` | `{ concurrency: N }` |
| `--no-parallel` | `{ parallel: false }` |
| `--reporter <type>` | `{ reporter }` |
| `--report <file>` | `{ reportFile }` |
| `--verbose` | `{ verbose: true }` |
| `--ignore-marker <s>` | `{ ignoreMarker }` |
| `--gitignore <path>` | `{ gitignore }` |
| `--no-gitignore` | `{ gitignore: null }` |
| `--checks-dir <path>` | `{ checksDir }` |
| `--fixes-dir <path>` | `{ fixesDir }` |
| `--changed` | `{ scanMode: 'changed' }` |
| `--staged` | `{ scanMode: 'staged' }` |
| `--skip a,b,c` | `{ skip: parseArgsString(...) }` |
| `--only a,b` | `{ only: parseArgsString(...) }` |
| `--steps a,b,c` | `{ stepOrder: parseArgsString(...) }` |
| `--disable <id>` | `{ disable: [...] }` |
| `--enable <id>` | `{ enable: [...] }` |
| `[path]` positional | `{ scanPath }` |

**Precedence for steps:** `--only` > `--steps` > `config.steps` > alphabetical discovery.  
**Precedence for enable:** `--enable` > `--disable` > `step.enabled` in config.

---

## 7. Check Function Contract (v1)

```js
// .checkr/checks/check_raw_colors.js
import { buildIgnoredLines } from '@checkr/utils'

export function checkRawColors(source, filePath, context) {
  const { ignoreMarker, options } = context
  const ignored = buildIgnoredLines(source.split('\n'), { marker: ignoreMarker })
  // ...
  return violations
}
```

`context` is built from **resolved step config** — rule authors get the right `ignoreMarker` and custom `options` without global state.

Backward compatible: if check accepts 2 args only, engine calls `fn(source, filePath)`.

---

## 8. Git Module (`packages/core/src/git/`)

### `git-service.js` (simple-git)

- `isRepo()` — false → warn + full scan fallback
- `getChangedPaths(since)` — for `--changed`
- `getStagedPaths()` — for `--staged`
- `getHead()`, `getBranch()` — cache key material
- `diffPaths(from, to)` — incremental cache invalidation

### `gitignore-filter.js` (ignore)

- `createGitignoreFilter(filePath, cwd)` → `(relativePath) => boolean`
- Handles multiple gitignore files later (v1.1): root + nested

### `diff-cache.js`

- Combines git state + content hashes
- Replaces Symphony-specific `check-violations-cache.js` logic
- Config-driven `cacheDir`

---

## 9. Migration: What Happens to `toolkit/`

| Action | Items |
|--------|-------|
| **Port → `@checkr/utils`** | `file-walker`, `ignore-handler` (marker param), `path-utils`, `colors` (rewrite) |
| **Port → `@checkr/core/git`** | Cache/diff logic from `check-violations-cache.js` |
| **Port → `@checkr/core/reporter`** | `reporter.js`, `ignore-report.js` |
| **Move → `examples/symphony-rules/`** | 10 architecture checks + their tests |
| **Delete** | Orphan design-system tests (no implementation), `cli-runner.js`, `scope-matcher.js` (replaced by config `scope`), `app-workbench-analyzer.js`, `check-all.js`, `scripts/*`, chalk |
| **Delete folder** | `toolkit/` after ports complete |

---

## 10. Implementation Phases

### Phase 0 — Scaffold (lead agent, ~1h)
- Workspaces root `package.json`
- Empty packages: `helpers`, `core`, `cli`, `utils`
- `types/checkr.config.d.ts`
- Pin vitest; fix `catalog:` issue

### Phase 1 — Helpers + Types (Agent A)
- All `@checkr/helpers` modules + full test suite
- `validateConfig`, `resolveStepConfig`, `mergeConfig`
- `parseArgsString`, `parseArgsArrayString` edge-case tests

### Phase 2 — Utils + Colors (Agent B)
- Port utils, zero deps
- `buildIgnoredLines(lines, { marker })` — marker from config, not hardcoded `@symphony-ignore`
- Manual ANSI `colors.js` with `NO_COLOR` support

### Phase 3 — Core Engine (Agent C)
- `load-config.js`, `resolve-config.js`
- `git-service`, `gitignore-filter`, `diff-cache`
- `loader`, `scanner`, `runner`, `reporter`
- `engine.js` with per-step resolved config
- Integration fixtures

### Phase 4 — CLI + Cleanup (Agent D)
- `parse-argv.js` using helpers only
- Commands: `run`, `list`, `validate`, `init`
- Migrate/delete `toolkit/`
- `examples/minimal/` E2E

### Phase 5 — Fix + Watch (post-MVP)
- `checkr fix`, `checkr watch` per roadmap

---

## 11. Agent Pool — use `up-agents 4 + 1`

Orchestration is defined in **`.cursor/skills/up-agents/SKILL.md`**. Say `up-agents 4 + 1` (or `/up-agents 4 + 1 implement plan.md`) to launch without re-explaining.

Checkr-specific worker scopes and sleep table: **`.cursor/skills/up-agents/reference.md`**.

| Agent | Package | Deliverable | Sleep |
|-------|---------|-------------|-------|
| **W1** | scaffold + `@checkr/helpers` | Parse/config/path helpers + types | 0s |
| **W2** | `@checkr/utils` | File walker, ignore handler, colors | 60s |
| **W3** | `@checkr/core` | Engine + git + config resolution | 180s |
| **W4** | `@checkr/cli` + migration | CLI, toolkit cleanup, examples | 480s |
| **Reviewer** | integration QA | Build, test, DoD review | 800s |

**Parallelism:** launch all 5 in one message; workers sleep before work per skill schedule.
---

## 12. Definition of Done (v1.0)

- [ ] `checkr.config.js` + `checkr.config.d.ts` documented and working
- [ ] Global config + per-step overrides via `steps[].*`
- [ ] `gitignore: ".gitignore"` filters files correctly
- [ ] CLI overrides every config field
- [ ] `@checkr/helpers` with `parseArgsString`, `parseArgsArrayString`, config merge
- [ ] Only `simple-git` + `ignore` as external deps (in core)
- [ ] No chalk anywhere
- [ ] `toolkit/` removed; Symphony rules in `examples/`
- [ ] `checkr run` E2E on `examples/minimal/`

---

## 13. Doc Updates Required

| File | Change |
|------|--------|
| `CONFIG.md` | `checkr.config.js` only; `gitignore`; step overrides; remove json references |
| `CLI.md` | `--gitignore`, `--skip`, `--only`, full override table |
| `ARCHITECTURE.md` | `@checkr/helpers`, git module, config resolution diagram |
| `DECISIONS.md` | DD: no json config; DD: gitignore integration; DD: allowed deps |
| `CONTRIBUTING.md` | Real package layout |