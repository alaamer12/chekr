/**
 * Convert snake_case to camelCase.
 * @param {string} str
 * @returns {string}
 */
export function snakeToCamel(str) {
  return str.replace(/_+([a-z])/g, (_, letter) => letter.toUpperCase());
}
