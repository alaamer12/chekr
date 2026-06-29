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
 * Derive fix export name from filename.
 * @param {string} filename
 * @returns {string}
 */
export function deriveFixExport(filename) {
  const base = filename.replace(/\.js$/i, "");
  const stripped = base.startsWith("fix_") ? base.slice(4) : base;
  return toExportName("fix", stripped);
}
