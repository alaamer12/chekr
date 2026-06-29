import { pickDefined } from "./pick-defined.js";

const ARRAY_REPLACE_KEYS = new Set(["include", "exclude"]);

/**
 * Deep merge config objects. include/exclude arrays are replaced, not concatenated.
 * @param {Record<string, unknown>} base
 * @param {...Record<string, unknown>} overrides
 * @returns {Record<string, unknown>}
 */
export function mergeConfig(base, ...overrides) {
  let result = { ...base };

  for (const override of overrides) {
    if (!override) {
      continue;
    }

    const cleaned = pickDefined(override);

    for (const [key, value] of Object.entries(cleaned)) {
      if (ARRAY_REPLACE_KEYS.has(key)) {
        result[key] = value;
        continue;
      }

      const existing = result[key];

      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        existing !== null &&
        typeof existing === "object" &&
        !Array.isArray(existing)
      ) {
        result[key] = mergeConfig(
          /** @type {Record<string, unknown>} */ (existing),
          /** @type {Record<string, unknown>} */ (value),
        );
        continue;
      }

      result[key] = value;
    }
  }

  return result;
}
