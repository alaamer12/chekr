/**
 * @param {unknown} value
 * @param {unknown[]} allowed
 * @param {string} [name]
 */
export function assertOneOf(value, allowed, name = "value") {
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
  }
}
