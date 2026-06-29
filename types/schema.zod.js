/**
 * Zod runtime schema mirroring `checkr.config.d.ts` (dev validation only).
 */

import { z } from "zod";

const checkId = z
  .string()
  .regex(/^check_[a-z][a-z0-9_]*$/, "must be check_<snake_case>");

const fixId = z
  .string()
  .regex(/^fix_[a-z][a-z0-9_]*$/, "must be fix_<snake_case>");

const pathLike = z.string().min(1);
const globPattern = z.string().min(1);
const fileExtension = z.string().regex(/^\./, "must start with a dot");
const positiveInt = z.number().int().positive();
const ignoreMarker = z.string().min(1);

export const stepConfigSchema = z.object({
  id: checkId,
  step: positiveInt.optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  include: z.array(globPattern).optional(),
  exclude: z.array(globPattern).optional(),
  gitignore: pathLike.nullable().optional(),
  extensions: z.array(fileExtension).optional(),
  scope: z.array(pathLike).optional(),
  ignoreMarker: ignoreMarker.optional(),
  bail: z.boolean().optional(),
  concurrency: positiveInt.optional(),
  options: z.record(z.unknown()).optional(),
});

export const checkrConfigSchema = z.object({
  checksDir: pathLike.optional(),
  fixesDir: pathLike.optional(),
  include: z.array(globPattern).optional(),
  exclude: z.array(globPattern).optional(),
  gitignore: pathLike.nullable().optional(),
  scanPath: pathLike.optional(),
  scanMode: z.enum(["full", "changed", "staged"]).optional(),
  bail: z.boolean().optional(),
  parallel: z.boolean().optional(),
  concurrency: positiveInt.optional(),
  ignoreMarker: ignoreMarker.optional(),
  reporter: z.enum(["default", "json", "compact"]).optional(),
  reportFile: pathLike.nullable().optional(),
  verbose: z.boolean().optional(),
  cache: z.boolean().optional(),
  cacheDir: pathLike.optional(),
  steps: z.array(stepConfigSchema).optional(),
});

export const cliConfigPatchSchema = z.object({
  scanMode: z.enum(["full", "changed", "staged"]).optional(),
  skip: z.array(checkId).optional(),
  only: z.array(checkId).optional(),
  concurrency: positiveInt.optional(),
});

/** @typedef {z.infer<typeof checkrConfigSchema>} CheckrConfigInput */
/** @typedef {z.infer<typeof stepConfigSchema>} StepConfigInput */

export { checkId, fixId, pathLike, globPattern };
