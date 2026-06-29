import { readFile } from "node:fs/promises";
import { resolveStepConfig, chunk, toAbsolute } from "@checkr/helpers";
import { scanFiles } from "./scanner.js";
import {
  contentHash,
  partitionFilesByCache,
  loadStepCache,
  saveStepCache,
  stepCachePath,
  isStepCacheValid,
  parseModifiedPathsFromStatus,
  buildStatusFingerprint,
} from "./git/diff-cache.js";
import { getGitContext } from "./git/git-service.js";

/**
 * @typedef {object} StepResult
 * @property {string} id
 * @property {number} step
 * @property {string} name
 * @property {'pass' | 'fail' | 'skip'} status
 * @property {Array<{ file: string, line?: number, message: string, text?: string, fix?: string }>} violations
 * @property {{ checked: number, skipped: number, fullyCached?: boolean }} cacheInfo
 */

/**
 * Run a single check step.
 * @param {object} params
 * @param {import('./loader.js').LoadedCheck} params.check
 * @param {Record<string, unknown>} params.globalConfig
 * @param {Record<string, unknown>} [params.cliStepPatch]
 * @param {object | null} [params.gitContext]
 * @param {number} [params.stepNumber]
 * @returns {Promise<StepResult>}
 */
export async function runStep({
  check,
  globalConfig,
  cliStepPatch = {},
  gitContext = null,
  stepNumber = 1,
}) {
  const stepOverrides = check.config ?? { id: check.id };
  const resolved = resolveStepConfig(globalConfig, stepOverrides, cliStepPatch);
  const cwd = /** @type {string} */ (globalConfig.cwd ?? process.cwd());

  const files = await scanFiles(resolved, globalConfig);
  const violations = [];
  let toCheck = files;
  let skipped = [];
  let fullyCached = false;

  const useCache = globalConfig.cache !== false && gitContext;
  let cachedFileHashes = {};

  if (useCache) {
    const cacheDir = toAbsolute(
      /** @type {string} */ (globalConfig.cacheDir ?? ".checkr-cache"),
      cwd,
    );
    const cachePath = stepCachePath(cacheDir, gitContext, check.id);
    const stepCache = await loadStepCache(cachePath);

    if (isStepCacheValid(stepCache, gitContext)) {
      cachedFileHashes = stepCache?.files ?? {};
      const modifiedPaths = parseModifiedPathsFromStatus(gitContext.status ?? "");
      const partition = partitionFilesByCache(files, cachedFileHashes, modifiedPaths);
      toCheck = partition.toCheck;
      skipped = partition.skipped;
      fullyCached = toCheck.length === 0 && files.length > 0;

      if (fullyCached && stepCache?.violations?.length) {
        return {
          id: check.id,
          step: stepNumber,
          name: check.id,
          status: "fail",
          violations: stepCache.violations,
          cacheInfo: { checked: 0, skipped: files.length, fullyCached: true },
        };
      }
    }
  }

  const context = {
    ignoreMarker: resolved.ignoreMarker,
    options: resolved.options ?? {},
    cwd,
    stepConfig: resolved,
  };

  const concurrency = /** @type {number} */ (
    resolved.concurrency ?? globalConfig.concurrency ?? 4
  );
  const parallel = globalConfig.parallel !== false;

  const runFile = async (filePath) => {
    const absolute = toAbsolute(filePath, cwd);
    const source = await readFile(absolute, "utf8");
    const fn = check.fn;

    let fileViolations;
    if (fn.length >= 3) {
      fileViolations = await fn(source, filePath, context);
    } else {
      fileViolations = await fn(source, filePath);
    }

    if (Array.isArray(fileViolations)) {
      for (const v of fileViolations) {
        violations.push(v);
      }
    }

    if (useCache) {
      cachedFileHashes[filePath] = contentHash(source);
    }
  };

  if (parallel && concurrency > 1) {
    const batches = chunk(toCheck, concurrency);
    for (const batch of batches) {
      await Promise.all(batch.map(runFile));
    }
  } else {
    for (const filePath of toCheck) {
      await runFile(filePath);
    }
  }

  if (useCache && gitContext) {
    const cacheDir = toAbsolute(
      /** @type {string} */ (globalConfig.cacheDir ?? ".checkr-cache"),
      cwd,
    );
    const cachePath = stepCachePath(cacheDir, gitContext, check.id);
    const ctx = {
      ...gitContext,
      statusFingerprint: buildStatusFingerprint({
        head: gitContext.head,
        status: gitContext.status ?? "",
      }),
    };
    await saveStepCache(cachePath, ctx, cachedFileHashes, violations);
  }

  return {
    id: check.id,
    step: stepNumber,
    name: check.id,
    status: violations.length > 0 ? "fail" : "pass",
    violations,
    cacheInfo: {
      checked: toCheck.length,
      skipped: skipped.length,
      fullyCached,
    },
  };
}

/**
 * Run all steps with bail support.
 * @param {object} params
 * @param {import('./loader.js').LoadedCheck[]} params.checks
 * @param {Record<string, unknown>} params.globalConfig
 * @returns {Promise<StepResult[]>}
 */
export async function runSteps({ checks, globalConfig }) {
  const cwd = /** @type {string} */ (globalConfig.cwd ?? process.cwd());
  let gitContext = null;

  if (globalConfig.cache !== false) {
    gitContext = await getGitContext(cwd);
  }

  const results = [];
  let stepNumber = 1;

  for (const check of checks) {
    const stepOverrides = check.config ?? { id: check.id };
    const resolved = resolveStepConfig(globalConfig, stepOverrides);
    const bail = resolved.bail ?? globalConfig.bail;

    const result = await runStep({
      check,
      globalConfig,
      gitContext,
      stepNumber: check.step ?? stepNumber,
    });

    results.push(result);

    if (result.status === "fail" && bail !== false) {
      break;
    }

    stepNumber += 1;
  }

  return results;
}
