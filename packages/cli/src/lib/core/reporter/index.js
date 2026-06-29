import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toAbsolute } from "../../helpers/index.js";
import { dim } from "../../utils/index.js";
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
 * @param {Record<string, unknown>} config
 * @returns {boolean}
 */
export function isQuietReport(config) {
  const reportFile = config.reportFile;
  if (typeof reportFile === "string" && reportFile.endsWith(".json")) {
    return true;
  }
  return false;
}

/**
 * @param {object} result
 * @param {Record<string, unknown>} config
 */
export function report(result, config) {
  const quiet = isQuietReport(config);
  const type = /** @type {string} */ (config.reporter ?? "default");

  if (!quiet) {
    getReporter(type)(result);
  }

  const reportFile = config.reportFile;
  if (reportFile && typeof reportFile === "string") {
    const cwd = /** @type {string} */ (config.cwd ?? result.meta?.cwd ?? process.cwd());
    const absolute = toAbsolute(reportFile, cwd);
    writeReportFile(absolute, result, config);
  }
}

/**
 * @param {string} reportPath
 * @param {object} result
 * @param {Record<string, unknown>} config
 */
function writeReportFile(reportPath, result, config) {
  const isJson = reportPath.endsWith(".json");
  const isTxt = reportPath.endsWith(".txt");

  mkdirSync(path.dirname(reportPath), { recursive: true });

  if (isJson) {
    writeFileSync(reportPath, formatJson(result), "utf8");
    console.log(`\n📄 Report written to: ${reportPath}`);
    return;
  }

  if (isTxt) {
    writeFileSync(reportPath, formatTextReport(result, config), "utf8");
    console.log(`\n📄 Report written to: ${reportPath}`);
    return;
  }

  writeFileSync(reportPath, formatTextReport(result, config), "utf8");
  console.log(dim(`\nReport written to: ${reportPath}`));
}

/**
 * @param {object} result
 * @param {Record<string, unknown>} config
 * @returns {string}
 */
function formatTextReport(result, config) {
  const lines = [];
  const audit = config.bail === false;

  lines.push("Chekr Violation Report");
  lines.push(`Generated: ${result.meta?.timestamp ?? new Date().toISOString()}`);
  lines.push(`Mode: ${audit ? "audit" : "normal"}`);
  lines.push("");

  for (const step of result.steps) {
    const status = step.status === "pass" ? "PASS" : "FAIL";
    const dots = ".".repeat(Math.max(1, 40 - step.name.length));
    lines.push(`Step ${step.step}: ${step.name} ${dots} ${status}`);

    if (step.status === "fail" && step.violations.length > 0) {
      lines.push("");
      for (const v of step.violations) {
        appendViolationLines(lines, v);
      }
    }
  }

  if (audit) {
    lines.push("");
    lines.push("─".repeat(70));
    const failedCount = result.steps.filter((s) => s.status === "fail").length;
    const passedCount = result.steps.filter((s) => s.status === "pass").length;
    const totalViolations = result.violations?.length ?? 0;
    lines.push(
      `${failedCount} steps failed  |  ${passedCount} steps passed  |  ${totalViolations} total violations`,
    );
    lines.push("─".repeat(70));
  }

  return lines.join("\n");
}

/**
 * @param {string[]} lines
 * @param {Record<string, unknown>} v
 */
function appendViolationLines(lines, v) {
  const file = v.file ?? "(unknown)";
  const line = v.line != null ? `:${v.line}` : "";
  lines.push(`  ${file}${line}`);
  lines.push(`    ${v.message ?? "Violation"}`);

  if (v.text) lines.push(`    ${v.text}`);
  if (v.fix) lines.push(`    Fix: ${v.fix}`);

  for (const [key, value] of Object.entries(v)) {
    if (["_files", "file", "line", "message", "text", "fix"].includes(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    const rendered = typeof value === "object" ? JSON.stringify(value) : String(value);
    lines.push(`    ${key}: ${rendered}`);
  }

  lines.push("");
}

export { reportCompact, reportDefault, reportJson };
