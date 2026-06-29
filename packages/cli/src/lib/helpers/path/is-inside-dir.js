import path from "node:path";

/**
 * Check whether file is inside dir (or equal to dir).
 * @param {string} file
 * @param {string} dir
 * @returns {boolean}
 */
export function isInsideDir(file, dir) {
  const absoluteFile = path.resolve(file);
  const absoluteDir = path.resolve(dir);
  const relative = path.relative(absoluteDir, absoluteFile);

  if (relative === "") {
    return true;
  }

  return !relative.startsWith("..") && !path.isAbsolute(relative);
}
