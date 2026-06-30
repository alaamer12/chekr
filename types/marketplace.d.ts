import type { PathLike, CheckId, NonEmptyString } from "chekr";

export interface MarketplaceFileMapping {
  /** Local path relative to the check script, mapped to remote storage path. */
  src: string;
  /** Final installation path relative to user's configured `checksDir`. */
  dest: string;
}

export interface MarketplaceCheckEntry {
  /** Uniquely identifies the checker (must match check_<name> standard). */
  id: CheckId;
  /** Human-readable short title. */
  name: string;
  /** A one-line summary of what the rule aims to achieve. */
  goal: string;
  /** Detailed description of the full checking logic and algorithms. */
  description: string;
  /** Indicates whether the check has a corresponding auto-fixer script. */
  hasFixes: boolean;
  /** Categorization tags for searching. */
  tags: string[];
  /** Recommended programming languages target (e.g. ["jsx", "tsx", "js", "ts"]). */
  recommendedLanguages: string[];
  /** Script author credentials or name. */
  author: string;
  /** Semantic version string (e.g., "1.0.0"). */
  version: string;
  /** Mapped files required for this check to function properly. */
  files: MarketplaceFileMapping[];
}

export type MarketplaceRegistry = MarketplaceCheckEntry[];

/** 
 * Schema for .chekr/marketplace.lock.json 
 */
export interface MarketplaceLockEntry {
  id: CheckId;
  version: string;
  installedAt: string;
  repository: string;
  files: PathLike[];
}

export interface MarketplaceLockFile {
  version: number;
  installed: MarketplaceLockEntry[];
}
