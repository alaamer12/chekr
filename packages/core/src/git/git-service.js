import { normalizePosixPath } from "@checkr/helpers";
import simpleGit from "simple-git";
import { buildStatusFingerprint } from "./diff-cache.js";

/**
 * @param {string} [cwd]
 * @returns {import('simple-git').SimpleGit}
 */
function createGit(cwd) {
  return simpleGit({ baseDir: cwd });
}

/**
 * @param {string} [cwd]
 * @returns {Promise<boolean>}
 */
export async function isRepo(cwd = process.cwd()) {
  try {
    return await createGit(cwd).checkIsRepo();
  } catch {
    return false;
  }
}

/**
 * @param {string} [cwd]
 * @returns {Promise<string>}
 */
export async function getHead(cwd = process.cwd()) {
  return createGit(cwd).revparse(["HEAD"]);
}

/**
 * @param {string} [cwd]
 * @returns {Promise<string>}
 */
export async function getBranch(cwd = process.cwd()) {
  return createGit(cwd).revparse(["--abbrev-ref", "HEAD"]);
}

/**
 * @param {string} [cwd]
 * @returns {Promise<string>}
 */
export async function getStatus(cwd = process.cwd()) {
  return createGit(cwd).raw(["status", "--porcelain"]);
}

/**
 * Changed paths in working tree (unstaged + staged vs HEAD).
 * @param {string} [cwd]
 * @returns {Promise<string[]>}
 */
export async function getChangedPaths(cwd = process.cwd()) {
  const git = createGit(cwd);
  const diff = await git.diff(["--name-only"]);
  const untracked = await git.raw(["ls-files", "--others", "--exclude-standard"]);
  const paths = [
    ...diff.split("\n").map(normalizeLine),
    ...untracked.split("\n").map(normalizeLine),
  ];
  return [...new Set(paths.filter(Boolean))];
}

/**
 * Staged paths only.
 * @param {string} [cwd]
 * @returns {Promise<string[]>}
 */
export async function getStagedPaths(cwd = process.cwd()) {
  const diff = await createGit(cwd).diff(["--cached", "--name-only"]);
  return diff.split("\n").map(normalizeLine).filter(Boolean);
}

/**
 * @param {string} from
 * @param {string} to
 * @param {string} [cwd]
 * @returns {Promise<string[]>}
 */
export async function diffPaths(from, to, cwd = process.cwd()) {
  try {
    const diff = await createGit(cwd).diff(["--name-only", from, to]);
    return diff.split("\n").map(normalizeLine).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * @param {string} line
 * @returns {string}
 */
function normalizeLine(line) {
  return normalizePosixPath(line.trim());
}

/**
 * @param {string} [cwd]
 * @returns {Promise<boolean>}
 */
export async function isGitAvailable(cwd = process.cwd()) {
  return isRepo(cwd);
}

/**
 * @typedef {{ branch: string, head: string, status: string, statusFingerprint: string, forceFullScan?: boolean }} GitContext
 */

/**
 * @param {string} [cwd]
 * @returns {Promise<GitContext | null>}
 */
export async function getGitContext(cwd = process.cwd()) {
  if (!(await isRepo(cwd))) {
    return null;
  }

  const git = createGit(cwd);
  const [branch, head, status] = await Promise.all([
    git.revparse(["--abbrev-ref", "HEAD"]),
    git.revparse(["HEAD"]),
    git.raw(["status", "--porcelain"]),
  ]);

  return {
    branch,
    head,
    status,
    statusFingerprint: buildStatusFingerprint({ head, status }),
  };
}
