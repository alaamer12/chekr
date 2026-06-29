import { ConfigError, validateConfig as validateHelpersConfig } from "@checkr/helpers";

export { ConfigError };

/**
 * Validate resolved Checkr config (delegates to @checkr/helpers).
 * @param {unknown} config
 * @returns {Record<string, unknown>}
 */
export function validateConfig(config) {
  return validateHelpersConfig(config);
}
