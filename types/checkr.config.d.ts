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
