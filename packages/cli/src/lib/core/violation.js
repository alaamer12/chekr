/**
 * Normalize check output — require a message, default file, keep all custom fields.
 * @param {unknown} raw
 * @param {{ filePath?: string, checkId?: string, step?: number }} [meta]
 * @returns {Record<string, unknown> | null}
 */
export function normalizeViolation(raw, meta = {}) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  /** @type {Record<string, unknown>} */
  const v = { .../** @type {Record<string, unknown>} */ (raw) };

  if (typeof v.message !== "string" || v.message.length === 0) {
    if (typeof v.summary === "string" && v.summary.length > 0) {
      v.message = v.summary;
    } else if (typeof v.title === "string" && v.title.length > 0) {
      v.message = v.title;
    } else {
      v.message = "Violation";
    }
  }

  if (v.severity === undefined) {
    v.severity = "error";
  }

  if (Array.isArray(v.occurrences)) {
    v.occurrences = v.occurrences.map((occ) => {
      if (typeof occ === "object" && occ !== null) {
        return { ...occ };
      }
      return occ;
    });
  }

  // Handle locations mapping for relational output
  if (!v.locations && (v.file || v.occurrences)) {
    v.locations = [];
    if (v.file) {
      v.locations.push({
        file: v.file,
        line: v.line,
        column: v.column,
        text: v.text,
        label: "primary",
      });
    }
    if (Array.isArray(v.occurrences)) {
      v.occurrences.forEach((occ) => {
        v.locations.push({
          file: occ.file,
          line: occ.line,
          column: occ.column,
          text: occ.text,
          label: occ.context || "involved",
        });
      });
    }
  }

  if (v.logicalId === undefined && v.code) {
    v.logicalId = v.code;
  }

  if ((typeof v.file !== "string" || v.file.length === 0) && meta.filePath) {
    v.file = meta.filePath;
  }

  if (meta.checkId && v.checkId === undefined) {
    v.checkId = meta.checkId;
  }

  if (meta.step != null && v.step === undefined) {
    v.step = meta.step;
  }

  return v;
}

/**
 * @param {unknown} raw
 * @param {{ filePath?: string, checkId?: string, step?: number }} [meta]
 * @returns {Record<string, unknown>[]}
 */
export function normalizeViolations(raw, meta = {}) {
  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeViolation(item, meta)).filter((v) => v !== null);
  }

  if (raw && typeof raw === "object" && "violations" in raw) {
    const list = /** @type {{ violations?: unknown }} */ (raw).violations;
    return normalizeViolations(list, meta);
  }

  return [];
}
