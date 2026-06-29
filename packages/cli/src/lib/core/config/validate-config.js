import { ConfigError, validateConfig as validateHelpersConfig } from "../../helpers/index.js";

export { ConfigError };

/**
 * Validate resolved Chekr config (delegates to helpers).
 * @param {unknown} config
 * @returns {Record<string, unknown>}
 */
export function validateConfig(config) {
  return validateHelpersConfig(config);
}
