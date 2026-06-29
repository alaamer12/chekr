import { describe, test, expect } from "vitest";
import { checkBareSizeCall } from "../checks/check-bare-size-call.js";

const FILE = "packages/ui/forms/Button.tsx";
const TOKEN_FILE = "packages/shared/tokens/space.ts";
const TEST_FILE = "packages/ui/forms/Button.test.tsx";

// ─── Violation detection ──────────────────────────────────────────────────────

describe("checkBareSizeCall — violations", () => {
	test("flags bare space(N) call", () => {
		const v = checkBareSizeCall(`const s = { padding: space(4) }`, FILE);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("space(4)");
	});

	test("flags bare fontSize(N) call", () => {
		const v = checkBareSizeCall(`const s = { fontSize: fontSize(3.5) }`, FILE);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("fontSize(3.5)");
	});

	test("flags bare size(N) call", () => {
		const v = checkBareSizeCall(`const s = { height: size(16) }`, FILE);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("size(16)");
	});

	test("flags bare call in variant definition", () => {
		const v = checkBareSizeCall(`variant({ variants: { sm: { px: space(2) } } })`, FILE);
		expect(v).toHaveLength(1);
	});

	test("reports correct line number", () => {
		const source = `const a = 1;\nconst s = { padding: space(4) };\nconst b = 2;`;
		const v = checkBareSizeCall(source, FILE);
		expect(v[0].line).toBe(2);
	});

	test("reports correct file path", () => {
		const v = checkBareSizeCall(`const s = { padding: space(4) }`, FILE);
		expect(v[0].file).toBe(FILE);
	});
});

// ─── Fix suggestions ──────────────────────────────────────────────────────────

describe("checkBareSizeCall — fix suggestions", () => {
	test("suggests space.md for space(4)", () => {
		const v = checkBareSizeCall(`space(4)`, FILE);
		expect(v[0].fix).toContain("space.md");
	});

	test("suggests fontSize.sm for fontSize(3.5)", () => {
		const v = checkBareSizeCall(`fontSize(3.5)`, FILE);
		expect(v[0].fix).toContain("fontSize.sm");
	});

	test("suggests size['2xl'] for size(16)", () => {
		const v = checkBareSizeCall(`size(16)`, FILE);
		expect(v[0].fix).toContain("size['2xl']");
	});

	test("suggests size.md for size(8)", () => {
		const v = checkBareSizeCall(`size(8)`, FILE);
		expect(v[0].fix).toContain("size.md");
	});
});

// ─── Clean cases — math chains ────────────────────────────────────────────────

describe("checkBareSizeCall — allowed math chains", () => {
	test("allows space(N).add()", () => {
		const v = checkBareSizeCall(`space(4).add("10%")`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows space(N).sub()", () => {
		const v = checkBareSizeCall(`space(6).sub(space.sm)`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows space(N).mul()", () => {
		const v = checkBareSizeCall(`space(7).mul(1.5)`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows space(N).div()", () => {
		const v = checkBareSizeCall(`space(8).div(2)`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows space(N).neg()", () => {
		const v = checkBareSizeCall(`space(4).neg()`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows space(N).clamp()", () => {
		const v = checkBareSizeCall(`space(4).clamp(space.sm, space.xl)`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows fontSize(N).mul()", () => {
		const v = checkBareSizeCall(`fontSize(3.5).mul(1.2)`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows size(N).add()", () => {
		const v = checkBareSizeCall(`size(8).add("2px")`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows arbitrary step with math — no named alias needed", () => {
		const v = checkBareSizeCall(`space(7).add("10%")`, FILE);
		expect(v).toHaveLength(0);
	});
});

// ─── Clean cases — named aliases ─────────────────────────────────────────────

describe("checkBareSizeCall — named aliases are always clean", () => {
	test("space.md is clean", () => {
		expect(checkBareSizeCall(`{ padding: space.md }`, FILE)).toHaveLength(0);
	});

	test("fontSize.sm is clean", () => {
		expect(checkBareSizeCall(`{ fontSize: fontSize.sm }`, FILE)).toHaveLength(0);
	});

	test(`size["2xl"] is clean`, () => {
		expect(checkBareSizeCall(`{ width: size["2xl"] }`, FILE)).toHaveLength(0);
	});

	test("space['3xl'] is clean", () => {
		expect(checkBareSizeCall(`{ margin: space['3xl'] }`, FILE)).toHaveLength(0);
	});
});

// ─── Scope exclusions ─────────────────────────────────────────────────────────

describe("checkBareSizeCall — scope exclusions", () => {
	test("allows bare calls in token source files", () => {
		const v = checkBareSizeCall(`spaceScale["2xs"] = sizeToken(1 * BASE)`, TOKEN_FILE);
		expect(v).toHaveLength(0);
	});

	test("allows bare calls in test files", () => {
		const v = checkBareSizeCall(`expect(space(4).toString()).toBe("1rem")`, TEST_FILE);
		expect(v).toHaveLength(0);
	});
});

// ─── Suppression ─────────────────────────────────────────────────────────────

describe("checkBareSizeCall — suppression", () => {
	test("respects @symphony-ignore block", () => {
		const source = `// ---------- @symphony-ignore-start
const s = { padding: space(4) }
// ---------- @symphony-ignore-end`;
		const v = checkBareSizeCall(source, FILE);
		expect(v).toHaveLength(0);
	});
});

// ─── Multiple violations ──────────────────────────────────────────────────────

describe("checkBareSizeCall — multiple violations", () => {
	test("detects multiple bare calls in one file", () => {
		const source = [
			`const s = { padding: space(4) }`,
			`const t = { fontSize: fontSize(3.5) }`,
			`const u = { height: size(8) }`,
		].join("\n");
		const v = checkBareSizeCall(source, FILE);
		expect(v).toHaveLength(3);
		expect(v[0].line).toBe(1);
		expect(v[1].line).toBe(2);
		expect(v[2].line).toBe(3);
	});

	test("detects multiple bare calls on the same line", () => {
		const v = checkBareSizeCall(`const s = { p: space(4), m: space(2) }`, FILE);
		expect(v).toHaveLength(2);
	});
});

// ─── Numeric bracket access ───────────────────────────────────────────────────

describe("checkBareSizeCall — numeric bracket access", () => {
	test("flags space[2] numeric bracket access", () => {
		const v = checkBareSizeCall(`const s = { padding: space[2] }`, FILE);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("space[2]");
		expect(v[0].fix).toContain("space.xs");
	});

	test("flags space[1] numeric bracket access", () => {
		const v = checkBareSizeCall(`const s = { padding: space[1] }`, FILE);
		expect(v).toHaveLength(1);
		expect(v[0].fix).toContain("space['2xs']");
	});

	test("flags space[4] numeric bracket access", () => {
		const v = checkBareSizeCall(`const s = { padding: space[4] }`, FILE);
		expect(v).toHaveLength(1);
		expect(v[0].fix).toContain("space.md");
	});

	test("flags fontSize[3] numeric bracket access", () => {
		const v = checkBareSizeCall(`const s = { fontSize: fontSize[3] }`, FILE);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("fontSize[3]");
	});

	test("flags size[8] numeric bracket access", () => {
		const v = checkBareSizeCall(`const s = { height: size[8] }`, FILE);
		expect(v).toHaveLength(1);
		expect(v[0].fix).toContain("size.md");
	});

	test("flags numeric bracket in template literal context", () => {
		const v = checkBareSizeCall("const s = `padding: ${space[2]}`", FILE);
		expect(v).toHaveLength(1);
	});

	test("allows string bracket access for named aliases (space['2xs'])", () => {
		// String bracket access is the named alias form — allowed
		const v = checkBareSizeCall(`const s = { padding: space['2xs'] }`, FILE);
		expect(v).toHaveLength(0);
	});

	test('allows string bracket access with double quotes (space["2xl"])', () => {
		const v = checkBareSizeCall(`const s = { padding: space["2xl"] }`, FILE);
		expect(v).toHaveLength(0);
	});

	test("does not flag numeric bracket in token source files", () => {
		const v = checkBareSizeCall(`spaceScale[1] = sizeToken(1 * BASE)`, TOKEN_FILE);
		expect(v).toHaveLength(0);
	});
});
