/**
 * Configuration types for checkr user projects.
 *
 * @example checkr.config.js
 * ```js
 * // @ts-check
 * /** @type {import('checkr').CheckrConfig} *\/
 * export default {
 *   checksDir: "./.checkr/checks",
 *   gitignore: ".gitignore",
 *   steps: [{ id: "check_raw_colors", step: 1 }],
 * };
 * ```
 */

declare module "checkr" {
  // ── Primitives ─────────────────────────────────────────────────────────────

  /** Positive integer ≥ 1 (step order, concurrency). */
  export type PositiveInt = number;

  /** Non-empty string. */
  export type NonEmptyString = string;

  /**
   * Filesystem path relative to project root or absolute.
   * Prefer forward slashes on all platforms.
   */
  export type PathLike = string;

  /** `.gitignore`-format file path, or `null` to disable. */
  export type GitignorePath = PathLike | null;

  /** Glob for `include` / `exclude` (brace expansion supported). */
  export type GlobPattern = string;

  /** Extension with dot, e.g. `.tsx`. */
  export type FileExtension = `.${string}`;

  /** Path prefix limiting files for a step. */
  export type ScopePrefix = PathLike;

  /** Ignore block keyword without `-start` / `-end`. */
  export type IgnoreMarker = NonEmptyString;

  /** `check_*.js` basename without `.js`. */
  export type CheckId = `check_${string}`;

  /** `fix_*.js` basename without `.js`. */
  export type FixId = `fix_${string}`;

  export type ScanMode = "full" | "changed" | "staged";
  export type ReporterType = "default" | "json" | "compact";
  export type StepStatus = "pass" | "fail" | "skip";
  export type StepOptions = Record<string, unknown>;

  // ── Config ─────────────────────────────────────────────────────────────────

  /** Per-step overrides; unset fields inherit from {@link CheckrConfig}. */
  export interface StepConfig {
    id: CheckId;
    step?: PositiveInt;
    description?: string;
    enabled?: boolean;
    include?: GlobPattern[];
    exclude?: GlobPattern[];
    gitignore?: GitignorePath;
    extensions?: FileExtension[];
    scope?: ScopePrefix[];
    ignoreMarker?: IgnoreMarker;
    bail?: boolean;
    concurrency?: PositiveInt;
    options?: StepOptions;
  }

  /** Loaded from `checkr.config.js` at project root. */
  export interface CheckrConfig {
    checksDir?: PathLike;
    fixesDir?: PathLike;
    include?: GlobPattern[];
    exclude?: GlobPattern[];
    gitignore?: GitignorePath;
    scanPath?: PathLike;
    scanMode?: ScanMode;
    bail?: boolean;
    parallel?: boolean;
    concurrency?: PositiveInt;
    ignoreMarker?: IgnoreMarker;
    reporter?: ReporterType;
    reportFile?: PathLike | null;
    verbose?: boolean;
    cache?: boolean;
    cacheDir?: PathLike;
    steps?: StepConfig[];
  }

  /** CLI flags / `run(patch)` merged after file config. */
  export interface CliConfigPatch {
    configPath?: PathLike;
    scanMode?: ScanMode;
    bail?: boolean;
    cache?: boolean;
    parallel?: boolean;
    concurrency?: PositiveInt;
    reporter?: ReporterType;
    reportFile?: PathLike | null;
    verbose?: boolean;
    ignoreMarker?: IgnoreMarker;
    gitignore?: GitignorePath;
    checksDir?: PathLike;
    fixesDir?: PathLike;
    scanPath?: PathLike;
    skip?: CheckId[];
    only?: CheckId[];
    stepOrder?: CheckId[];
    disable?: CheckId[];
    enable?: CheckId[];
    cwd?: PathLike;
    loadFileConfig?: boolean;
  }

  /** After defaults + file + CLI merge. */
  export interface ResolvedCheckrConfig
    extends Required<
      Pick<
        CheckrConfig,
        | "checksDir"
        | "fixesDir"
        | "include"
        | "exclude"
        | "gitignore"
        | "scanPath"
        | "bail"
        | "parallel"
        | "concurrency"
        | "ignoreMarker"
        | "reporter"
        | "verbose"
        | "cache"
        | "cacheDir"
      >
    > {
    reportFile: PathLike | null;
    scanMode: ScanMode;
    steps?: StepConfig[];
    skip: CheckId[];
    only: CheckId[];
    stepOrder?: CheckId[];
    disable: CheckId[];
    enable: CheckId[];
    cwd: PathLike;
  }

  /** Optional third argument to check functions. */
  export interface RunContext {
    ignoreMarker: IgnoreMarker;
    options: StepOptions;
    cwd: PathLike;
    stepConfig: StepConfig & CheckrConfig;
  }
}
