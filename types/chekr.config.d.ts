/**
 * Configuration types for chekr user projects.
 *
 * @example chekr.config.js
 * ```js
 * // @ts-check
 * /** @type {import('chekr').ChekrConfig} *\/
 * export default {
 *   checksDir: "./.chekr/checks",
 *   gitignore: ".gitignore",
 *   steps: [{ id: "check_raw_colors", step: 1 }],
 * };
 * ```
 */

declare module "chekr" {
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
  export type Severity = "error" | "warning" | "info";

  /** 
   * A specific occurrence of a violation in a file.
   * Useful for repo-level checks that find relationships between multiple points.
   */
  export interface ViolationOccurrence {
    file: PathLike;
    line?: number;
    column?: number;
    text?: string;
    snippet?: string;
    context?: string;
  }

  /**
   * Structured violation output.
   * Instead of just a string message, rules can provide deep context.
   */
  export interface Violation {
    message: string;
    checkId?: CheckId;
    step?: PositiveInt;
    severity?: Severity;
    /** The primary file/location where the violation is reported. */
    file?: PathLike;
    line?: number;
    column?: number;
    text?: string;
    /** Related locations (e.g., the original interface in a duplication check). */
    occurrences?: ViolationOccurrence[];
    /** 
     * Internal: Flattened locations for reporters. 
     * Do not use in check functions.
     */
    locations?: Array<ViolationOccurrence & { label?: string }>;
    /** Machine-readable code for filtering/tooling. */
    code?: string;
    /** 
     * Unique identifier for grouping related violations into a single relational report.
     * If multiple violations share the same logicalId, they will be merged.
     */
    logicalId?: string;
    /** 
     * Brief explanation of why this violation matters (e.g. "Security Risk", "Maintenance Cost").
     */
    impact?: string;
    /** Suggested fix description or auto-fix metadata. */
    fix?: string;
    /** Arbitrary structured data for custom reporters. */
    data?: Record<string, unknown>;
  }

  /** Function to report a violation within a check. */
  export type ReportFn = (violation: Violation | string) => void;

  // ── Config ─────────────────────────────────────────────────────────────────

  /** Per-step overrides; unset fields inherit from {@link ChekrConfig}. */
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

  /** Loaded from `chekr.config.js` at project root. */
  export interface ChekrConfig {
    checksDir?: PathLike;
    fixesDir?: PathLike;
    marketplace?: {
      /** GitHub repository in "owner/repo" format. */
      repository?: string;
      /** Target branch for publishing/installing (default: "main"). */
      branch?: string;
      /** 
       * Metadata for publishing checks to the marketplace.
       * Keyed by CheckId.
       */
      publish?: Record<string, Omit<import("./marketplace").MarketplaceCheckEntry, "id">>;
    };
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
  export interface ResolvedChekrConfig
    extends Required<
      Pick<
        ChekrConfig,
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
    marketplace: {
      repository: string;
      branch: string;
      publish?: Record<string, Omit<import("./marketplace").MarketplaceCheckEntry, "id">>;
    };
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
    stepConfig: StepConfig & ChekrConfig;
    /** 
     * Optimization context for repo-level checks. 
     * Only available in repoFn.
     */
    optimize?: boolean;
    /** Files that haven't changed since last run (if caching is enabled). */
    unmodifiedFiles?: Set<PathLike>;
    /** 
     * Hook to report violations one-by-one. 
     * If used, the check function can return `void` or `undefined`.
     */
    report: ReportFn;
  }
}
