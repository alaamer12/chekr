/**
 * file-walker.test.js
 *
 * Regression tests for the Windows backslash path bug.
 *
 * Bug: walkFiles() used path.relative(rootDir, fullPath) which on Windows
 * returns backslash-separated paths (e.g. "panels\\welcome\\blockiyas\\...").
 * The matchesScope regex tested for forward slashes (/blockiyas/), so ALL
 * glob-pattern scope checks silently passed on Windows — every Blockiya
 * was invisible to Steps 5, 7, 10.
 *
 * Fix: paths are now relative to CWD with .replace(/\\/g, "/") applied.
 *
 * NOTE: These tests pass absolute paths to walkFiles() so they work correctly
 * regardless of which directory vitest is invoked from (workspace root or
 * packages/toolkit). The returned paths are still relative to CWD, so
 * assertions use path.relative() to normalise expectations.
 */

import { describe, test, expect } from "vitest";
import { walkFiles } from "../utils/file-walker.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Absolute path to the toolkit package root — stable regardless of CWD
const TOOLKIT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const UTILS_DIR = path.join(TOOLKIT_DIR, "utils");
const CHECKS_DIR = path.join(TOOLKIT_DIR, "checks");

// Helper: normalise an absolute path to a CWD-relative forward-slash path.
// This mirrors what walkFiles() returns.
function cwdRelative(absPath) {
	return path.relative(process.cwd(), absPath).replace(/\\/g, "/");
}

describe("walkFiles — path format", () => {
	// ── Forward slash guarantee ────────────────────────────────────────────────

	test("returns paths with forward slashes only (no backslashes)", () => {
		const files = walkFiles(UTILS_DIR, [".js"]);
		for (const file of files) {
			expect(file).not.toContain("\\");
		}
	});

	test("returns paths relative to CWD, not relative to rootDir", () => {
		// Paths must include the full directory prefix from CWD, not just the
		// bare filename. e.g. "packages/toolkit/utils/file-walker.js" not
		// "file-walker.js".
		const files = walkFiles(UTILS_DIR, [".js"]);
		expect(files.length).toBeGreaterThan(0);
		const expectedPrefix = cwdRelative(UTILS_DIR) + "/";
		for (const file of files) {
			// Must start with the directory prefix — not just a bare filename
			expect(file.startsWith(expectedPrefix)).toBe(true);
		}
	});

	test("paths include the full directory prefix from CWD", () => {
		const files = walkFiles(UTILS_DIR, [".js"]);
		const fileWalker = files.find(f => f.endsWith("file-walker.js"));
		const expected = cwdRelative(path.join(UTILS_DIR, "file-walker.js"));
		expect(fileWalker).toBe(expected);
	});

	// ── Regression: the exact bug scenario ────────────────────────────────────

	test("REGRESSION: blockiyas path is detectable via forward-slash includes()", () => {
		// Before the fix, walkFiles returned backslash paths on Windows and
		// filePath.includes("/blockiyas/") returned false.
		// After the fix, paths use forward slashes so the check works.
		const files = walkFiles(CHECKS_DIR, [".js"]);
		// All paths must use forward slashes
		for (const file of files) {
			expect(file).not.toContain("\\");
		}
		// Paths must be prefixed with the directory name (CWD-relative)
		const expectedPrefix = cwdRelative(CHECKS_DIR) + "/";
		expect(files.every(f => f.startsWith(expectedPrefix))).toBe(true);
	});

	test("REGRESSION: glob pattern **/checks/** matches returned paths", () => {
		// Before the fix, the regex /^.*\/checks\/.*$/ never matched
		// backslash paths on Windows.
		const files = walkFiles(CHECKS_DIR, [".js"]);

		// Build a regex from the glob pattern "checks/**"
		// (using the CWD-relative prefix so it matches regardless of where
		// vitest is invoked from)
		const checksPrefix = cwdRelative(CHECKS_DIR);
		const pattern = checksPrefix + "/**";
		const regexPattern = pattern
			.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
			.replace(/\*\*/g, "___DOUBLESTAR___")
			.replace(/\*/g, "[^/]*")
			.replace(/___DOUBLESTAR___/g, ".*");
		const regex = new RegExp(`^${regexPattern}$`);

		const matched = files.filter(f => regex.test(f));
		expect(matched.length).toBeGreaterThan(0);
		expect(matched.some(f => f.includes("check-blockiya"))).toBe(true);
	});

	// ── Extension filtering ────────────────────────────────────────────────────

	test("only returns files matching the given extensions", () => {
		const files = walkFiles(UTILS_DIR, [".js"]);
		for (const file of files) {
			expect(file).toMatch(/\.js$/);
		}
	});

	test("returns empty array when no files match extensions", () => {
		const files = walkFiles(UTILS_DIR, [".xyz_nonexistent"]);
		expect(files).toHaveLength(0);
	});

	test("returns both .js and .ts files when both requested", () => {
		const files = walkFiles(UTILS_DIR, [".js", ".ts"]);
		// utils/ has .js files — at minimum those should be found
		expect(files.length).toBeGreaterThan(0);
		expect(files.every(f => f.endsWith(".js") || f.endsWith(".ts"))).toBe(true);
	});

	// ── Sorting ────────────────────────────────────────────────────────────────

	test("returns sorted paths for deterministic output", () => {
		const files = walkFiles(UTILS_DIR, [".js"]);
		const sorted = [...files].sort();
		expect(files).toEqual(sorted);
	});

	// ── Ignored directories ────────────────────────────────────────────────────

	test("skips node_modules", () => {
		const files = walkFiles(TOOLKIT_DIR, [".js"]);
		expect(files.every(f => !f.includes("/node_modules/"))).toBe(true);
	});
});
