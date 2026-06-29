/**
 * Return a copy of obj with undefined keys removed.
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, unknown>}
 */
export function pickDefined(obj) {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}
