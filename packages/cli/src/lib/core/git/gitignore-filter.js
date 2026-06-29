import { readFileSync } from "node:fs";
import ignore from "ignore";
import { normalizePosixPath, toAbsolute } from "../../helpers/index.js";

/**
 * Create a gitignore filter from a file path.
 * @param {string | null | undefined} filePath
 * @param {string} cwd
 * @returns {(relativePath: string) => boolean}
 */
export function createGitignoreFilter(filePath, cwd) {
  if (!filePath) {
    return () => false;
  }

  const absolute = toAbsolute(filePath, cwd);
  let content = "";

  try {
    content = readFileSync(absolute, "utf8");
  } catch {
    return () => false;
  }

  const ig = ignore().add(content);

  return (relativePath) => {
    const normalized = normalizePosixPath(relativePath);
    return ig.ignores(normalized);
  };
}

/**
 * Filter candidate paths, removing gitignored ones.
 * @param {string[]} paths
 * @param {(relativePath: string) => boolean} isIgnored
 * @returns {string[]}
 */
export function applyGitignoreFilter(paths, isIgnored) {
  return paths.filter((p) => !isIgnored(p));
}
