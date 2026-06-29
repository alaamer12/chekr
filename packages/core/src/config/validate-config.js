import { ConfigError, validateConfig as validateHelpersConfig } from "@chekr/helpers";

export { ConfigError };

/**
 * Validate resolved Chekr config (delegates to @chekr/helpers).
 * @param {unknown} config
 * @returns {Record<string, unknown>}
 */
export function validateConfig(config) {
  return validateHelpersConfig(config);
}
