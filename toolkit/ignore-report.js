/**
 * ignore-report — finds all @symphony-ignore blocks in the codebase,
 * identifies what violations they are suppressing, and prints a report.
 *
 * Usage:
 *   node packages/toolkit/ignore-report.js [scanPath]
 *   node packages/toolkit/ignore-report.js --report=report.json
 *   node packages/toolkit/ignore-report.js capabilities/
 *
 * Output per block:
 *   - File path + line range
 *   - Suppressed code (the lines inside the block)
 *   - Which violation(s) the block is hiding (by running all checks against it)
 *   - Whether the suppression is justified (has a comment explaining why)
 */

import { readFileSync } from "node:fs";
import { walkFiles } from "./utils/file-walker.js";
import { writeReport } from "./utils/reporter.js";
import { pass, fail, warn, bold, dim } from "./utils/colors.js";

// Import all check functions to identify what each block suppresses
import { checkIpcDirect } from "./checks/check-ipc-direct.js";
import { checkCapabilityDeps } from "./checks/check-capability-deps.js";
import { checkCoreImports } from "./checks/check-core-imports.js";
import { checkHooksImports } from "./checks/check-hooks-imports.js";
import { checkThirdPartyInBlockiya } from "./checks/check-third-party-in-blockiya.js";
import { checkFiltersImports } from "./checks/check-filters-imports.js";
import { checkBlockiyaStyling } from "./checks/check-blockiya-styling.js";
import { checkRawHtml } from "./checks/check-raw-html.js";
import { checkEmotionStyles } from "./checks/check-emotion-styles.js";
import { checkBlockiyaPatterns } from "./checks/check-blockiya-patterns.js";
import { checkFiltersUsage } from "./checks/check-filters-usage.js";
import { checkShellThirdParty } from "./checks/check-shell-third-party.js";

// All checks with their step numbers and names
const ALL_CHECKS = [
	{ step: 1, name: "check-ipc-direct", fn: checkIpcDirect },
	{ step: 2, name: "check-capability-deps", fn: checkCapabilityDeps },
	{ step: 3, name: "check-core-imports", fn: checkCoreImports },
	{ step: 4, name: "check-hooks-imports", fn: checkHooksImports },
	{ step: 5, name: "check-third-party-in-blockiya", fn: checkThirdPartyInBlockiya },
	{ step: 6, name: "check-filters-imports", fn: checkFiltersImports },
	{ step: 7, name: "check-blockiya-styling", fn: checkBlockiyaStyling },
	{ step: 8, name: "check-raw-html", fn: checkRawHtml },
	{ step: 9, name: "check-emotion-styles", fn: checkEmotionStyles },
	{ step: 10, name: "check-blockiya-patterns", fn: checkBlockiyaPatterns },
	{ step: 11, name: "check-filters-usage", fn: checkFiltersUsage },
	{ step: 15, name: "check-shell-third-party", fn: checkShellThirdParty },
];

/**
 * Extract all @symphony-ignore blocks from a source file.
 * Returns an array of block objects with line ranges and content.
 *
 * @param {string} source
 * @param {string} filePath
 * @returns {Array<{ startLine: number, endLine: number, lines: string[], hasJustification: boolean }>}
 */
function extractIgnoreBlocks(source, filePath) {
	const lines = source.split("\n");
	const blocks = [];
	let blockStart = null;
	let blockLines = [];

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		const lineNum = i + 1;

		if (trimmed.includes("@symphony-ignore-start")) {
			blockStart = lineNum;
			blockLines = [];
			continue;
		}

		if (trimmed.includes("@symphony-ignore-end")) {
			if (blockStart !== null) {
				// Check if there's a justification comment in the block
				const hasJustification = blockLines.some(
					l => l.trim().startsWith("//") || l.trim().startsWith("*") || l.trim().startsWith("{/*")
				);

				blocks.push({
					file: filePath,
					startLine: blockStart,
					endLine: lineNum,
					lines: blockLines,
					hasJustification,
				});
			}
			blockStart = null;
			blockLines = [];
			continue;
		}

		if (blockStart !== null) {
			blockLines.push(lines[i]);
		}
	}

	// Unclosed block
	if (blockStart !== null && blockLines.length > 0) {
		blocks.push({
			file: filePath,
			startLine: blockStart,
			endLine: lines.length,
			lines: blockLines,
			hasJustification: false,
			unclosed: true,
		});
	}

	return blocks;
}

/**
 * For a given ignore block, run all checks against the suppressed content
 * to identify what violations the block is hiding.
 *
 * @param {object} block
 * @returns {Array<{ step: number, name: string, message: string, line: number }>}
 */
function identifySupressedViolations(block) {
	// Reconstruct a minimal source with just the suppressed lines
	// Use the original line numbers by padding with empty lines
	const paddedLines = Array(block.startLine).fill("").concat(block.lines);
	const fakeSource = paddedLines.join("\n");

	const found = [];

	for (const { step, name, fn } of ALL_CHECKS) {
		try {
			const violations = fn(fakeSource, block.file);
			for (const v of violations) {
				found.push({
					step,
					name,
					message: v.message,
					line: v.line,
					text: v.text,
				});
			}
		} catch {
			// Check threw — skip it for this block
		}
	}

	return found;
}

/**
 * Print the ignore report to the terminal.
 */

function printIgnoreReport(blocks) {
	const total = blocks.length;
	const withViolations = blocks.filter(b => b.suppressedViolations.length > 0);
	const withoutViolations = blocks.filter(b => b.suppressedViolations.length === 0);
	const unclosed = blocks.filter(b => b.unclosed);
	const unjustified = blocks.filter(b => !b.hasJustification && b.suppressedViolations.length > 0);

	console.log();
	console.log(bold("═".repeat(70)));
	console.log(bold("  @symphony-ignore Report"));
	console.log(bold("═".repeat(70)));
	console.log();
	console.log(`  Total blocks found:        ${bold(total)}`);
	console.log(`  Suppressing violations:    ${fail(withViolations.length.toString())}`);
	console.log(`  No violations found:       ${warn(withoutViolations.length.toString())} (may be stale)`);
	console.log(`  Unclosed blocks:           ${unclosed.length > 0 ? fail(unclosed.length.toString()) : pass("0")}`);
	console.log(
		`  Missing justification:     ${unjustified.length > 0 ? warn(unjustified.length.toString()) : pass("0")}`
	);
	console.log();

	if (total === 0) {
		console.log(pass("  ✅ No @symphony-ignore blocks found."));
		return;
	}

	// Group by file
	const byFile = new Map();
	for (const block of blocks) {
		if (!byFile.has(block.file)) byFile.set(block.file, []);
		byFile.get(block.file).push(block);
	}

	for (const [filePath, fileBlocks] of byFile) {
		console.log(bold(`📄 ${filePath}`));
		console.log();

		for (const block of fileBlocks) {
			const range = `lines ${block.startLine}–${block.endLine}`;
			const unclosedTag = block.unclosed ? fail(" [UNCLOSED]") : "";
			console.log(`  ${warn("⚠")}  Block at ${range}${unclosedTag}`);

			// Show suppressed code (max 3 lines)
			const preview = block.lines.slice(0, 3);
			for (const line of preview) {
				if (line.trim()) console.log(`     ${dim(line.trim())}`);
			}
			if (block.lines.length > 3) {
				console.log(`     ${dim(`... ${block.lines.length - 3} more lines`)}`);
			}

			// Show what violations are suppressed
			if (block.suppressedViolations.length > 0) {
				console.log(`     ${fail("Suppressing:")}`);
				for (const v of block.suppressedViolations) {
					console.log(`       ${fail("❌")} [Step ${v.step}: ${v.name}] ${v.message}`);
				}
			} else {
				console.log(`     ${warn("⚠  No violations detected — block may be stale")}`);
			}

			// Justification warning
			if (!block.hasJustification && block.suppressedViolations.length > 0) {
				console.log(
					`     ${warn("⚠  No justification comment found — add a comment explaining why this is suppressed")}`
				);
			}

			console.log();
		}
	}

	console.log("─".repeat(70));
	console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const reportPath = args.find(arg => arg.startsWith("--report="))?.split("=")[1];
const scanPath = args.find(arg => !arg.startsWith("--")) || ".";

const extensions = [".ts", ".tsx", ".js"];
const files = walkFiles(scanPath, extensions);

const allBlocks = [];

for (const file of files) {
	const source = readFileSync(file, "utf8");

	// Quick check — skip files with no ignore blocks
	if (!source.includes("@symphony-ignore")) continue;

	const blocks = extractIgnoreBlocks(source, file);

	for (const block of blocks) {
		const suppressedViolations = identifySupressedViolations(block);
		allBlocks.push({ ...block, suppressedViolations });
	}
}

printIgnoreReport(allBlocks);

// Write report if requested
if (reportPath) {
	const result = {
		timestamp: new Date().toISOString(),
		mode: "ignore-report",
		scanPath,
		totalBlocks: allBlocks.length,
		blocksWithViolations: allBlocks.filter(b => b.suppressedViolations.length > 0).length,
		staleBlocks: allBlocks.filter(b => b.suppressedViolations.length === 0).length,
		unclosedBlocks: allBlocks.filter(b => b.unclosed).length,
		blocks: allBlocks.map(b => ({
			file: b.file,
			startLine: b.startLine,
			endLine: b.endLine,
			hasJustification: b.hasJustification,
			unclosed: b.unclosed ?? false,
			suppressedCode: b.lines.map(l => l.trim()).filter(Boolean),
			suppressedViolations: b.suppressedViolations,
		})),
	};
	writeReport(reportPath, result);
}

process.exit(0);
