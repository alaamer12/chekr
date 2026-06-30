import { readFile } from "node:fs/promises";
import { chunk, resolveStepConfig, toAbsolute } from "../helpers/index.js";
import { dim, fail, warn } from "../utils/index.js";
import { isMeshResult } from "../utils/mesh-optimizer.js";
import {
  contentHash,
  findCacheMetaByCommit,
  findMostRecentCacheMeta,
  findMostRecentStepCache,
  findStepCacheByCommit,
  formatIncrementalCacheBanner,
  getBranchCacheMeta,
  getChangedPathsSince,
  isStepCacheValid,
  legacyStepCachePath,
  loadStepCache,
  needsRepoLevelCheck,
  parseModifiedPathsFromStatus,
  partitionFilesByCache,
  saveStepCache,
  saveStepCacheSync,
  shortHead,
  stepCachePath,
} from "./git/diff-cache.js";
import { diffPaths, getGitContext, isGitAvailable } from "./git/git-service.js";
import { clearProgress, renderProgress, setProgressContext } from "./progress.js";
import { printStepResult, printViolations } from "./reporter/default.js";
import { scanFiles } from "./scanner.js";
import { normalizeViolation, normalizeViolations } from "./violation.js";

/**
 * @typedef {object} StepResult
 * @property {string} id
 * @property {number} step
 * @property {string} name
 * @property {'pass' | 'fail' | 'skip'} status
 * @property {Array<Record<string, unknown>>} violations
 * @property {{ checked: number, skipped: number, fullyCached?: boolean, optimize?: boolean, meshSkippedPairs?: number }} cacheInfo
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

/** @type {boolean} */
let _cancelled = false;

/**
 * Returns true if the user has pressed Ctrl+C and the run is being aborted.
 * Repo-level checks (e.g. check_code_duplication) should poll this inside
 * their batch loops and return early when it is true.
 * @returns {boolean}
 */
export function isCancelled() {
  return _cancelled;
}

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
  return [`${normalized}/`, ".chekr-cache/"];
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
  const optimize = resolved.optimize === true;
  const stepNum = check.step ?? stepNumber;

  const files = await scanFiles(resolved, globalConfig);
  /** @type {Record<string, unknown>[]} */
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
      /** @type {string} */ (globalConfig.cacheDir ?? ".chekr-cache"),
      cwd,
    );
    const cachePath = stepCachePath(cacheDir, gitContext, check.id);

    // 1. Find the best cache for the exact commit across ALL folders
    let stepCache = await findStepCacheByCommit(cacheDir, check.id, gitContext.head);

    if (!stepCache?.meta?.head) {
      // 2. Fallback to the most recent cache available anywhere (for diffing)
      stepCache = await findMostRecentStepCache(cacheDir, check.id);
    }

    stepCacheHit = isStepCacheValid(stepCache, gitContext);

    if (stepCacheHit) {
      cachedFileHashes = stepCache?.files ?? {};
      cachedViolations = stepCache?.violations ?? [];
      _activeCachedFiles = cachedFileHashes;

      const partition = partitionFilesByCache(files, cachedFileHashes, modifiedPaths);
      toCheck = partition.toCheck;
      skipped = partition.skipped;

      const restoredViolations = cachedViolations
        .map((v) => normalizeViolation(v, { checkId: check.id, step: stepNum }))
        .filter((v) => v !== null);
      const skippedSet = new Set(skipped);
      violations.push(
        ...restoredViolations.filter((v) => {
          const vFiles = /** @type {string[]} */ (v._files ?? [/** @type {string} */ (v.file)]);
          return vFiles.every((f) => skippedSet.has(f));
        }),
      );
    }
  }

  let runRepo = false;
  let meshSkippedPairs = 0;
  const repoFn = check.repoFn;
  const checkProject = check.checkProject;

  if (typeof repoFn === "function" || typeof checkProject === "function") {
    runRepo =
      !useCache || !gitContext || needsRepoLevelCheck(files, cachedFileHashes, modifiedPaths);

    if (runRepo) {
      const context = {
        optimize,
        unmodifiedFiles: new Set(skipped),
        cachedViolations,
        cwd,
        stepConfig: resolved,
        checkId: check.id,
        report: (v) => {
          violations.push(...normalizeViolations(v, { checkId: check.id, step: stepNum }));
        },
      };

      const onProgress =
        typeof repoFn === "function"
          ? (done, total) => {
              renderProgress(done, total);
            }
          : undefined;

      if (typeof repoFn === "function") {
        const scanPath = /** @type {string} */ (globalConfig.scanPath ?? ".");
        const rawResult = repoFn(scanPath, files, onProgress, context);
        const result = rawResult instanceof Promise ? await rawResult : rawResult;

        if (optimize && !isMeshResult(result)) {
          console.log(
            warn(
              `\u26a1 optimize: true on ${check.id} but createMeshOptimizer() was not used — pair skipping disabled`,
            ),
          );
        }

        if (result && typeof result === "object" && "violations" in result) {
          const payload = /** @type {{ violations: unknown, meshSkippedPairs?: number }} */ (
            result
          );
          violations.push(
            ...normalizeViolations(payload.violations, { checkId: check.id, step: stepNum }),
          );
          meshSkippedPairs = payload.meshSkippedPairs ?? 0;
        } else {
          violations.push(...normalizeViolations(result, { checkId: check.id, step: stepNum }));
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
          setProgressContext(check.id, false);
          renderProgress(readCount, sourcesToRead.length);
        }

        clearProgress();

        const rawResult = checkProject(fileMap, context);
        const result = rawResult instanceof Promise ? await rawResult : rawResult;
        violations.push(...normalizeViolations(result, { checkId: check.id, step: stepNum }));
      }

      clearProgress();
      setProgressContext(check.id, false);

      // Populate _activeCheckedFiles so repo-level checks can be cached properly
      if (useCache && _activeCheckedFiles.length === 0 && files.length > 0) {
        for (const filePath of files) {
          if (!cachedFileHashes[filePath]) {
            try {
              const absolute = toAbsolute(filePath, cwd);
              const source = await readFile(absolute, "utf8");
              _activeCheckedFiles.push({ file: filePath, source });
            } catch {
              // ignore unreadable files
            }
          }
        }
      }
    }
  }

  const context = {
    ignoreMarker: resolved.ignoreMarker,
    options: resolved.options ?? {},
    cwd,
    stepConfig: resolved,
    report: (v) => {
      violations.push(...normalizeViolations(v, { checkId: check.id, step: stepNum }));
    },
  };

  const concurrency = /** @type {number} */ (resolved.concurrency ?? globalConfig.concurrency ?? 4);
  const parallel = globalConfig.parallel !== false;

  const runFile = async (filePath) => {
    const absolute = toAbsolute(filePath, cwd);
    const source = await readFile(absolute, "utf8");
    const fn = check.fn;

    const contextWithFile = {
      ...context,
      report: (v) => {
        violations.push(
          ...normalizeViolations(v, {
            filePath,
            checkId: check.id,
            step: stepNum,
          }),
        );
      },
    };

    let fileViolations;
    if (fn.length >= 3) {
      fileViolations = await fn(source, filePath, contextWithFile);
    } else {
      fileViolations = await fn(source, filePath);
    }

    const entry = { file: filePath, source };
    _activeCheckedFiles.push(entry);

    if (Array.isArray(fileViolations)) {
      violations.push(
        ...normalizeViolations(fileViolations, {
          filePath,
          checkId: check.id,
          step: stepNum,
        }),
      );
    }
  };

  if (toCheck.length > 0) {
    let checkedCount = 0;

    const trackProgress = () => {
      checkedCount++;
      setProgressContext(check.id, false);
      renderProgress(checkedCount, toCheck.length);
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
      /** @type {string} */ (globalConfig.cacheDir ?? ".chekr-cache"),
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
    step: stepNum,
    name: check.id,
    status: violations.length > 0 ? "fail" : "pass",
    violations,
    cacheInfo: {
      checked: toCheck.length,
      skipped: skipped.length,
      fullyCached,
      optimize,
      meshSkippedPairs,
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
  const cacheDirRel = /** @type {string} */ (globalConfig.cacheDir ?? ".chekr-cache");
  const verbose = globalConfig.verbose === true;
  const quiet =
    globalConfig.reportFile != null && String(globalConfig.reportFile).endsWith(".json");

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

        // ── 1. Try current-branch cache first ──────────────────────────────
        let branchMeta = await getBranchCacheMeta(cacheDir, gitContext);

        // ── 2. Same commit across branches → reuse cache ─────────────────────
        if (!branchMeta || branchMeta.head !== gitContext.head) {
          const crossBranchMeta = await findCacheMetaByCommit(cacheDir, gitContext.head);
          if (crossBranchMeta) {
            // Exact same commit: no diff needed, everything is up to date
            branchMeta = crossBranchMeta;
          }
        }

        // ── 3. No exact match anywhere → fallback to most recent cache for diffing ─
        if (!branchMeta) {
          branchMeta = await findMostRecentCacheMeta(cacheDir);
        }

        // ── 4. Different commit → compute diff and optionally warn ──────────
        if (branchMeta?.head && branchMeta.head !== gitContext.head) {
          const diffSet = await getChangedPathsSince(branchMeta.head, gitContext.head, (from, to) =>
            diffPaths(from, to, cwd),
          );
          if (diffSet) {
            for (const p of diffSet) {
              modifiedPaths.add(p);
            }

            // Large-diff countdown warning
            const largeDiffThreshold = /** @type {number} */ (globalConfig.largeDiffThreshold ?? 20);
            const keepOn = globalConfig.keepOn === true || process.argv.includes("--keep-on");
            if (!keepOn && diffSet.size > largeDiffThreshold) {
              process.stderr.write(
                warn(
                  `\n⚠️  Large diff detected: ${diffSet.size} files changed since cached commit ${shortHead(branchMeta.head)}.\n` +
                  `   Cache will be invalidated in 5 seconds. Run with --keep-on to skip this warning.\n`
                )
              );
              for (let i = 5; i > 0; i--) {
                process.stderr.write(warn(`   Invalidating in ${i}...\r`));
                await new Promise((r) => setTimeout(r, 1000));
              }
              process.stderr.write("\n");
              branchMeta = null;
              gitContext.forceFullScan = true;
            }
          } else {
            if (verbose) {
              console.log(warn("Failed to diff against cached commit. Falling back to full scan."));
            }
            branchMeta = null;
            gitContext.forceFullScan = true;
          }
        }

        if (!quiet || verbose) {
          console.log(
            dim(formatIncrementalCacheBanner(gitContext, branchMeta, modifiedPaths.size)),
          );
        }
      }
    }
  }

  const sigintHandler = () => {
    _cancelled = true;
    clearProgress();
    if (_cacheEnabled && _activeGitContext && _activeStepId) {
      // Write to stderr — it's unbuffered and flushes immediately even after
      // the parent shell (bun) has already restored the terminal prompt.
      try {
        const filesForCache = buildFilesForCache(
          _activeScopedFiles,
          _activeCheckedFiles,
          _activeCachedFiles,
        );
        if (Object.keys(filesForCache).length > 0) {
          process.stderr.write(warn(`\nInterrupted! Saving partial cache for ${_activeStepId}...\n`));
          const cachePath = stepCachePath(_activeCacheDir, _activeGitContext, _activeStepId);
          // Save only file hashes — NOT violations. The violations array for repo-level
          // checks can be enormous (tens of thousands of entries) and serializing it
          // synchronously inside a signal handler blocks the thread for seconds.
          saveStepCacheSync(cachePath, _activeGitContext, filesForCache, []);
        }

      } catch {
        // ignore errors during interrupt cache save
      }
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

      const result = await runStep({
        check,
        globalConfig,
        gitContext: _cacheEnabled ? gitContext : null,
        modifiedPaths,
        stepNumber: check.step ?? stepNumber,
      });

      printStepResult(result.step, result.name, result.violations, result.cacheInfo);
      results.push(result);

      const bail = resolved.bail ?? globalConfig.bail;
      if (result.status === "fail" && bail !== false) {
        if (!quiet) {
          printViolations(result.violations);
          console.log(
            fail(
              `\n${result.violations.length} violations found. Fix Step ${result.step} before continuing.`,
            ),
          );
        }
        break;
      }

      stepNumber += 1;
    }
  } finally {
    process.removeListener("SIGINT", sigintHandler);
    // Clear references to free memory
    _activeGitContext = null;
    _activeStepId = null;
    _activeScopedFiles = [];
    _activeCachedFiles = {};
    _activeCheckedFiles = [];
    _activeViolations = [];
  }

  return results;
}
