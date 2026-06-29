/**
 * Re-exports semantic primitive names for advanced typing.
 * Primary entry: `import('chekr')` from chekr.config.d.ts
 */

export type PositiveInt = number;
export type NonEmptyString = string;
export type PathLike = string;
export type GitignorePath = PathLike | null;
export type GlobPattern = string;
export type FileExtension = `.${string}`;
export type ScopePrefix = PathLike;
export type IgnoreMarker = NonEmptyString;
export type CheckId = `check_${string}`;
export type FixId = `fix_${string}`;
export type ScanMode = "full" | "changed" | "staged";
export type ReporterType = "default" | "json" | "compact";
export type StepStatus = "pass" | "fail" | "skip";
export type StepOptions = Record<string, unknown>;
