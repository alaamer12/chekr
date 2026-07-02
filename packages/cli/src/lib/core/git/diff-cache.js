/**
 * Git-scoped incremental cache for check runs.
 * Generalized from toolkit/utils/check-violations-cache.js
 */

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * @param {string} content
 * @returns {string}
 */
export function contentHash(content) {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * @param {string} branch
 * @returns {string}
 */
export function sanitizeBranchName(branch) {
  const trimmed = (branch ?? "").trim();
  if (!trimmed) return "unknown";
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

/**
 * @param {{ head: string, status: string }} params
 * @returns {string}
 */
export function buildStatusFingerprint({ head, status }) {
  return createHash("sha256").update(`${head}\n${status}`).digest("hex").slice(0, 16);
}

/**
 * @param {string} baseHead
 * @param {string} currentHead
 * @param {(from: string, to: string) => Promise<string[]>} diffPaths
 * @returns {Promise<Set<string> | null>}
 */
export async function getChangedPathsSince(baseHead, currentHead, diffPaths) {
  try {
    const paths = await diffPaths(baseHead, currentHead);
    return new Set(paths);
  } catch {
    return null;
  }
}

/**
 * Primary cache path (keyed by commit hash).
 * @param {string} cacheRoot
 * @param {{ head: string }} gitContext
 * @param {string} stepName
 * @returns {string}
 */
export function stepCachePath(cacheRoot, gitContext, stepName) {
  const commitDir = join(cacheRoot, gitContext.head, "steps");
  return join(commitDir, `${stepName}.json`);
}

/**
 * Legacy cache path (keyed by branch name) for backward compatibility.
 * @param {string} cacheRoot
 * @param {{ branch: string }} gitContext
 * @param {string} stepName
 * @returns {string}
 */
export function legacyStepCachePath(cacheRoot, gitContext, stepName) {
  const branchDir = join(cacheRoot, sanitizeBranchName(gitContext.branch), "steps");
  return join(branchDir, `${stepName}.json`);
}

/**
 * @param {object | null} stepCache
 * @param {{ branch: string, forceFullScan?: boolean }} gitContext
 * @returns {boolean}
 */
export function isStepCacheValid(stepCache, gitContext) {
  if (gitContext.forceFullScan) return false;
  if (!stepCache?.meta?.head) return false;
  // Branch mismatch is no longer grounds for rejection — cache is keyed by
  // commit hash, not branch name. Cross-branch reuse is handled upstream.
  return true;
}

/**
 * @param {string} status
 * @param {string[]} [exemptPrefixes]
 * @returns {Set<string>}
 */
export function parseModifiedPathsFromStatus(status, exemptPrefixes = []) {
  const modified = new Set();
  for (const line of status.split("\n")) {
    if (!line.trim()) continue;
    const pathPart = line.slice(3).trim();
    const path = pathPart.includes(" -> ") ? pathPart.split(" -> ").pop() : pathPart;
    const normalized = path.replace(/\\/g, "/");
    if (exemptPrefixes.some((prefix) => normalized.startsWith(prefix))) {
      continue;
    }
    modified.add(normalized);
  }
  return modified;
}

/**
 * @param {string[]} filePaths
 * @param {Record<string, string> | undefined} cachedFiles
 * @param {Set<string>} modifiedPaths
 * @param {Map<string, string>} [currentHashes]
 * @returns {{ toCheck: string[], skipped: string[] }}
 */
export function partitionFilesByCache(
  filePaths,
  cachedFiles,
  modifiedPaths,
  currentHashes = new Map(),
) {
  const toCheck = [];
  const skipped = [];

  for (const file of filePaths) {
    const cachedHash = cachedFiles?.[file];
    if (!cachedHash) {
      // Never seen before — must check
      toCheck.push(file);
      continue;
    }

    if (modifiedPaths.has(file)) {
      // Git reports the file as modified/dirty.
      // If we have a live content hash, use it to confirm whether the file
      // actually changed since the last cache write. This avoids re-running
      // the analysis on every run just because the working tree is dirty
      // (e.g. uncommitted edits that haven't touched any checked file).
      const liveHash = currentHashes.get(file);
      if (liveHash !== undefined && liveHash === cachedHash) {
        // Content identical to what we cached — treat as clean
        skipped.push(file);
      } else {
        toCheck.push(file);
      }
      continue;
    }

    const liveHash = currentHashes.get(file);
    if (liveHash !== undefined && liveHash !== cachedHash) {
      toCheck.push(file);
      continue;
    }

    skipped.push(file);
  }

  return { toCheck, skipped };
}

/**
 * @param {string[]} scopedFiles
 * @param {Record<string, string> | undefined} cachedFiles
 * @param {Set<string>} modifiedPaths
 * @param {Map<string, string>} [currentHashes]
 * @returns {boolean}
 */
export function needsRepoLevelCheck(
  scopedFiles,
  cachedFiles,
  modifiedPaths,
  currentHashes = new Map(),
) {
  return (
    partitionFilesByCache(scopedFiles, cachedFiles, modifiedPaths, currentHashes).toCheck.length > 0
  );
}

/**
 * @param {string} cachePath
 * @returns {Promise<object | null>}
 */
export async function loadStepCache(cachePath) {
  try {
    const raw = await readFile(cachePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} cachePath
 * @param {{ head: string, branch: string, statusFingerprint: string }} gitContext
 * @param {Record<string, string>} files
 * @param {unknown[]} [violations]
 * @returns {Promise<void>}
 */
export async function saveStepCache(cachePath, gitContext, files, violations = []) {
  const payload = {
    meta: {
      head: gitContext.head,
      branch: sanitizeBranchName(gitContext.branch),
      statusFingerprint: gitContext.statusFingerprint,
      savedAt: new Date().toISOString(),
    },
    files,
    violations,
  };
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * @param {string} cachePath
 * @param {{ head: string, branch: string, statusFingerprint: string }} gitContext
 * @param {Record<string, string>} files
 * @param {unknown[]} [violations]
 */
export function saveStepCacheSync(cachePath, gitContext, files, violations = []) {
  const payload = {
    meta: {
      head: gitContext.head,
      branch: sanitizeBranchName(gitContext.branch),
      statusFingerprint: gitContext.statusFingerprint,
      savedAt: new Date().toISOString(),
    },
    files,
    violations,
  };
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * @param {string} cacheRoot
 * @returns {Promise<void>}
 */
export async function clearCacheDir(cacheRoot) {
  await rm(cacheRoot, { recursive: true, force: true });
}

/**
 * @param {string} head
 * @returns {string}
 */
export function shortHead(head) {
  return (head ?? "").slice(0, 7) || "unknown";
}

/**
 * Search ALL branch subdirectories under cacheRoot for a cache entry whose
 * meta.head matches the given commit hash. Returns the meta object from the
 * first match found, or null if none exists.
 *
 * This enables cross-branch cache reuse when two branches share the same HEAD
 * commit (e.g. a freshly-checked-out branch at the same commit as another).
 *
 * @param {string} cacheRoot
 * @param {string} commitHash
 * @returns {Promise<object | null>}
 */
export async function findCacheMetaByCommit(cacheRoot, commitHash) {
  let branchDirs;
  try {
    branchDirs = readdirSync(cacheRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return null;
  }

  for (const branchName of branchDirs) {
    const stepsDir = join(cacheRoot, branchName, "steps");
    let entries;
    try {
      entries = await readdir(stepsDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const stepCache = await loadStepCache(join(stepsDir, entry));
      if (stepCache?.meta?.head === commitHash) {
        return { ...stepCache.meta, _fromBranch: branchName };
      }
    }
  }
  return null;
}

/**
 * Search ALL directories under cacheRoot for the most recently saved cache entry.
 * This provides a fallback base for diffing when checking out a new branch or
 * moving to a commit that has no cache yet.
 *
 * @param {string} cacheRoot
 * @returns {Promise<object | null>}
 */
export async function findMostRecentCacheMeta(cacheRoot) {
  let cacheDirs;
  try {
    cacheDirs = readdirSync(cacheRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return null;
  }

  let mostRecent = null;
  for (const dirName of cacheDirs) {
    const stepsDir = join(cacheRoot, dirName, "steps");
    let entries;
    try {
      entries = await readdir(stepsDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const stepCache = await loadStepCache(join(stepsDir, entry));
      if (stepCache?.meta?.savedAt) {
        if (!mostRecent || new Date(stepCache.meta.savedAt) > new Date(mostRecent.savedAt)) {
          mostRecent = { ...stepCache.meta, _fromDir: dirName };
        }
      }
    }
  }
  return mostRecent;
}

/**
 * Find a step-level cache entry across ALL branch directories that matches
 * both `checkId` and `commitHash`. Used as a cross-branch step cache fallback.
 *
 * @param {string} cacheRoot
 * @param {string} checkId
 * @param {string} commitHash
 * @returns {Promise<object | null>}
 */
export async function findStepCacheByCommit(cacheRoot, checkId, commitHash) {
  let branchDirs;
  try {
    branchDirs = readdirSync(cacheRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return null;
  }

  let bestCache = null;
  let maxFiles = -1;

  for (const branchName of branchDirs) {
    const filePath = join(cacheRoot, branchName, "steps", `${checkId}.json`);
    const stepCache = await loadStepCache(filePath);
    if (stepCache?.meta?.head === commitHash) {
      const fileCount = stepCache.files ? Object.keys(stepCache.files).length : 0;
      if (fileCount > maxFiles) {
        maxFiles = fileCount;
        bestCache = stepCache;
      }
    }
  }
  return bestCache;
}

/**
 * Find the most recently saved step-level cache entry across ALL directories.
 * Used as a fallback base for diffing.
 *
 * @param {string} cacheRoot
 * @param {string} checkId
 * @returns {Promise<object | null>}
 */
export async function findMostRecentStepCache(cacheRoot, checkId) {
  let cacheDirs;
  try {
    cacheDirs = readdirSync(cacheRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return null;
  }

  let bestCache = null;
  let maxFiles = -1;

  for (const dirName of cacheDirs) {
    const filePath = join(cacheRoot, dirName, "steps", `${checkId}.json`);
    const stepCache = await loadStepCache(filePath);
    if (stepCache?.meta?.savedAt) {
      const fileCount = stepCache.files ? Object.keys(stepCache.files).length : 0;
      // Prefer the cache with more files. If equal, prefer the more recent one.
      if (
        fileCount > maxFiles ||
        (fileCount === maxFiles &&
          (!bestCache || new Date(stepCache.meta.savedAt) > new Date(bestCache.meta.savedAt)))
      ) {
        maxFiles = fileCount;
        bestCache = stepCache;
      }
    }
  }
  return bestCache;
}

/**
 * Gets the cache metadata for the current context. First checks the commit-hash
 * directory, then falls back to the legacy branch-name directory.
 *
 * @param {string} cacheRoot
 * @param {{ head: string, branch: string }} gitContext
 * @returns {Promise<object | null>}
 */
export async function getBranchCacheMeta(cacheRoot, gitContext) {
  // Try commit hash dir first
  const commitDir = join(cacheRoot, gitContext.head, "steps");
  try {
    const entries = await readdir(commitDir);
    const jsonFile = entries.find((entry) => entry.endsWith(".json"));
    if (jsonFile) {
      const stepCache = await loadStepCache(join(commitDir, jsonFile));
      if (stepCache?.meta) return stepCache.meta;
    }
  } catch {
    // Ignore and fallback
  }

  // Fallback to legacy branch dir
  const branchDir = join(cacheRoot, sanitizeBranchName(gitContext.branch), "steps");
  try {
    const entries = await readdir(branchDir);
    const jsonFile = entries.find((entry) => entry.endsWith(".json"));
    if (!jsonFile) return null;
    const stepCache = await loadStepCache(join(branchDir, jsonFile));
    return stepCache?.meta ?? null;
  } catch {
    return null;
  }
}

/**
 * Human-readable summary of whether incremental cache applies on this run.
 *
 * @param {{ branch: string, head: string }} gitContext
 * @param {object | null} branchMeta
 * @param {number} modifiedPathCount
 * @returns {string}
 */
export function formatIncrementalCacheBanner(gitContext, branchMeta, modifiedPathCount) {
  const branch = gitContext.branch;
  const current = shortHead(gitContext.head);

  if (!branchMeta?.head) {
    return `Incremental cache: commit ${current} on ${branch} — no saved results for this branch yet (full scan, then cache is written).`;
  }

  const fromBranch = branchMeta._fromBranch
    ? ` [cache from branch '${branchMeta._fromBranch}'`
    : "";
  const previous = shortHead(branchMeta.head);
  const sameCommit = branchMeta.head === gitContext.head;
  const extra = sameCommit
    ? fromBranch ? `${fromBranch}]` : ""
    : ` (based on previous cache for ${previous})${fromBranch ? `, ${fromBranch}]` : ""}`;

  if (modifiedPathCount === 0) {
    return `Incremental cache: commit ${current} on ${branch}${extra} — reusing saved results (clean working tree).`;
  }

  return `Incremental cache: commit ${current} on ${branch}${extra} — reusing saved results; rechecking ${modifiedPathCount} changed/dirty path(s).`;
}
