import { describe, test, expect } from "vitest";
import { checkBlockiyaIntentNaming } from "../checks/check-blockiya-intent-naming.js";

// ── Path helpers ───────────────────────────────────────────────────────────────
const BLOCKIYA_PATH = "capabilities/x/blockiyas/ActionsPaletteBlock/index.tsx";
const BLOCK_FILE_PATH = "capabilities/x/blockiyas/SomeBlock/SomeBlock.tsx";
const NON_BLOCKIYA_PATH = "capabilities/x/hooks/useX.ts";
const STORIES_PATH = "capabilities/x/stories/SomeBlock.stories.tsx";

// ── Source helpers ─────────────────────────────────────────────────────────────
const makeSource = props => `
export interface ActionsPaletteBlockProps {
${props}
}
export function ActionsPaletteBlock({ isOpen, onClose }: ActionsPaletteBlockProps) {
  return null;
}
`;

const SUPPRESSED = propLine => `
export interface ActionsPaletteBlockProps {
// ---------- @symphony-ignore-start
${propLine}
// ---------- @symphony-ignore-end
}
`;

describe("checkBlockiyaIntentNaming", () => {
	// ── Violation detection ────────────────────────────────────────────────────

	test("detects onClose without Intent suffix", () => {
		const src = makeSource("  onClose: () => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("'onClose'");
		expect(violations[0].message).toContain("ActionsPaletteBlock");
		expect(violations[0].fix).toContain("onCloseIntent");
	});

	test("detects onSave without Intent suffix", () => {
		const src = makeSource("  onSave: (data: User) => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("'onSave'");
		expect(violations[0].fix).toContain("onSaveIntent");
	});

	test("detects onDelete without Intent suffix", () => {
		const src = makeSource("  onDelete: (id: string) => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("'onDelete'");
	});

	test("detects multiple violations in one interface", () => {
		const src = makeSource(`
  onClose: () => void;
  onSave: (data: User) => void;
  onDelete: (id: string) => void;
`);
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(3);
	});

	// ── Correct naming passes ──────────────────────────────────────────────────

	test("passes onCloseIntent — correct naming", () => {
		const src = makeSource("  onCloseIntent: () => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("passes onSaveIntent — correct naming", () => {
		const src = makeSource("  onSaveIntent: (data: User) => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("passes onNavigateIntent — correct naming", () => {
		const src = makeSource("  onNavigateIntent: (target: SearchTarget) => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── React DOM events are exempt ────────────────────────────────────────────

	test("exempts onChange — standard React DOM event", () => {
		const src = makeSource("  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("exempts onClick — standard React DOM event", () => {
		const src = makeSource("  onClick: (e: React.MouseEvent) => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("exempts onBlur — standard React DOM event", () => {
		const src = makeSource("  onBlur: () => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("exempts onKeyDown — standard React DOM event", () => {
		const src = makeSource("  onKeyDown: (e: React.KeyboardEvent) => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("exempts onSubmit — standard React DOM event", () => {
		const src = makeSource("  onSubmit: (e: React.FormEvent) => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Non-callable props are ignored ────────────────────────────────────────

	test("ignores non-callable props (isOpen, title, etc.)", () => {
		const src = makeSource(`
  isOpen: boolean;
  title: string;
  count: number;
  config?: GlobalSearchConfig;
`);
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("ignores children prop", () => {
		const src = makeSource("  children?: React.ReactNode;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Blockiya detection ────────────────────────────────────────────────────

	test("detects Blockiya from blockiyas/ path", () => {
		const src = makeSource("  onClose: () => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
	});

	test("detects Blockiya from Block.tsx filename", () => {
		const src = `
export interface SomeBlockProps {
  onClose: () => void;
}
export function SomeBlock({ onClose }: SomeBlockProps) { return null; }
`;
		const violations = checkBlockiyaIntentNaming(src, BLOCK_FILE_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("SomeBlock");
	});

	test("ignores non-Blockiya files", () => {
		const src = makeSource("  onClose: () => void;");
		const violations = checkBlockiyaIntentNaming(src, NON_BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("ignores stories files", () => {
		const src = makeSource("  onClose: () => void;");
		const violations = checkBlockiyaIntentNaming(src, STORIES_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Suppression ────────────────────────────────────────────────────────────

	test("respects @symphony-ignore block", () => {
		const src = SUPPRESSED("  onClose: () => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Violation message quality ──────────────────────────────────────────────

	test("violation message includes Blockiya rules bullets", () => {
		const src = makeSource("  onClose: () => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations[0].message).toContain("Blockiya rules:");
		expect(violations[0].message).toContain("Intent");
		expect(violations[0].message).toContain(".repertoire/v2/docs/Blockiya/");
	});

	test("violation message includes fix suggestion", () => {
		const src = makeSource("  onClose: () => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations[0].fix).toContain("onCloseIntent");
	});

	// ── Optional callable props ────────────────────────────────────────────────

	test("detects optional callable prop without Intent suffix", () => {
		const src = makeSource("  onSearch?: (query: string) => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("'onSearch'");
	});

	test("passes optional callable prop with Intent suffix", () => {
		const src = makeSource("  onSearchIntent?: (query: string) => void;");
		const violations = checkBlockiyaIntentNaming(src, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Real-world case: ActionsPaletteBlock ───────────────────────────────────

	test("REAL: detects onClose violation in ActionsPaletteBlock", () => {
		const src = `
export interface ActionsPaletteBlockProps {
  isOpen: boolean
  onClose: () => void
  initialQuery?: string
}
export function ActionsPaletteBlock({ isOpen, onClose }: ActionsPaletteBlockProps) {
  return null;
}
`;
		const violations = checkBlockiyaIntentNaming(
			src,
			"capabilities/configuration/overlays/actions-palette/blockiyas/ActionsPaletteBlock/index.tsx"
		);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("'onClose'");
		expect(violations[0].message).toContain("ActionsPaletteBlock");
		expect(violations[0].fix).toContain("onCloseIntent");
	});
});
