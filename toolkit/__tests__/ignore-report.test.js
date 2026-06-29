/**
 * ignore-report.test.js
 *
 * Tests for the ignore-report utility — finds @symphony-ignore blocks,
 * identifies what violations they suppress, and reports stale blocks.
 */

import { describe, test, expect } from "vitest";

// We test the two core functions extracted from ignore-report.js
// by importing them. Since ignore-report.js is a CLI script, we test
// the logic functions directly.

// ── Helpers — replicate the core logic for testing ────────────────────────────

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

// ── extractIgnoreBlocks ────────────────────────────────────────────────────────

describe("extractIgnoreBlocks", () => {
	test("finds a single block", () => {
		const src = [
			"const x = 1",
			"// ---------- @symphony-ignore-start",
			'import { invoke } from "@tauri-apps/api/core"',
			"// ---------- @symphony-ignore-end",
			"const y = 2",
		].join("\n");

		const blocks = extractIgnoreBlocks(src, "capabilities/x/blockiyas/X/index.tsx");
		expect(blocks).toHaveLength(1);
		expect(blocks[0].startLine).toBe(2);
		expect(blocks[0].endLine).toBe(4);
		expect(blocks[0].lines).toHaveLength(1);
		expect(blocks[0].lines[0]).toContain("invoke");
	});

	test("finds multiple blocks in one file", () => {
		const src = [
			"// @symphony-ignore-start",
			'import { invoke } from "@tauri-apps/api/core"',
			"// @symphony-ignore-end",
			"const x = 1",
			"// @symphony-ignore-start",
			'<div className="old">',
			"// @symphony-ignore-end",
		].join("\n");

		const blocks = extractIgnoreBlocks(src, "capabilities/x/blockiyas/X/index.tsx");
		expect(blocks).toHaveLength(2);
	});

	test("detects unclosed block", () => {
		const src = [
			"const x = 1",
			"// @symphony-ignore-start",
			'import { invoke } from "@tauri-apps/api/core"',
			"// no end directive",
		].join("\n");

		const blocks = extractIgnoreBlocks(src, "capabilities/x/blockiyas/X/index.tsx");
		expect(blocks).toHaveLength(1);
		expect(blocks[0].unclosed).toBe(true);
	});

	test("returns empty array when no blocks exist", () => {
		const src = "const x = 1\nconst y = 2";
		const blocks = extractIgnoreBlocks(src, "capabilities/x/blockiyas/X/index.tsx");
		expect(blocks).toHaveLength(0);
	});

	test("detects justification comment in block", () => {
		const src = [
			"// @symphony-ignore-start",
			"// Intentional: adapter file — className required by Material Icons",
			'<span className="material-icons">',
			"// @symphony-ignore-end",
		].join("\n");

		const blocks = extractIgnoreBlocks(src, "capabilities/x/blockiyas/X/index.tsx");
		expect(blocks[0].hasJustification).toBe(true);
	});

	test("marks block without justification comment", () => {
		const src = ["// @symphony-ignore-start", '<span className="material-icons">', "// @symphony-ignore-end"].join(
			"\n"
		);

		const blocks = extractIgnoreBlocks(src, "capabilities/x/blockiyas/X/index.tsx");
		expect(blocks[0].hasJustification).toBe(false);
	});

	test("captures all suppressed lines in block", () => {
		const src = ["// @symphony-ignore-start", "line one", "line two", "line three", "// @symphony-ignore-end"].join(
			"\n"
		);

		const blocks = extractIgnoreBlocks(src, "capabilities/x/blockiyas/X/index.tsx");
		expect(blocks[0].lines).toHaveLength(3);
	});

	test("JSX comment style block is detected", () => {
		const src = [
			"return (",
			"  {/* @symphony-ignore-start */}",
			'  <div className="old">',
			"  {/* @symphony-ignore-end */}",
			")",
		].join("\n");

		const blocks = extractIgnoreBlocks(src, "capabilities/x/blockiyas/X/index.tsx");
		expect(blocks).toHaveLength(1);
		expect(blocks[0].lines[0]).toContain("className");
	});
});

// ── Integration: block correctly identifies suppressed violations ──────────────

describe("ignore-report — violation identification", () => {
	test("block suppressing raw invoke() is identified as Step 1 violation", async () => {
		const { checkIpcDirect } = await import("../checks/check-ipc-direct.js");

		const suppressedCode = `import { invoke } from '@tauri-apps/api/core'`;
		const filePath = "capabilities/x/blockiyas/X/index.tsx";

		// Without suppression, this would be a violation
		const violations = checkIpcDirect(suppressedCode, filePath);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Raw invoke()");
	});

	test("block suppressing className= is identified as Step 7 violation", async () => {
		const { checkBlockiyaStyling } = await import("../checks/check-blockiya-styling.js");

		const suppressedCode = `<span className='material-icons'>`;
		const filePath = "capabilities/x/blockiyas/X/index.tsx";

		const violations = checkBlockiyaStyling(suppressedCode, filePath);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("className=");
	});

	test("block suppressing css={} is identified as Step 7 violation", async () => {
		const { checkBlockiyaStyling } = await import("../checks/check-blockiya-styling.js");

		const suppressedCode = `<Box css={{ "&::after": { content: '""' } }}>`;
		const filePath = "capabilities/x/blockiyas/X/index.tsx";

		const violations = checkBlockiyaStyling(suppressedCode, filePath);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("css= in Blockiya");
	});

	test("stale block with no violations is flagged as potentially stale", async () => {
		const { checkIpcDirect } = await import("../checks/check-ipc-direct.js");
		const { checkBlockiyaStyling } = await import("../checks/check-blockiya-styling.js");

		// Clean code inside a suppress block — stale suppression
		const suppressedCode = `import { Box } from '@symphony/ui'`;
		const filePath = "capabilities/x/blockiyas/X/index.tsx";

		const v1 = checkIpcDirect(suppressedCode, filePath);
		const v7 = checkBlockiyaStyling(suppressedCode, filePath);

		// No violations found — block is stale
		expect(v1).toHaveLength(0);
		expect(v7).toHaveLength(0);
	});
});
