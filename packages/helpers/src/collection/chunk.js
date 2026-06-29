/**
 * Split an array into chunks of the given size.
 * @param {unknown[]} arr
 * @param {number} size
 * @returns {unknown[][]}
 */
export function chunk(arr, size) {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError("chunk size must be a positive integer");
  }

  const result = [];

  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }

  return result;
}
