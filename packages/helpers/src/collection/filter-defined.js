/**
 * Remove null and undefined entries from an array.
 * @param {unknown[]} arr
 * @returns {unknown[]}
 */
export function filterDefined(arr) {
  return arr.filter((item) => item !== undefined && item !== null);
}
