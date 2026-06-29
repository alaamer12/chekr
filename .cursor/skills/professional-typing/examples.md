# professional-typing — Examples

## Example 1: Config (chekr)

### Before

```ts
declare module "chekr" {
  export interface ChekrConfig {
    checksDir?: string;
    gitignore?: string | null;
    steps?: { id: string; step?: number }[];
  }
}
```

### After

```ts
declare module "chekr" {
  export type PathLike = string;
  export type GitignorePath = PathLike | null;
  export type CheckId = `check_${string}`;
  export type PositiveInt = number;
  export type ScanMode = "full" | "changed" | "staged";

  export interface StepConfig {
    id: CheckId;
    step?: PositiveInt;
    gitignore?: GitignorePath;
  }

  export interface ChekrConfig {
    checksDir?: PathLike;
    gitignore?: GitignorePath;
    scanMode?: ScanMode;
    steps?: StepConfig[];
  }
}
```

### User config

```js
/** @type {import('chekr').ChekrConfig} */
export default {
  checksDir: "./.chekr/checks",
  gitignore: ".gitignore",
  steps: [{ id: "check_raw_colors", step: 1 }],
};
```

---

## Example 2: API response shape

### Before

```ts
interface RunResult {
  passed: boolean;
  violations: { file: string; line: number; message: string }[];
}
```

### After

```ts
type RelativeFilePath = string;
type LineNumber = number;

interface Violation {
  file: RelativeFilePath;
  line: LineNumber;
  message: string;
  text?: string;
  fix?: string;
}

type StepStatus = "pass" | "fail" | "skip";

interface StepResult {
  id: CheckId;
  status: StepStatus;
  violations: Violation[];
}

interface RunResult {
  passed: boolean;
  violations: Violation[];
  steps: StepResult[];
}
```

---

## Example 3: Adding a new config field

1. Add to `ChekrConfig` in `.d.ts` with semantic type
2. Add to `ENGINE_DEFAULTS` in core
3. Add validation in `validate-config.js`
4. Add to `schema.zod.js` + test case
5. Document in `CONFIG.md`
