import { ConfigError } from "../helpers/config/validate-config.js";

const CHECK_ID_PATTERN = /^check_[a-z][a-z0-9_]*$/;

/**
 * @param {unknown} value
 * @param {string} path
 */
function assertCheckId(value, path) {
  if (typeof value !== "string" || !CHECK_ID_PATTERN.test(value)) {
    throw new ConfigError(`${path} must match check_<snake_case> (e.g. check_raw_colors)`, path);
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 */
function assertNonEmptyString(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`${path} must be a non-empty string`, path);
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 */
function assertStringArray(value, path) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new ConfigError(`${path} must be an array of non-empty strings`, path);
  }
}

/**
 * Validates the metadata for a check publication.
 * @param {unknown} meta
 * @returns {import('../../../../../types/marketplace.js').MarketplaceCheckEntry}
 */
export function validateMarketplaceMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new ConfigError("Metadata must be an object", "");
  }

  const record = /** @type {Record<string, any>} */ (meta);

  assertCheckId(record.id, "id");
  assertNonEmptyString(record.name, "name");
  assertNonEmptyString(record.goal, "goal");
  assertNonEmptyString(record.description, "description");
  
  if (typeof record.hasFixes !== "boolean") {
    throw new ConfigError("hasFixes must be a boolean", "hasFixes");
  }

  assertStringArray(record.tags, "tags");
  assertStringArray(record.recommendedLanguages, "recommendedLanguages");
  assertNonEmptyString(record.author, "author");
  assertNonEmptyString(record.version, "version");

  if (!Array.isArray(record.files) || record.files.length === 0) {
    throw new ConfigError("files must be a non-empty array", "files");
  }

  record.files.forEach((file, index) => {
    const p = `files[${index}]`;
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      throw new ConfigError(`${p} must be an object`, p);
    }
    assertNonEmptyString(file.src, `${p}.src`);
    assertNonEmptyString(file.dest, `${p}.dest`);
  });

  return /** @type {any} */ (record);
}
