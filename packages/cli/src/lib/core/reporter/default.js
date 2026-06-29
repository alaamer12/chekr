import { bold, dim, fail, file as fileColor, lineNum, pass } from "../../utils/index.js";

/**
 * @param {number} step
 * @param {string} name
 * @param {Array<{ file: string, line?: number, message: string }>} violations
 * @param {{ fullyCached?: boolean, skipped?: number, checked?: number }} [cacheInfo]
 */
export function printStepResult(step, name, violations, cacheInfo = {}) {
  const dots = ".".repeat(Math.max(1, 50 - name.length));

  let cacheSuffix = "";
  if (!cacheInfo.fullyCached && (cacheInfo.skipped ?? 0) > 0) {
    cacheSuffix = dim(` (cache skipped ${cacheInfo.skipped} clean files)`);
  }

  let status;
  if (violations.length > 0) {
    status = fail(`FAIL  (${violations.length} violations)`) + cacheSuffix;
  } else if (cacheInfo.fullyCached) {
    status = pass(`CACHED (${cacheInfo.skipped ?? 0} files, same commit)`);
  } else if (cacheInfo.checked === 0 && (cacheInfo.skipped ?? 0) > 0) {
    status = pass(`PASS (cache: ${cacheInfo.skipped} skipped)`);
  } else {
    status = pass("PASS") + cacheSuffix;
  }

  console.log(`Step ${step}:  ${name} ${dots} ${status}`);
}

/**
 * @param {Array<{ file: string, line?: number, message: string, text?: string, fix?: string }>} violations
 */
export function printViolations(violations) {
  console.log();

  for (const v of violations) {
    console.log(`  ${fileColor(v.file)} ${lineNum(v.line)}`);
    console.log(`    ${fail("X")} ${v.message}`);
    if (v.text) {
      console.log(`       ${dim(v.text)}`);
    }
    if (v.fix) {
      console.log(`       ${dim(`Fix: ${v.fix}`)}`);
    }
    console.log();
  }
}

/**
 * @param {Array<{ step: number, name: string, status: string, violations: unknown[] }>} stepResults
 */
export function printSummary(stepResults) {
  console.log();
  console.log("─".repeat(70));

  const failedCount = stepResults.filter((s) => s.status === "fail").length;
  const passedCount = stepResults.filter((s) => s.status === "pass").length;
  const totalViolations = stepResults.reduce((sum, s) => sum + s.violations.length, 0);

  const failText = fail(`${failedCount} steps failed`);
  const passText = pass(`${passedCount} steps passed`);
  console.log(`  ${failText}  |  ${passText}  |  ${totalViolations} total violations`);
  console.log("─".repeat(70));
  console.log();

  for (const step of stepResults) {
    if (step.status === "fail" && step.violations.length > 0) {
      console.log(bold(`Step ${step.step} violations:`));
      printViolations(step.violations);
    }
  }
}

/**
 * @param {object} result
 */
export function reportDefault(result) {
  for (const step of result.steps) {
    printStepResult(step.step, step.name, step.violations, step.cacheInfo);
    if (step.status === "fail" && step.violations.length > 0) {
      printViolations(step.violations);
    }
  }

  printSummary(result.steps);
}
