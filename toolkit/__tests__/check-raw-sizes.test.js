import { describe, test, expect } from "vitest";
import { checkRawSizes } from "../checks/check-raw-sizes.js";

const FILE = "packages/ui/forms/Button.tsx";
const TOKEN_FILE = "packages/shared/tokens/space.ts";
const TEST_FILE = "packages/ui/forms/Button.test.tsx";

// ─── Raw rem violations ───────────────────────────────────────────────────────

describe("checkRawSizes — raw rem", () => {
	test("flags raw rem as CSS value", () => {
		const v = checkRawSizes(`const s = { padding: "1rem" }`, FILE);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("1rem");
	});

	test("flags fractional rem", () => {
		const v = checkRawSizes(`const s = { fontSize: "0.875rem" }`, FILE);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("0.875rem");
	});

	test("flags rem in template literal style", () => {
		const v = checkRawSizes(`const s = { gap: "1.5rem" }`, FILE);
		expect(v).toHaveLength(1);
	});

	test("does not flag rem inside .add() operand", () => {
		// This would be caught by dev-mode SizeToken validation anyway,
		// but the checker should not double-flag it
		const v = checkRawSizes(`space.md.add("1rem")`, FILE);
		// The checker flags this because raw rem in .add() is also wrong
		// (should use a SizeToken) — but it's the SizeToken that throws at runtime
		// The checker exempts .add() operands to avoid noise
		expect(v).toHaveLength(0);
	});

	test("does not flag rem inside calc() string", () => {
		const v = checkRawSizes(`const s = { padding: "calc(1rem + 10%)" }`, FILE);
		expect(v).toHaveLength(0);
	});

	test("does not flag in token source files", () => {
		const v = checkRawSizes(`export const space = { md: "1rem" }`, TOKEN_FILE);
		expect(v).toHaveLength(0);
	});

	test("does not flag in test files", () => {
		const v = checkRawSizes(`const s = { padding: "1rem" }`, TEST_FILE);
		expect(v).toHaveLength(0);
	});

	test("provides fix suggestion for known rem values", () => {
		const v = checkRawSizes(`const s = { fontSize: "0.875rem" }`, FILE);
		expect(v[0].fix).toContain("fontSize.sm");
	});

	test("reports correct line number", () => {
		const source = `const a = 1;\nconst s = { padding: "1rem" };\nconst b = 2;`;
		const v = checkRawSizes(source, FILE);
		expect(v[0].line).toBe(2);
	});
});

// ─── Raw px violations ────────────────────────────────────────────────────────

describe("checkRawSizes — raw px", () => {
	test("flags large raw px values", () => {
		const v = checkRawSizes(`const s = { height: "32px" }`, FILE);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("32px");
	});

	test("flags medium raw px values", () => {
		const v = checkRawSizes(`const s = { gap: "8px" }`, FILE);
		expect(v).toHaveLength(1);
	});

	test("flags small px on non-border properties", () => {
		const v = checkRawSizes(`const s = { padding: "2px" }`, FILE);
		expect(v).toHaveLength(1);
	});

	test("allows 1px on border property", () => {
		const v = checkRawSizes(`const s = { border: "1px solid" }`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows 2px on border property", () => {
		const v = checkRawSizes(`const s = { borderWidth: "2px" }`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows 2px on outline property", () => {
		const v = checkRawSizes(`const s = { outline: "2px solid" }`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows 9999px (radius.full special case)", () => {
		const v = checkRawSizes(`const s = { borderRadius: "9999px" }`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows 0px", () => {
		const v = checkRawSizes(`const s = { margin: "0px" }`, FILE);
		expect(v).toHaveLength(0);
	});

	test("does not flag px inside .add() operand", () => {
		const v = checkRawSizes(`size.md.add("2px")`, FILE);
		expect(v).toHaveLength(0);
	});

	test("does not flag px inside .sub() operand", () => {
		const v = checkRawSizes(`space.lg.sub("4px")`, FILE);
		expect(v).toHaveLength(0);
	});

	test("provides fix suggestion for known px values", () => {
		const v = checkRawSizes(`const s = { height: "32px" }`, FILE);
		expect(v[0].fix).toContain("size.md");
	});
});

// ─── Raw em violations ────────────────────────────────────────────────────────

describe("checkRawSizes — raw em", () => {
	test("flags raw em values", () => {
		const v = checkRawSizes(`const s = { letterSpacing: "0.05em" }`, FILE);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("0.05em");
	});

	test("does not flag em inside .add() operand", () => {
		const v = checkRawSizes(`space.md.add("0.5em")`, FILE);
		expect(v).toHaveLength(0);
	});
});

// ─── Suppression ─────────────────────────────────────────────────────────────

describe("checkRawSizes — suppression", () => {
	test("respects @symphony-ignore block", () => {
		const source = `// ---------- @symphony-ignore-start
const s = { padding: "1rem" }
// ---------- @symphony-ignore-end`;
		const v = checkRawSizes(source, FILE);
		expect(v).toHaveLength(0);
	});
});

// ─── Comment lines ────────────────────────────────────────────────────────────

describe("checkRawSizes — comment lines", () => {
	test("does not flag values in single-line comments", () => {
		const v = checkRawSizes(`// padding: "1rem" — old value`, FILE);
		expect(v).toHaveLength(0);
	});

	test("does not flag values in JSDoc comments", () => {
		const v = checkRawSizes(` * @example { padding: "1rem" }`, FILE);
		expect(v).toHaveLength(0);
	});
});
// ─── Shorthand violations ─────────────────────────────────────────────────────
describe("checkRawSizes — shorthand", () => {
	test("flags shorthand with two unit values", () => {
		const v = checkRawSizes(`const s = { padding: "12px 16px" }`, FILE);
		expect(v).toHaveLength(1);
	});

	test("flags shorthand starting with zero", () => {
		const v = checkRawSizes(`const s = { margin: "0 24px 48px" }`, FILE);
		expect(v).toHaveLength(1);
	});

	test("flags shorthand with mixed units and numbers", () => {
		const v = checkRawSizes(`const s = { padding: "9px 24px" }`, FILE);
		expect(v).toHaveLength(1);
	});
});
