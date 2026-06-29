import { describe, test, expect } from "vitest";
import { checkInlineInteractionStyles } from "../checks/check-inline-interaction-styles.js";

const BLOCKIYA_PATH = "capabilities/x/blockiyas/XBlock/index.tsx";
const CAPABILITY_PATH = "capabilities/x/panels/y/index.tsx";
const APP_PATH = "apps/xi-editor/src/App.tsx";
const PRIMITIVES_PATH = "packages/primitives/base/hooks/useInteractionStyles.ts";

// ── Violations (flipped rule: useInteractionStyles prohibited) ────────────────
const VIOLATION_IMPORT = `import { useInteractionStyles } from '@symphony/primitives/base'`;
const VIOLATION_CALL = `const handlers = useInteractionStyles({ hover: { opacity: 0.8 } })`;
const VIOLATION_SPREAD = `<Box {...useInteractionStyles({ active: { transform: "scale(0.97)" } })} />`;

// ── Clean cases ───────────────────────────────────────────────────────────────
const CLEAN_EMOTION_HOVER = `const Row = styled(Box)\`&:hover { background: \${color.surfaceHover}; }\``;
const CLEAN_MOUSE_STATE = `onMouseEnter={() => setHovered(true)}`;
const CLEAN_FOCUS_INTENT = `onFocus={() => focusInput.fire()}`;
const CLEAN_INLINE_HANDLER = `onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}`;

// ── Suppression ───────────────────────────────────────────────────────────────
const SUPPRESSED = `// ---------- @symphony-ignore-start
const handlers = useInteractionStyles({ hover: { opacity: 0.8 } })
// ---------- @symphony-ignore-end`;

describe("checkInlineInteractionStyles (alias: checkNoUseInteractionStyles)", () => {
	test("flags useInteractionStyles import in Blockiya", () => {
		const v = checkInlineInteractionStyles(VIOLATION_IMPORT, BLOCKIYA_PATH);
		expect(v.length).toBeGreaterThan(0);
		expect(v[0].message).toMatch(/prohibited/i);
	});

	test("flags useInteractionStyles call in capability panel", () => {
		const v = checkInlineInteractionStyles(VIOLATION_CALL, CAPABILITY_PATH);
		expect(v.length).toBeGreaterThan(0);
	});

	test("flags inline useInteractionStyles call", () => {
		const v = checkInlineInteractionStyles(VIOLATION_SPREAD, APP_PATH);
		expect(v.length).toBeGreaterThan(0);
	});

	test("allows useInteractionStyles inside primitives/base", () => {
		const v = checkInlineInteractionStyles(VIOLATION_CALL, PRIMITIVES_PATH);
		expect(v).toHaveLength(0);
	});

	test("allows Emotion pseudo-selector styled components", () => {
		const v = checkInlineInteractionStyles(CLEAN_EMOTION_HOVER, BLOCKIYA_PATH);
		expect(v).toHaveLength(0);
	});

	test("allows state-only mouse handlers", () => {
		const v = checkInlineInteractionStyles(CLEAN_MOUSE_STATE, BLOCKIYA_PATH);
		expect(v).toHaveLength(0);
	});

	test("allows focus intent handlers", () => {
		const v = checkInlineInteractionStyles(CLEAN_FOCUS_INTENT, BLOCKIYA_PATH);
		expect(v).toHaveLength(0);
	});

	test("allows legacy inline style mouse handlers (not flagged by this check)", () => {
		const v = checkInlineInteractionStyles(CLEAN_INLINE_HANDLER, BLOCKIYA_PATH);
		expect(v).toHaveLength(0);
	});

	test("respects @symphony-ignore blocks", () => {
		const v = checkInlineInteractionStyles(SUPPRESSED, BLOCKIYA_PATH);
		expect(v).toHaveLength(0);
	});
});
