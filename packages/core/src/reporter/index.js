import { writeFileSync } from "node:fs";
import { reportCompact } from "./compact.js";
import { reportDefault } from "./default.js";
import { formatJson, reportJson } from "./json.js";

const REPORTERS = {
  default: reportDefault,
  json: reportJson,
  compact: reportCompact,
};

/**
 * @param {string} type
 * @returns {(result: object) => void}
 */
export function getReporter(type) {
  const reporter = REPORTERS[/** @type {keyof typeof REPORTERS} */ (type)];
  if (!reporter) {
    throw new Error(`Unknown reporter: ${type}`);
  }
  return reporter;
}

/**
 * @param {object} result
 * @param {Record<string, unknown>} config
 */
export function report(result, config) {
  const type = /** @type {string} */ (config.reporter ?? "default");
  getReporter(type)(result);

  const reportFile = config.reportFile;
  if (reportFile && typeof reportFile === "string") {
    const content = reportFile.endsWith(".json") ? formatJson(result) : formatTextReport(result);
    writeFileSync(reportFile, content, "utf8");
  }
}

/**
 * @param {object} result
 * @returns {string}
 */
function formatTextReport(result) {
  const lines = [];
  lines.push("Checkr Violation Report");
  lines.push(`Generated: ${result.meta?.timestamp ?? new Date().toISOString()}`);
  lines.push("");

  for (const step of result.steps) {
    const status = step.status === "pass" ? "PASS" : "FAIL";
    lines.push(`Step ${step.step}: ${step.name} — ${status}`);
    for (const v of step.violations) {
      lines.push(`  ${v.file}${v.line != null ? `:${v.line}` : ""} — ${v.message}`);
    }
  }

  return lines.join("\n");
}

export { reportCompact, reportDefault, reportJson };
