/**
 * @param {unknown} value
 * @param {string} [name]
 */
export function assertNonEmptyString(value, name = "value") {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
}
