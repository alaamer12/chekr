/**
 * Coerce CLI flag values to booleans consistently.
 * @param {unknown} val
 * @returns {boolean}
 */
export function parseBooleanFlag(val) {
  if (val === undefined || val === null) {
    return false;
  }

  if (typeof val === "boolean") {
    return val;
  }

  const normalized = String(val).trim().toLowerCase();

  if (normalized === "" || normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }

  return false;
}
