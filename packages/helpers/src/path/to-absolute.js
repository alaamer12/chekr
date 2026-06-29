import path from "node:path";
import { normalizePosixPath } from "./normalize-posix-path.js";

/**
 * Resolve a path relative to cwd and normalize to POSIX separators.
 * @param {string} p
 * @param {string} cwd
 * @returns {string}
 */
export function toAbsolute(p, cwd) {
  return normalizePosixPath(path.resolve(cwd, p));
}
