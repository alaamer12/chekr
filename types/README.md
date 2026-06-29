# @checkr/types

TypeScript definitions for `checkr.config.js` and programmatic `run()` options.

## Setup

```bash
bun add -d @checkr/types
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "types": ["checkr"]
  }
}
```

Or copy `checkr.config.d.ts` into your project root.

## Usage

```js
// checkr.config.js
/** @type {import('checkr').CheckrConfig} */
export default {
  checksDir: "./.checkr/checks",
  gitignore: ".gitignore",
  reporter: "default",
  steps: [
    {
      id: "check_raw_colors",
      step: 1,
      include: ["src/**/*.{ts,tsx}"],
    },
  ],
};
```

## Semantic types

| Type | Meaning |
|------|---------|
| `PathLike` | Directory or file path |
| `GlobPattern` | Include/exclude glob |
| `GitignorePath` | Path to ignore file or `null` |
| `CheckId` | `check_${string}` rule id |
| `IgnoreMarker` | `@checkr-ignore` style marker |
| `ScanMode` | `full` \| `changed` \| `staged` |

Runtime validation:

- **Production:** `@checkr/helpers` → `validateConfig()` (plain JS, no extra deps)
- **Dev / CI:** `@checkr/types` → `checkrConfigSchema` (Zod) in `schema.zod.js`

Optional: add [typia](https://typia.io) in a TypeScript-only consumer project for compile-time validators generated from these interfaces.
