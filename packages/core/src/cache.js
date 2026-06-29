import { toAbsolute } from "@checkr/helpers";
import {
  clearCacheDir,
  getBranchCacheMeta,
  loadStepCache,
  stepCachePath,
} from "./git/diff-cache.js";
import { getGitContext } from "./git/git-service.js";

/**
 * @param {string} cacheDir
 * @param {string} cwd
 * @returns {Promise<void>}
 */
export async function clearCache(cacheDir, cwd) {
  const absolute = toAbsolute(cacheDir, cwd);
  await clearCacheDir(absolute);
}

/**
 * @param {string} cacheDir
 * @param {string} stepId
 * @param {string} cwd
 * @returns {Promise<object | null>}
 */
export async function readStepCache(cacheDir, stepId, cwd) {
  const gitContext = await getGitContext(cwd);
  if (!gitContext) return null;

  const absolute = toAbsolute(cacheDir, cwd);
  const path = stepCachePath(absolute, gitContext, stepId);
  return loadStepCache(path);
}

/**
 * @param {string} cacheDir
 * @param {string} cwd
 * @returns {Promise<object | null>}
 */
export async function readBranchMeta(cacheDir, cwd) {
  const gitContext = await getGitContext(cwd);
  if (!gitContext) return null;

  const absolute = toAbsolute(cacheDir, cwd);
  return getBranchCacheMeta(absolute, gitContext);
}

export { clearCacheDir, loadStepCache, stepCachePath } from "./git/diff-cache.js";
