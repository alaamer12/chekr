/**
 * Normalize Windows backslashes to POSIX forward slashes.
 * @param {string} p
 * @returns {string}
 */
export function normalizePosixPath(p) {
  return p.replace(/\\/g, "/");
}
