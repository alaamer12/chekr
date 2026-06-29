# checkr — Configuration Reference (v2)

Config is **`checkr.config.js` only** (no JSON). Types ship in `types/checkr.config.d.ts`.

---

## Resolution layers

```
ENGINE_DEFAULTS  →  checkr.config.js  →  CLI flags
```

CLI always wins. Per-step config merges global + `steps[].*` + CLI step filters.

---

## Example

```js
// checkr.config.js
/** @type {import('checkr').CheckrConfig} */
export default {
  checksDir: "./.checkr/checks",
  fixesDir: "./.checkr/fixes",
  include: ["**/*.{ts,tsx,js,jsx}"],
  exclude: ["**/*.stories.*", "**/*.test.*"],
  gitignore: ".gitignore",   // null to disable
  scanPath: ".",
  bail: true,
  parallel: true,
  concurrency: 4,
  ignoreMarker: "@checkr-ignore",
  reporter: "default",
  reportFile: null,
  verbose: false,
  cache: true,
  cacheDir: ".checkr-cache",
  steps: [
    {
      id: "check_raw_colors",
      step: 1,
      description: "No raw color strings",
      include: ["src/**/*.{tsx,ts}"],
      enabled: true,
    },
  ],
};
```

---

## Options

| Field | Default | Description |
|-------|---------|-------------|
| `checksDir` | `./.checkr/checks` | Directory of `check_*.js` rules |
| `fixesDir` | `./.checkr/fixes` | Directory of `fix_*.js` fixers |
| `include` | `**/*.{js,jsx,ts,tsx}` | Glob include patterns |
| `exclude` | `[]` | Glob exclude patterns |
| `gitignore` | `null` | Path to ignore file, or `null` |
| `scanPath` | `.` | Root path to scan |
| `bail` | `true` | Stop after first failing step |
| `parallel` | `true` | Parallel file processing |
| `concurrency` | `4` | Max parallel workers |
| `ignoreMarker` | `@checkr-ignore` | Source ignore block marker |
| `reporter` | `default` | `default`, `json`, or `compact` |
| `reportFile` | `null` | Optional report output path |
| `verbose` | `false` | Verbose reporting |
| `cache` | `true` | Enable result cache |
| `cacheDir` | `.checkr-cache` | Cache directory |
| `steps` | auto-discover | Ordered step list with per-step overrides |

---

## Per-step overrides

Each `steps[]` entry may override: `include`, `exclude`, `gitignore`, `extensions`, `scope`, `ignoreMarker`, `bail`, `concurrency`, `enabled`, `options`.

Step `id` must match the check filename: `check_raw_colors.js` → `id: "check_raw_colors"`.

---

## gitignore

When set (e.g. `".gitignore"`), candidate files are filtered using the [`ignore`](https://www.npmjs.com/package/ignore) package — same semantics as Git.

CLI: `--gitignore <path>` or `--no-gitignore`.

---

## Zero-config

Drop `check_*.js` files in `.checkr/checks/` and run:

```bash
checkr run
```

No config file required.
