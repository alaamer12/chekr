/**
 * Parse a comma-separated CLI list without brackets.
 * @param {string | undefined | null} str
 * @returns {string[]}
 */
export function parseArgsString(str) {
  if (str === undefined || str === null || str === "") {
    return [];
  }

  return str
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
