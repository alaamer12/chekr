import { readFileSync } from "node:fs";
import { walkFiles } from "./file-walker.js";
import { printViolations, writeReport } from "./reporter.js";
import { isMainEntryPoint } from "./path-utils.js";
import { pass, fail } from "./colors.js";

/**
 * Standard CLI runner for Symphony check scripts.
 *
 * @param {string} importMetaUrl - The import.meta.url of the script
 * @param {Function} checkFn - The check function: (source, filePath) => violations[]
 * @param {Object} options - Configuration options
 * @param {number} options.step - The step number (e.g. 1)
 * @param {string} options.name - The check name (e.g. 'check-ipc-direct')
 * @param {string[]} options.extensions - File extensions to scan (e.g. ['.ts', '.tsx'])
 * @param {Function} [options.filter] - Optional file filter: (filePath) => boolean
 */
export async function runCheckCli(importMetaUrl, checkFn, options) {
	if (!isMainEntryPoint(importMetaUrl)) {
		return;
	}

	const { step, name, extensions, filter } = options;

	const args = process.argv.slice(2);
	const reportPath = args.find(arg => arg.startsWith("--report="))?.split("=")[1];
	const scanPath = args.find(arg => !arg.startsWith("--")) || ".";

	const files = walkFiles(scanPath, extensions);
	const allViolations = [];

	for (const file of files) {
		// Apply optional filter
		if (filter && !filter(file)) {
			continue;
		}

		const source = readFileSync(file, "utf8");
		const violations = checkFn(source, file);
		allViolations.push(...violations);
	}

	if (allViolations.length === 0) {
		console.log(pass("✅ No violations found"));
		process.exit(0);
	} else {
		console.log(fail(`❌ ${allViolations.length} violations found\n`));
		printViolations(allViolations);

		if (reportPath) {
			writeReport(reportPath, {
				steps: [{ step, name, status: "fail", violations: allViolations }],
				timestamp: new Date().toISOString(),
				mode: "single-check",
				passed: false,
				totalViolations: allViolations.length,
			});
		}

		process.exit(1);
	}
}
