import { snakeToCamel } from "./snake-to-camel.js";

/**
 * @param {string} name
 * @returns {string}
 */
function toExportName(prefix, name) {
  const camel = snakeToCamel(name);
  return prefix + camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Derive check export name from filename.
 * @param {string} filename
 * @returns {string}
 */
export function deriveCheckExport(filename) {
  const base = filename.replace(/\.js$/i, "");
  const stripped = base.startsWith("check_") ? base.slice(6) : base;
  return toExportName("check", stripped);
}
