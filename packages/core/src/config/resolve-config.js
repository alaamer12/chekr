import { mergeConfig, pickDefined } from "@checkr/helpers";
import { ENGINE_DEFAULTS } from "./defaults.js";
import { validateConfig } from "./validate-config.js";

/**
 * Resolve global config: defaults → file → CLI patch.
 * @param {Record<string, unknown>} [fileConfig]
 * @param {Record<string, unknown>} [cliPatch]
 * @param {Record<string, unknown>} [options]
 * @returns {Record<string, unknown>}
 */
export function resolveConfig(fileConfig = {}, cliPatch = {}, options = {}) {
  const base = {
    ...ENGINE_DEFAULTS,
    cwd: options.cwd ?? ENGINE_DEFAULTS.cwd,
  };

  const merged = mergeConfig(
    base,
    pickDefined(fileConfig),
    pickDefined(cliPatch),
  );

  return validateConfig(merged);
}
