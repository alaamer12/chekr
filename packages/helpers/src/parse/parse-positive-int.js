/**
 * Parse a positive integer CLI value with fallback.
 * @param {unknown} val
 * @param {number} fallback
 * @returns {number}
 */
export function parsePositiveInt(val, fallback) {
  if (val === undefined || val === null || val === "") {
    return fallback;
  }

  const parsed = Number(val);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}
