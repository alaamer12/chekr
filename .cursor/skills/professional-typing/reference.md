# professional-typing — Reference

## Layering diagram

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: .d.ts (authoring)     import('pkg').Config    │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Runtime validator     validateConfig() in JS  │
│           (zero deps, shipped in engine/helpers)        │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Zod schema            dev / CI / optional npm │
│           schema.zod.js + bun test                      │
└─────────────────────────────────────────────────────────┘
```

CLI / programmatic patches get their own interface (`CliConfigPatch`) so file config types stay honest.

---

## Primitive catalog

### Paths and files

```ts
export type PathLike = string;
export type GitignorePath = PathLike | null;
export type GlobPattern = string;
export type FileExtension = `.${string}`;
export type ScopePrefix = PathLike;
```

### Identifiers

```ts
export type CheckId = `check_${string}`;
export type FixId = `fix_${string}`;
export type NonEmptyString = string;
```

Runtime regex (keep in sync):

```js
/^check_[a-z][a-z0-9_]*$/
/^fix_[a-z][a-z0-9_]*$/
```

### Numbers and enums

```ts
export type PositiveInt = number;
export type ScanMode = "full" | "changed" | "staged";
export type ReporterType = "default" | "json" | "compact";
export type StepStatus = "pass" | "fail" | "skip";
```

### Opaque bags

```ts
export type StepOptions = Record<string, unknown>;
```

Use `StepOptions` for per-step `options` — avoids coupling types to every rule.

---

## Interface composition

```ts
export interface StepConfig {
  id: CheckId;
  // partial override of global scan/execution fields
  include?: GlobPattern[];
  gitignore?: GitignorePath;
  options?: StepOptions;
}

export interface CheckrConfig {
  checksDir?: PathLike;
  steps?: StepConfig[];
}

export interface CliConfigPatch {
  skip?: CheckId[];
  scanMode?: ScanMode;
}

export interface ResolvedCheckrConfig extends Required<Pick<CheckrConfig, "checksDir" | …>> {
  skip: CheckId[];
  scanMode: ScanMode;
}
```

---

## JSDoc patterns

```ts
/**
 * Loaded from `checkr.config.js` at project root.
 * @example
 * ```js
 * export default { checksDir: "./.checkr/checks" };
 * ```
 */
export interface CheckrConfig { … }
```

---

## Validator ↔ type sync table

Maintain this when adding fields:

| Field | .d.ts type | validateConfig | Zod |
|-------|------------|----------------|-----|
| `checksDir` | `PathLike` | `assertPathLike` | `z.string().min(1)` |
| `gitignore` | `GitignorePath` | `assertStringOrNull` | `.nullable()` |
| `steps[].id` | `CheckId` | `assertCheckId` | `checkId` regex |
| `scanMode` | `ScanMode` | enum array | `z.enum([...])` |
| `reporter` | `ReporterType` | enum array | `z.enum([...])` |
| `concurrency` | `PositiveInt` | positive integer | `.int().positive()` |

---

## Anti-patterns

| Avoid | Prefer |
|-------|--------|
| `string & { __brand: "Path" }` in user .d.ts | `PathLike` alias + JSDoc |
| Only .d.ts, no runtime check | validateConfig + Zod tests |
| typia in vitest without transform setup | Zod + `bun test` |
| Duplicated enums in 5 files | Single `REPORTER_TYPES` const in validator |
