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
 * packages/utils). The returned paths are still relative to CWD, so
 * assertions use path.relative() to normalise expectations.
 */

import { describe, test, expect } from "vitest";
import { walkFiles } from "../src/file-walker.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PACKAGE_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.resolve(PACKAGE_DIR, "../..");
const TOOLKIT_DIR = path.join(REPO_ROOT, "toolkit");
const UTILS_DIR = path.join(TOOLKIT_DIR, "utils");
const CHECKS_DIR = path.join(TOOLKIT_DIR, "checks");

function cwdRelative(absPath) {
	return path.relative(process.cwd(), absPath).replace(/\\/g, "/");
}

describe("walkFiles — path format", () => {
	test("returns paths with forward slashes only (no backslashes)", () => {
		const files = walkFiles(UTILS_DIR, [".js"]);
		for (const file of files) {
			expect(file).not.toContain("\\");
		}
	});

	test("returns paths relative to CWD, not relative to rootDir", () => {
		const files = walkFiles(UTILS_DIR, [".js"]);
		expect(files.length).toBeGreaterThan(0);
		const expectedPrefix = cwdRelative(UTILS_DIR) + "/";
		for (const file of files) {
			expect(file.startsWith(expectedPrefix)).toBe(true);
		}
	});

	test("paths include the full directory prefix from CWD", () => {
		const files = walkFiles(UTILS_DIR, [".js"]);
		const fileWalker = files.find(f => f.endsWith("file-walker.js"));
		const expected = cwdRelative(path.join(UTILS_DIR, "file-walker.js"));
		expect(fileWalker).toBe(expected);
	});

	test("REGRESSION: blockiyas path is detectable via forward-slash includes()", () => {
		const files = walkFiles(CHECKS_DIR, [".js"]);
		for (const file of files) {
			expect(file).not.toContain("\\");
		}
		const expectedPrefix = cwdRelative(CHECKS_DIR) + "/";
		expect(files.every(f => f.startsWith(expectedPrefix))).toBe(true);
	});

	test("REGRESSION: glob pattern **/checks/** matches returned paths", () => {
		const files = walkFiles(CHECKS_DIR, [".js"]);

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
		expect(matched.some(f => f.includes("check-code-duplication"))).toBe(true);
	});

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
		expect(files.length).toBeGreaterThan(0);
		expect(files.every(f => f.endsWith(".js") || f.endsWith(".ts"))).toBe(true);
	});

	test("returns sorted paths for deterministic output", () => {
		const files = walkFiles(UTILS_DIR, [".js"]);
		const sorted = [...files].sort();
		expect(files).toEqual(sorted);
	});

	test("skips node_modules", () => {
		const files = walkFiles(TOOLKIT_DIR, [".js"]);
		expect(files.every(f => !f.includes("/node_modules/"))).toBe(true);
	});

	test("skips caller-provided exclude paths", () => {
		const handlerSubdir = path.join(CHECKS_DIR, "check-react-handlers");
		const files = walkFiles(CHECKS_DIR, [".js"], {
			excludePaths: new Set([cwdRelative(handlerSubdir)]),
		});
		expect(files.every(f => !f.includes("check-react-handlers/"))).toBe(true);
		expect(files.some(f => f.includes("check-code-duplication"))).toBe(true);
	});
});
