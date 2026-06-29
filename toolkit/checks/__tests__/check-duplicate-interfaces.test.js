import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	checkDuplicateInterfacesRepo,
	collectScopedTypeScriptFiles,
	extractDeclarationsFromFiles,
	findDuplicatePairs,
	pairsToViolations,
	compareDeclarations,
	CODE,
} from "../check-duplicate-interfaces.js";

let tempDir;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "symphony-dup-ifaces-"));
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

function write(rel, content) {
	const full = join(tempDir, rel);
	mkdirSync(join(full, ".."), { recursive: true });
	writeFileSync(full, content, "utf8");
	return full;
}

describe("compareDeclarations", () => {
	test("detects exact duplicate", () => {
		const a = { name: "User", props: [{ name: "id", type: "string", optional: false, readonly: false }] };
		const b = { name: "User", props: [{ name: "id", type: "string", optional: false, readonly: false }] };
		expect(compareDeclarations(a, b)).toBe(CODE.EXACT_DUPLICATE);
	});

	test("detects same structure different names", () => {
		const props = [
			{ name: "lat", type: "number", optional: false, readonly: false },
			{ name: "lng", type: "number", optional: false, readonly: false },
		];
		expect(compareDeclarations({ name: "Coordinates", props }, { name: "GeoPoint", props })).toBe(
			CODE.SAME_STRUCTURE
		);
	});
});

describe("checkDuplicateInterfacesRepo", () => {
	const SLOW = 30_000;

	test(
		"flags EXACT_DUPLICATE across files",
		() => {
			write(
				"capabilities/demo/src/user.types.ts",
				`export interface UserProfile {
  id: string;
  name: string;
  email: string;
}`
			);
			write(
				"capabilities/demo/src/product.types.ts",
				`export interface UserProfile {
  id: string;
  name: string;
  email: string;
}`
			);

			const scopedFiles = collectScopedTypeScriptFiles(tempDir);
			const decls = extractDeclarationsFromFiles(scopedFiles, tempDir);
			const pairs = findDuplicatePairs(decls);
			expect(pairs.some(p => p.code === CODE.EXACT_DUPLICATE)).toBe(true);

			const violations = pairsToViolations(pairs);
			expect(violations.length).toBeGreaterThan(0);
			expect(violations[0].message).toContain("UserProfile");
			expect(violations[0].fix).toMatch(/capabilities\/demo/);
		},
		SLOW
	);

	test("flags SAME_STRUCTURE with rename suggestion", () => {
		write("capabilities/demo/src/a.ts", `export interface Coordinates { lat: number; lng: number; }`);
		write("capabilities/demo/src/b.ts", `export interface GeoPoint { lat: number; lng: number; }`);

		const files = collectScopedTypeScriptFiles(tempDir);
		const violations = pairsToViolations(findDuplicatePairs(extractDeclarationsFromFiles(files, tempDir)));
		expect(violations.some(v => v.message.includes("Coordinates") && v.message.includes("GeoPoint"))).toBe(true);
		expect(violations.some(v => v.fix.includes("Merge"))).toBe(true);
	});

	test("no false positive on type-only re-export", () => {
		write("capabilities/demo/src/types.ts", `export interface CanonicalUser { id: string; name: string; }`);
		write("capabilities/demo/src/index.ts", `export type { CanonicalUser } from "./types";`);

		const files = collectScopedTypeScriptFiles(tempDir);
		const violations = pairsToViolations(findDuplicatePairs(extractDeclarationsFromFiles(files, tempDir)));
		expect(violations.filter(v => v.message.includes("CanonicalUser"))).toHaveLength(0);
	});

	test("respects @symphony-ignore block on duplicate declaration", () => {
		write(
			"capabilities/demo/src/ignored.ts",
			`// @symphony-ignore-start
export interface IgnoredDup { id: string; label: string; }
// @symphony-ignore-end`
		);
		write("capabilities/demo/src/other.ts", `export interface IgnoredDup { id: string; label: string; }`);

		const violations = checkDuplicateInterfacesRepo(tempDir);
		expect(violations.filter(v => v.message.includes("IgnoredDup"))).toHaveLength(0);
	});

	test("skips toolkit and test paths", () => {
		write(
			"packages/toolkit/__tests__/fixture.ts",
			`export interface A { x: string; }
export interface B { x: string; }`
		);
		const violations = checkDuplicateInterfacesRepo(tempDir);
		expect(violations).toHaveLength(0);
	});

	test(
		"includes actionable shared path for blockiya-like paths",
		() => {
			write(
				"capabilities/demo/src/blockiyas/Foo/shared/types.ts",
				`export interface FooProps { open: boolean; }`
			);
			write("capabilities/demo/src/blockiyas/Foo/Foo.tsx", `export interface FooProps { open: boolean; }`);

			const violations = checkDuplicateInterfacesRepo(tempDir);
			expect(violations.some(v => v.fix.includes("shared/types"))).toBe(true);
		},
		SLOW
	);
});
