export class ConfigError extends Error {
  /**
   * @param {string} message
   * @param {string} [path]
   */
  constructor(message, path = "") {
    super(message);
    this.name = "ConfigError";
    this.path = path;
  }
}

const REPORTER_TYPES = ["default", "json", "compact"];

/**
 * @param {unknown} value
 * @param {string} path
 */
function assertStringOrNull(value, path) {
  if (value !== null && typeof value !== "string") {
    throw new ConfigError(`${path} must be a string or null`, path);
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 */
function assertBoolean(value, path) {
  if (typeof value !== "boolean") {
    throw new ConfigError(`${path} must be a boolean`, path);
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 */
function assertStringArray(value, path) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ConfigError(`${path} must be an array of strings`, path);
  }
}

/**
 * @param {unknown} step
 * @param {string} path
 */
function validateStepConfig(step, path) {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    throw new ConfigError("Step must be an object", path);
  }

  const record = /** @type {Record<string, unknown>} */ (step);

  if (typeof record.id !== "string" || record.id.trim() === "") {
    throw new ConfigError("Step id must be a non-empty string", `${path}.id`);
  }

  if (record.step !== undefined) {
    const stepNumber = record.step;
    if (!Number.isInteger(stepNumber) || /** @type {number} */ (stepNumber) <= 0) {
      throw new ConfigError("step must be a positive integer", `${path}.step`);
    }
  }

  if (record.enabled !== undefined) {
    assertBoolean(record.enabled, `${path}.enabled`);
  }

  if (record.include !== undefined) {
    assertStringArray(record.include, `${path}.include`);
  }

  if (record.exclude !== undefined) {
    assertStringArray(record.exclude, `${path}.exclude`);
  }

  if (record.gitignore !== undefined) {
    assertStringOrNull(record.gitignore, `${path}.gitignore`);
  }

  if (record.extensions !== undefined) {
    assertStringArray(record.extensions, `${path}.extensions`);
  }

  if (record.scope !== undefined) {
    assertStringArray(record.scope, `${path}.scope`);
  }

  if (
    record.ignoreMarker !== undefined &&
    (typeof record.ignoreMarker !== "string" ||
      record.ignoreMarker.trim() === "")
  ) {
    throw new ConfigError(
      "ignoreMarker must be a non-empty string",
      `${path}.ignoreMarker`,
    );
  }

  if (record.bail !== undefined) {
    assertBoolean(record.bail, `${path}.bail`);
  }

  if (record.concurrency !== undefined) {
    const concurrency = record.concurrency;
    if (
      !Number.isInteger(concurrency) ||
      /** @type {number} */ (concurrency) <= 0
    ) {
      throw new ConfigError(
        "concurrency must be a positive integer",
        `${path}.concurrency`,
      );
    }
  }

  if (
    record.options !== undefined &&
    (typeof record.options !== "object" ||
      record.options === null ||
      Array.isArray(record.options))
  ) {
    throw new ConfigError("options must be an object", `${path}.options`);
  }
}

/**
 * Validate a Checkr config object.
 * @param {unknown} config
 * @returns {Record<string, unknown>}
 */
export function validateConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new ConfigError("Config must be an object", "");
  }

  const record = /** @type {Record<string, unknown>} */ (config);

  for (const field of ["checksDir", "fixesDir", "scanPath", "cacheDir"]) {
    if (
      record[field] !== undefined &&
      (typeof record[field] !== "string" || record[field].trim() === "")
    ) {
      throw new ConfigError(`${field} must be a non-empty string`, field);
    }
  }

  if (record.ignoreMarker !== undefined) {
    if (
      typeof record.ignoreMarker !== "string" ||
      record.ignoreMarker.trim() === ""
    ) {
      throw new ConfigError(
        "ignoreMarker must be a non-empty string",
        "ignoreMarker",
      );
    }
  }

  if (record.reportFile !== undefined) {
    assertStringOrNull(record.reportFile, "reportFile");
  }

  if (record.gitignore !== undefined) {
    assertStringOrNull(record.gitignore, "gitignore");
  }

  if (record.include !== undefined) {
    assertStringArray(record.include, "include");
  }

  if (record.exclude !== undefined) {
    assertStringArray(record.exclude, "exclude");
  }

  for (const field of ["bail", "parallel", "verbose", "cache"]) {
    if (record[field] !== undefined) {
      assertBoolean(record[field], field);
    }
  }

  if (record.concurrency !== undefined) {
    const concurrency = record.concurrency;
    if (
      !Number.isInteger(concurrency) ||
      /** @type {number} */ (concurrency) <= 0
    ) {
      throw new ConfigError(
        "concurrency must be a positive integer",
        "concurrency",
      );
    }
  }

  if (record.reporter !== undefined) {
    if (!REPORTER_TYPES.includes(/** @type {string} */ (record.reporter))) {
      throw new ConfigError(
        `reporter must be one of: ${REPORTER_TYPES.join(", ")}`,
        "reporter",
      );
    }
  }

  if (record.steps !== undefined) {
    if (!Array.isArray(record.steps)) {
      throw new ConfigError("steps must be an array", "steps");
    }

    record.steps.forEach((step, index) => {
      validateStepConfig(step, `steps[${index}]`);
    });
  }

  return record;
}
