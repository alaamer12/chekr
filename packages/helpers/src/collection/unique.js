/**
 * Return unique values preserving first occurrence order.
 * @param {unknown[]} arr
 * @returns {unknown[]}
 */
export function unique(arr) {
  return [...new Set(arr)];
}
