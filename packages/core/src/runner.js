import { readFile } from "node:fs/promises";
import { chunk, resolveStepConfig, toAbsolute } from "@checkr/helpers";
import { dim, warn } from "@checkr/utils";
import {
  contentHash,
  formatIncrementalCacheBanner,
  getBranchCacheMeta,
  getChangedPathsSince,
  isStepCacheValid,
  loadStepCache,
  needsRepoLevelCheck,
  parseModifiedPathsFromStatus,
  partitionFilesByCache,
  saveStepCache,
  saveStepCacheSync,
  stepCachePath,
} from "./git/diff-cache.js";
import { diffPaths, getGitContext, isGitAvailable } from "./git/git-service.js";
import { clearProgress, renderProgress } from "./progress.js";
import { scanFiles } from "./scanner.js";

/**
 * @typedef {object} StepResult
 * @property {string} id
 * @property {number} step
 * @property {string} name
 * @property {'pass' | 'fail' | 'skip'} status
 * @property {Array<{ file: string, line?: number, message: string, text?: string, fix?: string, _files?: string[] }>} violations
 * @property {{ checked: number, skipped: number, fullyCached?: boolean }} cacheInfo
 */

/** @type {import('./git/git-service.js').GitContext | null} */
let _activeGitContext = null;

/** @type {string | null} */
let _activeStepId = null;

/** @type {string[]} */
let _activeScopedFiles = [];

/** @type {Record<string, string>} */
let _activeCachedFiles = {};

/** @type {Array<{ file: string, source: string }>} */
let _activeCheckedFiles = [];

/** @type {unknown[]} */
let _activeViolations = [];

/** @type {boolean} */
let _cacheEnabled = false;

/** @type {string} */
let _activeCacheDir = "";

/**
 * @param {string[]} scopedFiles
 * @param {Array<{ file: string, source: string }>} checkedFiles
 * @param {Record<string, string>} cachedFiles
 * @returns {Record<string, string>}
 */
function buildFilesForCache(scopedFiles, checkedFiles, cachedFiles) {
  const filesForCache = {};
  const checkedByFile = new Map(checkedFiles.map((entry) => [entry.file, entry]));

  for (const file of scopedFiles) {
    const checked = checkedByFile.get(file);
    if (checked) {
      filesForCache[file] = contentHash(checked.source);
    } else if (cachedFiles?.[file]) {
      filesForCache[file] = cachedFiles[file];
    }
  }
  return filesForCache;
}

/**
 * @param {string} cacheDirRel
 * @returns {string[]}
 */
function cacheExemptPrefixes(cacheDirRel) {
  const normalized = cacheDirRel.replace(/\\/g, "/").replace(/^\.\//, "");
  return [`${normalized}/`, ".checkr-cache/"];
}

/**
 * Run a single check step.
 * @param {object} params
 * @param {import('./loader.js').LoadedCheck} params.check
 * @param {Record<string, unknown>} params.globalConfig
 * @param {Record<string, unknown>} [params.cliStepPatch]
 * @param {import('./git/git-service.js').GitContext | null} [params.gitContext]
 * @param {Set<string>} [params.modifiedPaths]
 * @param {number} [params.stepNumber]
 * @returns {Promise<StepResult>}
 */
export async function runStep({
  check,
  globalConfig,
  cliStepPatch = {},
  gitContext = null,
  modifiedPaths = new Set(),
  stepNumber = 1,
}) {
  const stepOverrides = check.config ?? { id: check.id };
  const resolved = resolveStepConfig(globalConfig, stepOverrides, cliStepPatch);
  const cwd = /** @type {string} */ (globalConfig.cwd ?? process.cwd());
  const verbose = globalConfig.verbose === true;

  const files = await scanFiles(resolved, globalConfig);
  const violations = [];
  let toCheck = files;
  let skipped = [];
  let fullyCached = false;

  const useCache = globalConfig.cache !== false && gitContext;
  let cachedFileHashes = {};
  let cachedViolations = [];
  let stepCacheHit = false;

  _activeStepId = check.id;
  _activeScopedFiles = files;
  _activeCheckedFiles = [];
  _activeViolations = violations;
  _activeCachedFiles = {};

  if (useCache) {
    const cacheDir = toAbsolute(
      /** @type {string} */ (globalConfig.cacheDir ?? ".checkr-cache"),
      cwd,
    );
    const cachePath = stepCachePath(cacheDir, gitContext, check.id);
    const stepCache = await loadStepCache(cachePath);
    stepCacheHit = isStepCacheValid(stepCache, gitContext);

    if (stepCacheHit) {
      cachedFileHashes = stepCache?.files ?? {};
      cachedViolations = stepCache?.violations ?? [];
      _activeCachedFiles = cachedFileHashes;

      const partition = partitionFilesByCache(files, cachedFileHashes, modifiedPaths);
      toCheck = partition.toCheck;
      skipped = partition.skipped;

      const skippedSet = new Set(skipped);
      const restoredViolations = cachedViolations.filter((v) => {
        const vFiles = /** @type {{ _files?: string[], file?: string }} */ (v)._files ?? [
          /** @type {{ file?: string }} */ (v).file,
        ];
        return vFiles.every((f) => skippedSet.has(f));
      });
      violations.push(...restoredViolations);
    }
  }

  let runRepo = false;
  const repoFn = check.repoFn;
  const checkProject = check.checkProject;

  if (typeof repoFn === "function" || typeof checkProject === "function") {
    runRepo =
      !useCache || !gitContext || needsRepoLevelCheck(files, cachedFileHashes, modifiedPaths);

    if (runRepo) {
      const context = {
        unmodifiedFiles: new Set(skipped),
        cachedViolations,
        cwd,
        stepConfig: resolved,
      };

      const onProgress =
        verbose && typeof repoFn === "function"
          ? (done, total) => renderProgress(done, total, check.id)
          : undefined;

      if (typeof repoFn === "function") {
        const scanPath = /** @type {string} */ (globalConfig.scanPath ?? ".");
        const rawResult = repoFn(scanPath, files, onProgress, context);
        const result = rawResult instanceof Promise ? await rawResult : rawResult;

        if (result && typeof result === "object" && "violations" in result) {
          violations.push(.../** @type {{ violations: unknown[] }} */ (result).violations);
        } else if (Array.isArray(result)) {
          violations.push(...result);
        }
      } else if (typeof checkProject === "function") {
        const fileMap = {};
        let readCount = 0;
        const sourcesToRead = files;

        for (const filePath of sourcesToRead) {
          const absolute = toAbsolute(filePath, cwd);
          const source = await readFile(absolute, "utf8");
          fileMap[filePath] = source;
          readCount++;
          if (verbose) {
            renderProgress(readCount, sourcesToRead.length, check.id);
          }
        }

        clearProgress();

        const rawResult = checkProject(fileMap, context);
        const result = rawResult instanceof Promise ? await rawResult : rawResult;
        if (Array.isArray(result)) {
          violations.push(...result);
        }
      }

      clearProgress();
    }
  }

  const context = {
    ignoreMarker: resolved.ignoreMarker,
    options: resolved.options ?? {},
    cwd,
    stepConfig: resolved,
  };

  const concurrency = /** @type {number} */ (resolved.concurrency ?? globalConfig.concurrency ?? 4);
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

    const entry = { file: filePath, source };
    _activeCheckedFiles.push(entry);

    if (Array.isArray(fileViolations)) {
      for (const v of fileViolations) {
        violations.push(v);
      }
    }
  };

  if (toCheck.length > 0) {
    let checkedCount = 0;

    const trackProgress = () => {
      checkedCount++;
      if (verbose) {
        renderProgress(checkedCount, toCheck.length, check.id);
      }
    };

    if (parallel && concurrency > 1) {
      const batches = chunk(toCheck, concurrency);
      for (const batch of batches) {
        await Promise.all(
          batch.map(async (filePath) => {
            await runFile(filePath);
            trackProgress();
          }),
        );
      }
    } else {
      for (const filePath of toCheck) {
        await runFile(filePath);
        trackProgress();
      }
    }

    clearProgress();
  }

  fullyCached =
    useCache &&
    stepCacheHit &&
    toCheck.length === 0 &&
    !runRepo &&
    files.length > 0 &&
    skipped.length === files.length;

  if (useCache && gitContext) {
    const cacheDir = toAbsolute(
      /** @type {string} */ (globalConfig.cacheDir ?? ".checkr-cache"),
      cwd,
    );
    const cachePath = stepCachePath(cacheDir, gitContext, check.id);
    const filesForCache = buildFilesForCache(files, _activeCheckedFiles, cachedFileHashes);
    _activeCachedFiles = filesForCache;
    await saveStepCache(cachePath, gitContext, filesForCache, violations);
  }

  _activeViolations = violations;

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
  const cacheDirRel = /** @type {string} */ (globalConfig.cacheDir ?? ".checkr-cache");
  const verbose = globalConfig.verbose === true;

  /** @type {import('./git/git-service.js').GitContext | null} */
  let gitContext = null;
  let modifiedPaths = new Set();
  _cacheEnabled = globalConfig.cache !== false;

  if (_cacheEnabled) {
    const gitOk = await isGitAvailable(cwd);
    if (!gitOk) {
      if (verbose) {
        console.log(warn("git not found or not a repository — running full scan without cache."));
      }
      _cacheEnabled = false;
    } else {
      gitContext = await getGitContext(cwd);
      if (gitContext) {
        modifiedPaths = parseModifiedPathsFromStatus(
          gitContext.status,
          cacheExemptPrefixes(cacheDirRel),
        );

        const cacheDir = toAbsolute(cacheDirRel, cwd);
        _activeCacheDir = cacheDir;
        _activeGitContext = gitContext;

        let branchMeta = await getBranchCacheMeta(cacheDir, gitContext);

        if (branchMeta?.head && branchMeta.head !== gitContext.head) {
          const diffSet = await getChangedPathsSince(branchMeta.head, gitContext.head, (from, to) =>
            diffPaths(from, to, cwd),
          );
          if (diffSet) {
            for (const p of diffSet) {
              modifiedPaths.add(p);
            }
          } else {
            if (verbose) {
              console.log(warn("Failed to diff against cached commit. Falling back to full scan."));
            }
            branchMeta = null;
            gitContext.forceFullScan = true;
          }
        }

        if (verbose) {
          console.log(
            dim(formatIncrementalCacheBanner(gitContext, branchMeta, modifiedPaths.size)),
          );
        }
      }
    }
  }

  const sigintHandler = () => {
    clearProgress();
    if (_cacheEnabled && _activeGitContext && _activeStepId) {
      console.log(warn(`\nInterrupted! Saving partial cache for ${_activeStepId}...`));
      const filesForCache = buildFilesForCache(
        _activeScopedFiles,
        _activeCheckedFiles,
        _activeCachedFiles,
      );
      const cachePath = stepCachePath(_activeCacheDir, _activeGitContext, _activeStepId);
      saveStepCacheSync(cachePath, _activeGitContext, filesForCache, _activeViolations);
    }
    process.exit(1);
  };

  process.on("SIGINT", sigintHandler);

  const results = [];
  let stepNumber = 1;

  try {
    for (const check of checks) {
      const stepOverrides = check.config ?? { id: check.id };
      const resolved = resolveStepConfig(globalConfig, stepOverrides);
      const bail = resolved.bail ?? globalConfig.bail;

      const result = await runStep({
        check,
        globalConfig,
        gitContext: _cacheEnabled ? gitContext : null,
        modifiedPaths,
        stepNumber: check.step ?? stepNumber,
      });

      results.push(result);

      if (result.status === "fail" && bail !== false) {
        break;
      }

      stepNumber += 1;
    }
  } finally {
    process.removeListener("SIGINT", sigintHandler);
  }

  return results;
}
