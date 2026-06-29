import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	checkLiteralUnionsRepo,
	collectScopedTypeScriptFiles,
	collectLiteralMembers,
	normalizeUnionSignature,
	suggestAliasNameFromContext,
	suggestAliasNameFromMembers,
} from "../check-literal-unions.js";
import { Project, SyntaxKind } from "ts-morph";

let tempDir;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "symphony-lit-unions-"));
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

function unionFromSource(snippet) {
	const project = new Project({ useInMemoryFileSystem: true });
	const sf = project.createSourceFile("t.ts", snippet);
	const union = sf.getFirstDescendantByKind(SyntaxKind.UnionType);
	return union;
}

describe("normalizeUnionSignature", () => {
	test("order-independent", () => {
		expect(normalizeUnionSignature(['"b"', '"a"'])).toBe(normalizeUnionSignature(['"a"', '"b"']));
	});
});

describe("collectLiteralMembers", () => {
	test("accepts pure literal unions with 2+ members", () => {
		const union = unionFromSource(`const x: "a" | "b" = "a";`);
		expect(collectLiteralMembers(union)).toEqual(['"a"', '"b"']);
	});

	test("rejects mixed literal and primitive unions", () => {
		const union = unionFromSource(`const x: string | "a" = "a";`);
		expect(collectLiteralMembers(union)).toBeNull();
	});

	test("respects minMembers threshold", () => {
		write("capabilities/demo/src/two.ts", `export const x: "a" | "b" = "a";`);
		expect(checkLiteralUnionsRepo(tempDir, null, { minMembers: 3 })).toHaveLength(0);
	});
});

describe("suggestAliasNameFromContext", () => {
	test("uses parameter name with Type suffix", () => {
		const union = unionFromSource(`function f(status: "open" | "closed") {}`);
		expect(suggestAliasNameFromContext(union)).toBe("StatusType");
	});
});

describe("checkLiteralUnionsRepo", () => {
	test("flags INLINE_LITERAL_UNION for inline union", () => {
		write(
			"capabilities/demo/src/widget.ts",
			`export function setMode(mode: "read" | "write") {
  return mode;
}`
		);

		const violations = checkLiteralUnionsRepo(tempDir);
		expect(violations.length).toBe(1);
		expect(violations[0].message).toContain("[Step 1 failed]");
		expect(violations[0].fix).toContain("ModeType");
	});

	test("flags DUPLICATE_INLINE_UNION on second identical inline site", () => {
		write("capabilities/demo/src/a.ts", `export const a: "x" | "y" = "x";`);
		write("capabilities/demo/src/b.ts", `export const b: "y" | "x" = "y";`);

		const violations = checkLiteralUnionsRepo(tempDir);
		expect(violations.length).toBe(2);
		expect(violations.some(v => v.message.includes("[Step 1 failed]"))).toBe(true);
		expect(violations.some(v => v.message.includes("[Step 2 failed]"))).toBe(true);
	});

	test("flags INLINE_EXISTING_ALIAS_UNUSED when alias already exists", () => {
		write(
			"capabilities/demo/src/types.ts",
			`export type ModeType = "on" | "off";
export function toggle(m: "on" | "off") {}`
		);

		const violations = checkLiteralUnionsRepo(tempDir);
		expect(violations.some(v => v.message.includes("[Step 1 + Step 2 failed]"))).toBe(true);
		expect(violations.some(v => v.fix.includes("ModeType"))).toBe(true);
	});

	test("does not flag named type alias body", () => {
		write("capabilities/demo/src/types.ts", `export type StatusType = "a" | "b";`);
		write(
			"capabilities/demo/src/use.ts",
			`import type { StatusType } from "./types";
export function f(s: StatusType) {}`
		);

		const violations = checkLiteralUnionsRepo(tempDir);
		expect(violations).toHaveLength(0);
	});

	test("respects @symphony-ignore block", () => {
		write(
			"capabilities/demo/src/ignored.ts",
			`// @symphony-ignore-start
export const x: "a" | "b" = "a";
// @symphony-ignore-end`
		);

		const violations = checkLiteralUnionsRepo(tempDir);
		expect(violations).toHaveLength(0);
	});

	test("skips toolkit and test paths", () => {
		write("packages/toolkit/__tests__/fixture.ts", `export const x: "a" | "b" = "a";`);
		write("capabilities/demo/src/foo.test.ts", `export const y: "c" | "d" = "c";`);

		const violations = checkLiteralUnionsRepo(tempDir);
		expect(violations).toHaveLength(0);
	});

	test("collectScopedTypeScriptFiles excludes out-of-scope paths", () => {
		write("capabilities/demo/src/ok.ts", `export const z: 1 | 2 = 1;`);
		write("scripts/outside.ts", `export const w: "a" | "b" = "a";`);

		const files = collectScopedTypeScriptFiles(tempDir);
		expect(files.some(f => f.includes("capabilities/demo"))).toBe(true);
		expect(files.some(f => f.includes("scripts/"))).toBe(false);

		const violations = checkLiteralUnionsRepo(tempDir);
		expect(violations.length).toBe(1);
		expect(violations[0].file).toContain("capabilities/demo");
	});

	test("suggestAliasNameFromMembers fallback when no context", () => {
		expect(suggestAliasNameFromMembers(['"foo"', '"bar"'])).toMatch(/Type$/);
	});
});
