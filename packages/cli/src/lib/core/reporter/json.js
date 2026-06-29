/**
 * @param {object} result
 */
export function reportJson(result) {
  console.log(JSON.stringify(result, null, 2));
}

/**
 * @param {object} result
 * @returns {string}
 */
export function formatJson(result) {
  return JSON.stringify(result, null, 2);
}
