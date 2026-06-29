import { bold, dim, fail, file as fileColor, lineNum, pass } from "../../utils/index.js";

const DISPLAY_SKIP = new Set(["_files"]);

/**
 * @param {number} step
 * @param {string} name
 * @param {Array<Record<string, unknown>>} violations
 * @param {{ fullyCached?: boolean, skipped?: number, checked?: number, optimize?: boolean, meshSkippedPairs?: number }} [cacheInfo]
 */
export function printStepResult(step, name, violations, cacheInfo = {}) {
  const dots = ".".repeat(Math.max(1, 50 - name.length));

  let cacheSuffix = "";
  if (!cacheInfo.fullyCached && (cacheInfo.skipped ?? 0) > 0) {
    if (cacheInfo.optimize) {
      const pairInfo =
        (cacheInfo.meshSkippedPairs ?? 0) > 0
          ? ` · ${cacheInfo.meshSkippedPairs.toLocaleString()} pairs skipped`
          : "";
      cacheSuffix = dim(` (mesh: ${cacheInfo.skipped} clean files${pairInfo})`);
    } else {
      cacheSuffix = dim(` (cache skipped ${cacheInfo.skipped} clean files)`);
    }
  }

  let status;
  if (violations.length > 0) {
    status = fail(`❌ FAIL  (${violations.length} violations)`) + cacheSuffix;
  } else if (cacheInfo.fullyCached) {
    status = pass(`⚡ CACHED (${cacheInfo.skipped ?? 0} files, same commit)`);
  } else if (cacheInfo.checked === 0 && (cacheInfo.skipped ?? 0) > 0) {
    status = pass(`✅ PASS (cache: ${cacheInfo.skipped} skipped)`);
  } else {
    status = pass("✅ PASS") + cacheSuffix;
  }

  console.log(`🔍 Step ${step}:  ${name} ${dots} ${status}`);
}

/**
 * @param {Array<Record<string, unknown>>} violations
 */
export function printViolations(violations) {
  console.log();

  for (const v of violations) {
    const file = /** @type {string} */ (v.file ?? "(unknown file)");
    const line = /** @type {number | undefined} */ (v.line);
    const message = /** @type {string} */ (v.message ?? "Violation");

    console.log(`  ${fileColor(file)} ${lineNum(line)}`);
    console.log(`    ${fail("❌")} ${message}`);

    if (v.text) {
      console.log(`       ${dim(String(v.text))}`);
    }
    if (v.fix) {
      console.log(`       ${dim(`Fix: ${v.fix}`)}`);
    }

    for (const [key, value] of Object.entries(v)) {
      if (DISPLAY_SKIP.has(key)) continue;
      if (["file", "line", "message", "text", "fix"].includes(key)) continue;
      if (value === undefined || value === null || value === "") continue;

      const rendered = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
      console.log(`       ${dim(`${key}: ${rendered}`)}`);
    }

    console.log();
  }
}

/**
 * Audit footer when all steps run (--no-bail / --pass).
 * @param {Array<{ step: number, name: string, status: string, violations: unknown[] }>} stepResults
 */
export function printPassSummary(stepResults) {
  console.log();
  console.log("─".repeat(70));

  const failedCount = stepResults.filter((s) => s.status === "fail").length;
  const passedCount = stepResults.filter((s) => s.status === "pass").length;
  const totalViolations = stepResults.reduce((sum, s) => sum + s.violations.length, 0);

  const failText = fail(`❌ ${failedCount} steps failed`);
  const passText = pass(`✅ ${passedCount} steps passed`);
  console.log(`  ${failText}  |  ${passText}  |  ${totalViolations} total violations`);
  console.log("─".repeat(70));
  console.log();

  for (const step of stepResults) {
    if (step.status === "fail" && step.violations.length > 0) {
      console.log(bold(`Step ${step.step} violations:`));
      printViolations(/** @type {Array<Record<string, unknown>>} */ (step.violations));
    }
  }
}

/**
 * @param {object} result
 */
export function reportDefault(result) {
  const bail = result.meta?.bail !== false;

  if (!bail) {
    printPassSummary(result.steps);
  }
}
