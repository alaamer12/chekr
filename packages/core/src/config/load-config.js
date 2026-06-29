import { pathToFileURL } from "node:url";
import path from "node:path";
import { toAbsolute } from "@checkr/helpers";

/**
 * Load checkr.config.js (or .cjs / .mjs) from the project root.
 * @param {string} [configPath]
 * @param {string} [cwd]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadConfig(configPath, cwd = process.cwd()) {
  const resolved =
    configPath ?? path.join(cwd, "checkr.config.js");
  const absolute = toAbsolute(resolved, cwd);
  const mod = await import(pathToFileURL(absolute).href);
  const config = mod.default ?? mod;

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Config at ${absolute} must export a default object`);
  }

  return /** @type {Record<string, unknown>} */ (config);
}
