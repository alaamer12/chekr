import { describe, test, expect } from "vitest";
import {
	checkNoRawBrowserStorage,
	shouldScanFile,
	isAllowlistedPath,
	suggestReplacement,
	ALLOWLIST,
} from "../checks/check-no-raw-browser-storage.js";

const VIOLATION_GET = `const x = localStorage.getItem('key')`;
const VIOLATION_SET = `localStorage.setItem('key', '1')`;
const VIOLATION_SESSION = `sessionStorage.removeItem('key')`;
const VIOLATION_WINDOW = `window.localStorage.clear()`;
const VIOLATION_TYPEOF = `if (typeof localStorage !== 'undefined') {}`;
const CLEAN_ATOM = `import { atomWithStorage } from 'jotai/utils'`;
const SUPPRESSED = `// ---------- @symphony-ignore-start
localStorage.setItem('k', 'v')
// ---------- @symphony-ignore-end`;

describe("checkNoRawBrowserStorage", () => {
	test("detects localStorage.getItem", () => {
		const violations = checkNoRawBrowserStorage(VIOLATION_GET, "capabilities/foo/hooks/useThing.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Symphony session storage");
		expect(violations[0].fix).toContain("@symphony/core/storage");
	});

	test("detects localStorage.setItem", () => {
		const violations = checkNoRawBrowserStorage(VIOLATION_SET, "apps/xi-editor/src/workbench/hooks/useLayout.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].fix).toContain("workbenchLayoutAtom");
	});

	test("detects sessionStorage API", () => {
		const violations = checkNoRawBrowserStorage(VIOLATION_SESSION, "capabilities/x.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].fix).toContain("useClientSessionStorage");
	});

	test("detects window.localStorage", () => {
		const violations = checkNoRawBrowserStorage(VIOLATION_WINDOW, "packages/shell/foo.ts");
		expect(violations).toHaveLength(1);
	});

	test("detects typeof localStorage with probe hint", () => {
		const violations = checkNoRawBrowserStorage(VIOLATION_TYPEOF, "capabilities/configuration/palette/index.tsx");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Raw browser storage probe");
		expect(violations[0].fix).toContain("storageService");
	});

	test("passes atomWithStorage usage", () => {
		const violations = checkNoRawBrowserStorage(CLEAN_ATOM, "packages/data/atoms/x.ts");
		expect(violations).toHaveLength(0);
	});

	test("respects @symphony-ignore block", () => {
		const violations = checkNoRawBrowserStorage(SUPPRESSED, "capabilities/x.ts");
		expect(violations).toHaveLength(0);
	});

	test("skips allowlisted infrastructure paths", () => {
		for (const { path } of ALLOWLIST) {
			expect(isAllowlistedPath(path)).toBe(true);
			const violations = checkNoRawBrowserStorage(VIOLATION_SET, path);
			expect(violations).toHaveLength(0);
		}
	});

	test("skips test and story files", () => {
		expect(shouldScanFile("capabilities/foo/__tests__/bar.test.ts")).toBe(false);
		expect(shouldScanFile("capabilities/foo/bar.stories.tsx")).toBe(false);
		expect(shouldScanFile("packages/shell/vitest.setup.ts")).toBe(false);
	});

	test("skips rust target doc artifacts", () => {
		expect(shouldScanFile("apps/xi-editor/src-tauri/target/doc/static.files/storage.js")).toBe(false);
	});

	test("scans capabilities apps and shell only", () => {
		expect(shouldScanFile("capabilities/x.ts")).toBe(true);
		expect(shouldScanFile("apps/x.ts")).toBe(true);
		expect(shouldScanFile("packages/shell/x.ts")).toBe(true);
		expect(shouldScanFile("packages/data/x.ts")).toBe(false);
		expect(shouldScanFile("packages/shared/x.ts")).toBe(false);
	});

	test("suggestReplacement maps ai-chat drafts", () => {
		const fix = suggestReplacement(
			"capabilities/ai-orchestration/panels/ai-chat/utils/draftManager.ts",
			"localStorage.setItem(k,v)",
			"localStorage-api"
		);
		expect(fix).toContain("encryptedStorage");
	});
});
