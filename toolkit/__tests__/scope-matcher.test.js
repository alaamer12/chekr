/**
 * scope-matcher.test.js
 *
 * Regression tests for the Windows backslash path bug in matchesScope.
 *
 * Bug: matchesScope used regex /^.*\/blockiyas\/.*$/ (forward slashes) but
 * on Windows, walkFiles returned paths with backslashes. The regex never
 * matched, so ALL glob-pattern scope checks silently passed on Windows —
 * Steps 5, 7, 10 were completely blind to every Blockiya file.
 *
 * Fix: matchesScope normalises filePath backslashes to forward slashes
 * before testing against the regex.
 */

import { describe, test, expect } from "vitest";
import { matchesScope } from "../utils/scope-matcher.js";

describe("matchesScope — glob patterns", () => {
	// ── REGRESSION: Windows backslash paths ───────────────────────────────────

	test("REGRESSION: Windows backslash path matches **/blockiyas/** glob", () => {
		// Before the fix this returned false — the bug that hid all Blockiya violations
		const windowsPath = "capabilities\\welcome-onboarding\\panels\\welcome\\blockiyas\\WelcomeBlock\\index.tsx";
		expect(matchesScope(windowsPath, ["**/blockiyas/**"])).toBe(true);
	});

	test("REGRESSION: Windows backslash path matches **/blockiyas/** in children", () => {
		const windowsPath = "capabilities\\editing\\panels\\editor\\blockiyas\\EditorBlock\\children\\Toolbar.tsx";
		expect(matchesScope(windowsPath, ["**/blockiyas/**"])).toBe(true);
	});

	test("REGRESSION: Windows backslash path matches **/*.stories.tsx glob", () => {
		const windowsPath = "capabilities\\welcome-onboarding\\panels\\welcome\\stories\\WelcomeBlock.stories.tsx";
		expect(matchesScope(windowsPath, ["**/*.stories.tsx"])).toBe(true);
	});

	test("REGRESSION: Windows backslash path matches **/TabManagerBlock/** glob", () => {
		const windowsPath = "packages\\shell\\TabManagerBlock\\TabManagerBlock.tsx";
		expect(matchesScope(windowsPath, ["**/TabManagerBlock/**"])).toBe(true);
	});

	// ── Forward slash paths still work ────────────────────────────────────────

	test("forward slash path matches **/blockiyas/** glob", () => {
		const path = "capabilities/welcome-onboarding/panels/welcome/blockiyas/WelcomeBlock/index.tsx";
		expect(matchesScope(path, ["**/blockiyas/**"])).toBe(true);
	});

	test("forward slash path matches **/*.stories.tsx glob", () => {
		const path = "capabilities/welcome-onboarding/panels/welcome/stories/WelcomeBlock.stories.tsx";
		expect(matchesScope(path, ["**/*.stories.tsx"])).toBe(true);
	});

	// ── Non-matching paths ────────────────────────────────────────────────────

	test("non-blockiya path does NOT match **/blockiyas/** glob", () => {
		expect(matchesScope("capabilities/editing/panels/editor/hooks/useEditor.ts", ["**/blockiyas/**"])).toBe(false);
	});

	test("non-stories path does NOT match **/*.stories.tsx glob", () => {
		expect(matchesScope("capabilities/editing/panels/editor/index.tsx", ["**/*.stories.tsx"])).toBe(false);
	});

	test("Windows non-blockiya path does NOT match **/blockiyas/** glob", () => {
		expect(matchesScope("capabilities\\editing\\panels\\editor\\hooks\\useEditor.ts", ["**/blockiyas/**"])).toBe(
			false
		);
	});
});

describe("matchesScope — prefix patterns", () => {
	// ── Forward slash prefix matching ─────────────────────────────────────────

	test("matches capabilities/ prefix", () => {
		expect(matchesScope("capabilities/editing/panels/editor/index.tsx", ["capabilities/"])).toBe(true);
	});

	test("matches packages/ prefix", () => {
		expect(matchesScope("packages/shell/index.ts", ["packages/"])).toBe(true);
	});

	test("matches apps/ prefix", () => {
		expect(matchesScope("apps/xi-editor/src/App.tsx", ["apps/"])).toBe(true);
	});

	test("does NOT match wrong prefix", () => {
		expect(matchesScope("capabilities/editing/index.tsx", ["packages/"])).toBe(false);
	});

	// ── Windows backslash prefix matching ─────────────────────────────────────

	test("REGRESSION: Windows backslash path matches capabilities/ prefix", () => {
		// Prefix matching also normalises backslashes
		expect(matchesScope("capabilities\\editing\\panels\\editor\\index.tsx", ["capabilities/"])).toBe(true);
	});

	test("REGRESSION: Windows backslash path matches packages/ prefix", () => {
		expect(matchesScope("packages\\shell\\index.ts", ["packages/"])).toBe(true);
	});
});

describe("matchesScope — multiple scope patterns", () => {
	test("matches when any pattern in scope array matches", () => {
		const scope = ["capabilities/", "apps/", "packages/"];
		expect(matchesScope("capabilities/editing/index.tsx", scope)).toBe(true);
		expect(matchesScope("apps/xi-editor/src/App.tsx", scope)).toBe(true);
		expect(matchesScope("packages/shell/index.ts", scope)).toBe(true);
	});

	test("does NOT match when no pattern matches", () => {
		const scope = ["capabilities/", "apps/"];
		expect(matchesScope("packages/shell/index.ts", scope)).toBe(false);
	});

	test("Windows path matches when any pattern in scope array matches", () => {
		const scope = ["**/blockiyas/**", "**/TabManagerBlock/**"];
		expect(matchesScope("capabilities\\editing\\blockiyas\\EditorBlock\\index.tsx", scope)).toBe(true);
		expect(matchesScope("packages\\shell\\TabManagerBlock\\TabManagerBlock.tsx", scope)).toBe(true);
	});
});
