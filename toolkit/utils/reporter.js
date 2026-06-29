/**
 * Formats and prints violation output to the terminal.
 * Optionally writes JSON or TXT report files.
 */

import { writeFileSync } from "node:fs";
import { pass, fail, warn, bold, dim, file as fileColor, lineNum } from "./colors.js";

/**
 * Print a step result line to the terminal.
 *
 * @param {number} step
 * @param {string} name
 * @param {Array<{ file: string, line?: number, message: string }>} violations
 * @param {{ fullyCached?: boolean, skipped?: number, checked?: number }} [cacheInfo]
 */
export function printStepResult(step, name, violations, cacheInfo = {}) {
	const dots = ".".repeat(Math.max(1, 50 - name.length));
	
	let cacheSuffix = "";
	if (!cacheInfo.fullyCached && (cacheInfo.skipped ?? 0) > 0) {
		if (cacheInfo.optimize) {
			const pairInfo = cacheInfo.meshSkippedPairs > 0
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
 * Append the status suffix to the step header already written with process.stdout.write.
 * (The caller already wrote "🔍 Step N:  <name> <dots> " without a newline.)
 *
 * @param {Array<{ file: string, line?: number, message: string }>} violations
 * @param {{ fullyCached?: boolean, skipped?: number, checked?: number }} [cacheInfo]
 */
export function printStepResultInline(violations, cacheInfo = {}) {
	let status;
	if (violations.length > 0) {
		status = fail(`❌ FAIL  (${violations.length} violations)`);
	} else if (cacheInfo.fullyCached) {
		status = pass(`⚡ CACHED (${cacheInfo.skipped ?? 0} files, same commit)`);
	} else if (cacheInfo.checked === 0 && (cacheInfo.skipped ?? 0) > 0) {
		status = pass(`✅ PASS (cache: ${cacheInfo.skipped} skipped)`);
	} else {
		status = pass("✅ PASS");
	}
	process.stdout.write(`${status}\n`);
}

/**
 * Print the full violation list for a failed step.
 */
export function printViolations(violations) {
	console.log(); // blank line before violations

	for (const v of violations) {
		console.log(`  ${fileColor(v.file)} ${lineNum(v.line)}`);
		console.log(`    ${fail("❌")} ${v.message}`);
		if (v.text) {
			console.log(`       ${dim(v.text)}`);
		}
		if (v.fix) {
			console.log(`       ${dim("Fix: " + v.fix)}`);
		}
		console.log(); // blank line after each violation
	}
}

/**
 * Print the --pass mode summary table (all steps, counts, totals).
 */
export function printPassSummary(stepResults) {
	console.log();
	console.log("─".repeat(70));

	const failedCount = stepResults.filter(s => s.status === "fail").length;
	const passedCount = stepResults.filter(s => s.status === "pass").length;
	const totalViolations = stepResults.reduce((sum, s) => sum + s.violations.length, 0);

	const failText = fail(`❌ ${failedCount} steps failed`);
	const passText = pass(`${passedCount} steps passed`);
	console.log(`  ${failText}  |  ${passText}  |  ${totalViolations} total violations`);
	console.log("─".repeat(70));
	console.log();

	// Print violations grouped by step
	for (const step of stepResults) {
		if (step.status === "fail" && step.violations.length > 0) {
			console.log(bold(`Step ${step.step} violations:`));
			printViolations(step.violations);
		}
	}
}

/**
 * Write a report file. Format determined by file extension.
 * .json → structured JSON
 * .txt  → plain text (ANSI codes stripped)
 *
 * @param {string} reportPath - Output file path
 * @param {object} result - Full result object
 */

export function writeReport(reportPath, result) {
	const isJson = reportPath.endsWith(".json");
	const isTxt = reportPath.endsWith(".txt");

	if (isJson) {
		const output = JSON.stringify(result, null, 2);
		writeFileSync(reportPath, output, "utf8");
		console.log(`\n📄 Report written to: ${reportPath}`);
	} else if (isTxt) {
		const lines = [];
		lines.push("Symphony Violation Report");
		lines.push(`Generated: ${result.timestamp}`);
		lines.push(`Mode: ${result.mode}`);
		lines.push("");

		for (const step of result.steps) {
			const status = step.status === "pass" ? "PASS" : "FAIL";
			const dots = ".".repeat(Math.max(1, 40 - step.name.length));
			lines.push(`Step ${step.step}: ${step.name} ${dots} ${status}`);

			if (step.status === "fail" && step.violations.length > 0) {
				lines.push("");
				for (const v of step.violations) {
					lines.push(`  ${v.file} [${v.line}]`);
					lines.push(`    ${v.message}`);
					if (v.text) {
						lines.push(`    ${v.text}`);
					}
					if (v.fix) {
						lines.push(`    Fix: ${v.fix}`);
					}
					lines.push("");
				}
			}
		}

		if (result.mode === "audit") {
			lines.push("");
			lines.push("─".repeat(70));
			const failedCount = result.steps.filter(s => s.status === "fail").length;
			const passedCount = result.steps.filter(s => s.status === "pass").length;
			lines.push(
				`${failedCount} steps failed  |  ${passedCount} steps passed  |  ${result.totalViolations} total violations`
			);
			lines.push("─".repeat(70));
		} else {
			lines.push("");
			lines.push(`${result.totalViolations} violations found.`);
		}

		writeFileSync(reportPath, lines.join("\n"), "utf8");
		console.log(`\n📄 Report written to: ${reportPath}`);
	} else {
		console.error(warn(`⚠️  Unknown report format for ${reportPath} — use .json or .txt`));
	}
}
