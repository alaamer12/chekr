import { fail, pass } from "@checkr/utils";

/**
 * @param {object} result
 */
export function reportCompact(result) {
  for (const step of result.steps) {
    const icon = step.status === "fail" ? fail("F") : pass("P");
    const count = step.violations.length > 0 ? ` (${step.violations.length})` : "";
    console.log(`${icon} ${step.step}. ${step.name}${count}`);
  }

  const totalViolations = result.violations?.length ?? 0;
  const status = result.passed ? pass("PASS") : fail("FAIL");
  console.log(`${status} — ${totalViolations} violations`);
}
