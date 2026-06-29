import { describe, test, expect } from "vitest";
import { checkRawColors } from "../checks/check-raw-colors.js";

// ─── Paths ────────────────────────────────────────────────────────────────────

const CAPABILITY_PATH = "capabilities/editing/panels/editor/blockiyas/EditorBlock/index.tsx";
const APP_PATH = "apps/xi-editor/src/App.tsx";
const PACKAGE_PATH = "packages/ui/forms/Button.tsx";
const TOKENS_PATH = "packages/shared/tokens/color.ts"; // ← allowed
const PALETTE_PATH = "packages/shared/tokens/palette.ts"; // ← allowed
const GRADIENT_PATH = "packages/shared/tokens/gradient.ts"; // ← allowed
const SHADOW_PATH = "packages/shared/tokens/shadow.ts"; // ← allowed (drop shadows)
const TOOLKIT_PATH = "packages/toolkit/checks/check-raw-colors.js"; // ← allowed
const TEST_PATH = "capabilities/x/__tests__/x.test.ts"; // ← allowed
const SPEC_PATH = "capabilities/x/x.spec.tsx"; // ← allowed

// ─── Violation sources ────────────────────────────────────────────────────────

const HEX_PROP = `<Box bg="#5B8FF9" />`;
const HEX_STYLE_OBJ = `const s = { background: "#1E1E1E" }`;
const HEX_TEMPLATE = `const c = \`color: #4A7AD8\``;
const RGBA_PROP = `<Box bg="rgba(91, 143, 249, 0.2)" />`;
const RGBA_STYLE = `style={{ color: "rgba(0,0,0,0.5)" }}`;
const RGB_PROP = `<Box color="rgb(255, 107, 53)" />`;
const HSL_PROP = `<Box bg="hsl(220, 90%, 60%)" />`;
const HSLA_PROP = `<Box bg="hsla(220, 90%, 60%, 0.5)" />`;
const OKLCH_INLINE = `<Box bg="oklch(0.65 0.17 260)" />`;
const LINEAR_HEX = `backgroundImage: "linear-gradient(135deg, #5B8FF9 0%, #4A7AD8 100%)"`;
const RADIAL_RGBA = `backgroundImage: "radial-gradient(at 27% 37%, rgba(91,143,249,0.12) 0px, transparent 50%)"`;

// ─── Clean sources ────────────────────────────────────────────────────────────

const CLEAN_PALETTE = `<Box bg={palette.blue[500]} />`;
const CLEAN_COLOR = `<Box bg={color.brand} color={color.textPrimary} />`;
const CLEAN_ALPHA = `<Box bg={palette.blue[500].alpha(0.12)} />`;
const CLEAN_GRADIENT = `<Box backgroundImage={gradient.symphony} />`;
const CLEAN_IMPORT = `import { palette, color } from '@symphony/shared/tokens'`;
const CLEAN_COMMENT_HEX = `// Use #5B8FF9 for the brand color`;
const CLEAN_JSDOC_HEX = ` * @example bg="#5B8FF9" — do not use raw strings`;

// ─── Suppression ─────────────────────────────────────────────────────────────

const SUPPRESSED_HEX = `// ---------- @symphony-ignore-start
<Box bg="#5B8FF9" />
// ---------- @symphony-ignore-end`;

const SUPPRESSED_RGBA = `// ---------- @symphony-ignore-start
style={{ color: "rgba(0,0,0,0.5)" }}
// ---------- @symphony-ignore-end`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("checkRawColors", () => {
	// ── Hex violations ────────────────────────────────────────────────────────

	test("detects raw hex in bg prop", () => {
		const violations = checkRawColors(HEX_PROP, CAPABILITY_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].message).toContain("Raw hex color");
	});

	test("detects raw hex in style object", () => {
		const violations = checkRawColors(HEX_STYLE_OBJ, CAPABILITY_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].message).toContain("Raw hex color");
	});

	test("detects raw hex in template literal", () => {
		const violations = checkRawColors(HEX_TEMPLATE, CAPABILITY_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].message).toContain("Raw hex color");
	});

	// ── rgba / rgb violations ─────────────────────────────────────────────────

	test("detects rgba() in prop", () => {
		const violations = checkRawColors(RGBA_PROP, CAPABILITY_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].message).toContain("rgba/rgb");
	});

	test("detects rgba() in style object", () => {
		const violations = checkRawColors(RGBA_STYLE, CAPABILITY_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].message).toContain("rgba/rgb");
	});

	test("detects rgb() in prop", () => {
		const violations = checkRawColors(RGB_PROP, CAPABILITY_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].message).toContain("rgba/rgb");
	});

	// ── hsl violations ────────────────────────────────────────────────────────

	test("detects hsl() in prop", () => {
		const violations = checkRawColors(HSL_PROP, CAPABILITY_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].message).toContain("hsl/hsla");
	});

	test("detects hsla() in prop", () => {
		const violations = checkRawColors(HSLA_PROP, CAPABILITY_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].message).toContain("hsl/hsla");
	});

	// ── oklch inline violation ────────────────────────────────────────────────

	test("detects inline oklch() string in component", () => {
		const violations = checkRawColors(OKLCH_INLINE, CAPABILITY_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].message).toContain("oklch()");
	});

	// ── gradient violations ───────────────────────────────────────────────────

	test("detects raw hex inside linear-gradient string", () => {
		// The hex pattern fires first — message says "Raw hex color" but the
		// violation is still caught. The gradient-specific pattern catches cases
		// where the gradient wrapper is present but the inner color isn't hex.
		const violations = checkRawColors(LINEAR_HEX, CAPABILITY_PATH);
		expect(violations.length).toBeGreaterThan(0);
		// Either the hex or gradient rule fires — both are correct
		expect(violations.some(v => v.message.includes("hex") || v.message.includes("gradient"))).toBe(true);
	});

	test("detects rgba inside radial-gradient string", () => {
		// The rgba pattern fires first on the rgba() inside the gradient string
		const violations = checkRawColors(RADIAL_RGBA, CAPABILITY_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations.some(v => v.message.includes("rgba") || v.message.includes("gradient"))).toBe(true);
	});

	// ── Fix hints ─────────────────────────────────────────────────────────────

	test("provides a fix hint for hex violations", () => {
		const violations = checkRawColors(HEX_PROP, CAPABILITY_PATH);
		expect(violations[0].fix).toBeTruthy();
		expect(violations[0].fix).toContain("@symphony/shared/tokens");
	});

	test("provides a fix hint for gradient violations", () => {
		const violations = checkRawColors(LINEAR_HEX, CAPABILITY_PATH);
		expect(violations[0].fix).toBeTruthy();
		// Fix points to tokens — either the hex fix or the gradient fix
		expect(violations[0].fix).toContain("@symphony/shared/tokens");
	});

	// ── Clean cases ───────────────────────────────────────────────────────────

	test("passes palette token usage", () => {
		const violations = checkRawColors(CLEAN_PALETTE, CAPABILITY_PATH);
		expect(violations).toHaveLength(0);
	});

	test("passes semantic color token usage", () => {
		const violations = checkRawColors(CLEAN_COLOR, CAPABILITY_PATH);
		expect(violations).toHaveLength(0);
	});

	test("passes .alpha() usage", () => {
		const violations = checkRawColors(CLEAN_ALPHA, CAPABILITY_PATH);
		expect(violations).toHaveLength(0);
	});

	test("passes gradient token usage", () => {
		const violations = checkRawColors(CLEAN_GRADIENT, CAPABILITY_PATH);
		expect(violations).toHaveLength(0);
	});

	test("passes import statements", () => {
		const violations = checkRawColors(CLEAN_IMPORT, CAPABILITY_PATH);
		expect(violations).toHaveLength(0);
	});

	test("passes hex in comment-only lines", () => {
		const violations = checkRawColors(CLEAN_COMMENT_HEX, CAPABILITY_PATH);
		expect(violations).toHaveLength(0);
	});

	test("passes hex in JSDoc lines", () => {
		const violations = checkRawColors(CLEAN_JSDOC_HEX, CAPABILITY_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Scope — allowed paths ─────────────────────────────────────────────────

	test("allows raw values in packages/shared/tokens/ (source of truth)", () => {
		expect(checkRawColors(HEX_PROP, TOKENS_PATH)).toHaveLength(0);
		expect(checkRawColors(RGBA_PROP, PALETTE_PATH)).toHaveLength(0);
		expect(checkRawColors(LINEAR_HEX, GRADIENT_PATH)).toHaveLength(0);
	});

	test("allows rgba in shadow.ts (drop shadows use black rgba intentionally)", () => {
		const violations = checkRawColors(RGBA_STYLE, SHADOW_PATH);
		expect(violations).toHaveLength(0);
	});

	test("allows raw values in toolkit scripts", () => {
		const violations = checkRawColors(HEX_PROP, TOOLKIT_PATH);
		expect(violations).toHaveLength(0);
	});

	test("allows raw values in test files (*.test.ts)", () => {
		const violations = checkRawColors(HEX_PROP, TEST_PATH);
		expect(violations).toHaveLength(0);
	});

	test("allows raw values in spec files (*.spec.tsx)", () => {
		const violations = checkRawColors(HEX_PROP, SPEC_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Scope — flagged paths ─────────────────────────────────────────────────

	test("flags violations in apps/", () => {
		const violations = checkRawColors(HEX_PROP, APP_PATH);
		expect(violations.length).toBeGreaterThan(0);
	});

	test("flags violations in packages/ui/", () => {
		const violations = checkRawColors(HEX_PROP, PACKAGE_PATH);
		expect(violations.length).toBeGreaterThan(0);
	});

	// ── Suppression ───────────────────────────────────────────────────────────

	test("respects @symphony-ignore block for hex", () => {
		const violations = checkRawColors(SUPPRESSED_HEX, CAPABILITY_PATH);
		expect(violations).toHaveLength(0);
	});

	test("respects @symphony-ignore block for rgba", () => {
		const violations = checkRawColors(SUPPRESSED_RGBA, CAPABILITY_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Violation metadata ────────────────────────────────────────────────────

	test("violation includes correct file path", () => {
		const violations = checkRawColors(HEX_PROP, CAPABILITY_PATH);
		expect(violations[0].file).toBe(CAPABILITY_PATH);
	});

	test("violation includes line number", () => {
		const violations = checkRawColors(HEX_PROP, CAPABILITY_PATH);
		expect(violations[0].line).toBe(1);
	});

	test("violation includes the offending source text", () => {
		const violations = checkRawColors(HEX_PROP, CAPABILITY_PATH);
		expect(violations[0].text).toContain("#5B8FF9");
	});

	test("reports correct line number for violation on line 3", () => {
		const src = `import { Box } from '@symphony/ui'\n\nconst s = { bg: "#5B8FF9" }`;
		const violations = checkRawColors(src, CAPABILITY_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].line).toBe(3);
	});
});
