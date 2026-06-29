/**
 * Recursively walks the workspace file tree and yields file paths
 * matching a given set of extensions.
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".cache",
  "__pycache__",
  ".parcel-cache",
  "storybook-static",
  ".vite",
  ".vite-temp",
  "__tests__",
  ".next",
]);

/**
 * Walk a directory recursively and return all matching file paths.
 *
 * @param {string} rootDir - Directory to start from (absolute or relative to CWD)
 * @param {string[]} extensions - File extensions to include e.g. ['.ts', '.tsx', '.md']
 * @param {{ excludeDirs?: Set<string>, excludePaths?: Set<string> }} [options]
 * @returns {string[]} Sorted array of matching file paths (relative to CWD, forward slashes)
 */
export function walkFiles(rootDir, extensions, options = {}) {
  const excludeDirs = options.excludeDirs ?? DEFAULT_IGNORED_DIRS;
  const excludePaths = options.excludePaths ?? new Set();
  const absoluteRoot = resolve(rootDir);
  const cwd = resolve(".");
  const results = [];

  try {
    const rootStats = statSync(absoluteRoot);
    if (rootStats.isFile()) {
      const hasMatchingExt = extensions.some((ext) => absoluteRoot.endsWith(ext));
      if (hasMatchingExt) {
        const relativePath = relative(cwd, absoluteRoot).replace(/\\/g, "/");
        return [relativePath];
      }
      return [];
    }
  } catch {
    return [];
  }

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);

      let stats;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        if (excludeDirs.has(entry)) {
          continue;
        }
        const relativeDir = relative(cwd, fullPath).replace(/\\/g, "/");
        if (excludePaths.has(relativeDir)) {
          continue;
        }
        walk(fullPath);
      } else if (stats.isFile()) {
        const hasMatchingExt = extensions.some((ext) => fullPath.endsWith(ext));
        if (hasMatchingExt) {
          const relativePath = relative(cwd, fullPath).replace(/\\/g, "/");
          results.push(relativePath);
        }
      }
    }
  }

  walk(absoluteRoot);

  return results.sort();
}
