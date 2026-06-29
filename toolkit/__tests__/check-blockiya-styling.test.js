import { describe, test, expect } from "vitest";
import { checkBlockiyaStyling } from "../checks/check-blockiya-styling.js";

const BLOCKIYA_PATH = "capabilities/x/blockiyas/XBlock/index.tsx";
const NON_BLOCKIYA_PATH = "capabilities/x/hooks/useX.ts";
const TAB_MANAGER_PATH = "packages/shell/TabManagerBlock/TabManagerBlock.tsx";
const TAB_MANAGER_CHILD_PATH = "packages/shell/TabManagerBlock/children/TabGroup.tsx";
const TAB_MANAGER_HOOK_PATH = "packages/shell/TabManagerBlock/hooks/useTabState.ts";

const VIOLATION_CLASSNAME = `<div className="flex gap-4">`;
const VIOLATION_STYLE = `<div style={{ padding: '1rem' }}>`;
const VIOLATION_TAILWIND = `<div className="p-4 bg-blue-500">`;
const CLEAN = `<Box p={4} bg="blue.500">`;
const SUPPRESSED = `// ---------- @symphony-ignore-start
<div className="flex gap-4">
// ---------- @symphony-ignore-end`;

// ── REGRESSION: css={} was not detected before this fix ───────────────────────
// Bug: VIOLATIONS array in check-blockiya-styling.js had no pattern for css={}.
// The Emotion escape hatch was silently passing in all Blockiya files.
// Fix: Added /\bcss\s*=\s*\{/ pattern to VIOLATIONS.
const VIOLATION_CSS_HOVER = `<Box css={{ "&:hover": { background: "red" } }}>`;
const VIOLATION_CSS_AFTER = `<Box css={{ "&::after": { content: '""', height: 2 } }}>`;
const VIOLATION_CSS_BEFORE = `<Box css={{ "&::before": { display: "block" } }}>`;
const SUPPRESSED_CSS = `// ---------- @symphony-ignore-start
<Box css={{ "&::after": { content: '""' } }}>
// ---------- @symphony-ignore-end`;

describe("checkBlockiyaStyling", () => {
	// ── Existing violations ────────────────────────────────────────────────────

	test("detects className in blockiya", () => {
		const violations = checkBlockiyaStyling(VIOLATION_CLASSNAME, BLOCKIYA_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations.some(v => v.message.includes("className="))).toBe(true);
	});

	test("detects style prop in blockiya", () => {
		const violations = checkBlockiyaStyling(VIOLATION_STYLE, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("style= in Blockiya");
	});

	test("detects Tailwind classes in blockiya", () => {
		const violations = checkBlockiyaStyling(VIOLATION_TAILWIND, BLOCKIYA_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations.some(v => v.message.includes("Tailwind"))).toBe(true);
	});

	// ── REGRESSION: css={} detection ──────────────────────────────────────────

	test("REGRESSION: detects css={} with :hover pseudo-class in blockiya", () => {
		// Before the fix, css={} silently passed — Emotion escape hatch was undetected
		const violations = checkBlockiyaStyling(VIOLATION_CSS_HOVER, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("css= in Blockiya");
		expect(violations[0].message).toContain("useInteractionStyles");
	});

	test("REGRESSION: detects css={} with ::after pseudo-element in blockiya", () => {
		const violations = checkBlockiyaStyling(VIOLATION_CSS_AFTER, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("css= in Blockiya");
		// Fix suggestion mentions real DOM element
		expect(violations[0].fix).toContain("<Box>");
	});

	test("REGRESSION: detects css={} with ::before pseudo-element in blockiya", () => {
		const violations = checkBlockiyaStyling(VIOLATION_CSS_BEFORE, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("css= in Blockiya");
	});

	test("REGRESSION: detects css={} in TabManagerBlock component files", () => {
		const violations = checkBlockiyaStyling(VIOLATION_CSS_HOVER, TAB_MANAGER_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("css= in Blockiya");
	});

	test("REGRESSION: detects css={} in TabManagerBlock children", () => {
		const violations = checkBlockiyaStyling(VIOLATION_CSS_AFTER, TAB_MANAGER_CHILD_PATH);
		expect(violations).toHaveLength(1);
	});

	test("REGRESSION: css={} suppressed by @symphony-ignore block", () => {
		// Suppression still works — intentional use (e.g. adapter files) can be suppressed
		const violations = checkBlockiyaStyling(SUPPRESSED_CSS, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("REGRESSION: css={} NOT detected in non-blockiya files", () => {
		// Hooks, utils, queries are not Blockiyas — css={} is allowed there
		const violations = checkBlockiyaStyling(VIOLATION_CSS_HOVER, NON_BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("REGRESSION: css={} NOT detected in TabManagerBlock hooks", () => {
		const violations = checkBlockiyaStyling(VIOLATION_CSS_HOVER, TAB_MANAGER_HOOK_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Clean cases ────────────────────────────────────────────────────────────

	test("passes clean primitives usage", () => {
		const violations = checkBlockiyaStyling(CLEAN, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("passes useInteractionStyles — correct hover pattern", () => {
		const src = `const handlers = useInteractionStyles({ hover: { background: c.bgTertiary } })`;
		const violations = checkBlockiyaStyling(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Suppression ────────────────────────────────────────────────────────────

	test("respects @symphony-ignore block for className", () => {
		const violations = checkBlockiyaStyling(SUPPRESSED, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Scope ──────────────────────────────────────────────────────────────────

	test("ignores non-blockiya files", () => {
		const violations = checkBlockiyaStyling(VIOLATION_CLASSNAME, NON_BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("detects className in TabManagerBlock", () => {
		const violations = checkBlockiyaStyling(VIOLATION_CLASSNAME, TAB_MANAGER_PATH);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations.some(v => v.message.includes("className="))).toBe(true);
	});

	test("detects style prop in TabManagerBlock children", () => {
		const violations = checkBlockiyaStyling(VIOLATION_STYLE, TAB_MANAGER_CHILD_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("style= in Blockiya");
	});

	test("passes clean primitives in TabManagerBlock", () => {
		const violations = checkBlockiyaStyling(CLEAN, TAB_MANAGER_PATH);
		expect(violations).toHaveLength(0);
	});

	test("ignores TabManagerBlock hooks (not component files)", () => {
		const violations = checkBlockiyaStyling(VIOLATION_CLASSNAME, TAB_MANAGER_HOOK_PATH);
		expect(violations).toHaveLength(0);
	});
});
