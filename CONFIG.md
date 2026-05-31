# checkr — Configuration Reference

---

## Config file

checkr looks for `checkr.config.js` (or `checkr.config.ts`) in the current working directory.

```js
// checkr.config.js
export default {
  checksDir: './.checkr/checks',
  fixesDir: './.checkr/fixes',
  include: ['**/*.{ts,tsx,js,jsx}'],
  exclude: [
    '**/node_modules/**',
    '**/*.stories.*',
    '**/*.test.*',
    '**/*.spec.*',
  ],
  bail: true,
  parallel: true,
  concurrency: 4,
  ignoreMarker: '@checkr-ignore',
  reporter: 'default',
}
```

All fields are optional. Omitting the config file entirely uses the same defaults.

---

## Options

### `checksDir`
**Type:** `string`  
**Default:** `'./.checkr/checks'`

Directory where check files live. All files matching `check_*.js` in this directory are loaded.

```js
checksDir: './my-rules/checks'
```

---

### `fixesDir`
**Type:** `string`  
**Default:** `'./.checkr/fixes'`

Directory where fix files live. All files matching `fix_*.js` in this directory are loaded.

```js
fixesDir: './my-rules/fixes'
```

---

### `include`
**Type:** `string[]`  
**Default:** `['**/*.{ts,tsx,js,jsx}']`

Glob patterns for files to scan. Relative to the project root.

```js
include: ['src/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}']
```

---

### `exclude`
**Type:** `string[]`  
**Default:** `['**/node_modules/**', '**/*.stories.*', '**/*.test.*', '**/*.spec.*']`

Glob patterns for files to exclude. Takes precedence over `include`.

```js
exclude: [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.stories.*',
  '**/*.test.*',
]
```

---

### `bail`
**Type:** `boolean`  
**Default:** `true`

When `true`, stop running checks after the first step that produces violations. When `false`, run all steps and report all violations.

```js
bail: false  // run everything, show all failures
```

---

### `parallel`
**Type:** `boolean`  
**Default:** `true`

When `true`, run checks against files in parallel using worker threads. When `false`, run sequentially (useful for debugging).

```js
parallel: false  // sequential, easier to debug
```

---

### `concurrency`
**Type:** `number`  
**Default:** `os.cpus().length`

Maximum number of files processed in parallel per step.

```js
concurrency: 8
```

---

### `steps`
**Type:** `Array<{ id: string, step?: number, description?: string }>`  
**Default:** `undefined` (all discovered checks, alphabetical order)

Explicit ordered list of steps. When provided, only the listed checks run.

```js
steps: [
  { id: 'check_ipc_direct',        step: 1 },
  { id: 'check_capability_deps',   step: 2 },
  { id: 'check_raw_colors',        step: 18, description: 'No raw color strings' },
  { id: 'check_raw_sizes',         step: 22 },
]
```

The `id` must match the filename without the `check_` prefix and `.js` extension:
- `.checkr/checks/check_raw_colors.js` → `id: 'check_raw_colors'`

---

### `ignoreMarker`
**Type:** `string`  
**Default:** `'@checkr-ignore'`

The keyword used in ignore block comments. Change this to keep your existing ignore syntax.

```js
ignoreMarker: '@symphony-ignore'  // keep existing Symphony ignore blocks
```

Source files use it like:
```js
// @checkr-ignore-start
const raw = '#5B8FF9'  // intentional
// @checkr-ignore-end
```

---

### `reporter`
**Type:** `'default' | 'json' | 'compact' | 'html'`  
**Default:** `'default'`

Output format.

| Value | Description |
|-------|-------------|
| `default` | Human-readable, colored, step-by-step output |
| `json` | Machine-readable JSON (useful for CI integrations) |
| `compact` | One line per violation |
| `html` | Self-contained HTML report with ignored blocks section (v1.6+) |

```js
reporter: 'html'
```

---

### `reportFile`
**Type:** `string`  
**Default:** `undefined`

Write the report to a file in addition to stdout.

```js
reportFile: './checkr-report.json'
```

---

### `cacheDir`
**Type:** `string`  
**Default:** `'./.checkr-cache'`

Directory for cached results.

```js
cacheDir: './.cache/checkr'
```

Add to `.gitignore`:
```
.checkr-cache/
```

---

## Zero-config mode

No config file needed. Drop check files in `.checkr/checks/` and run:

```
checkr run
```

checkr discovers all `check_*.js` files, runs them alphabetically against all `.ts/.tsx/.js/.jsx` files (excluding node_modules, stories, tests), and bails on first failure.

```
your-project/
  .checkr/
    checks/
      check_raw_colors.js    ← auto-discovered
      check_raw_sizes.js     ← auto-discovered
    fixes/
      fix_raw_sizes.js       ← auto-discovered
```

---

## Config file formats

```js
// checkr.config.js  (ES module — recommended)
export default { ... }

// checkr.config.cjs  (CommonJS)
module.exports = { ... }

// checkr.config.ts  (TypeScript — requires ts-node or Bun)
import type { CheckrConfig } from '@checkr/core'
export default { ... } satisfies CheckrConfig
```
