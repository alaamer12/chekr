import { describe, test, expect } from "vitest";
import { checkPseudoSelectorStyles } from "../checks/check-pseudo-selector-styles.js";

const FILE = "packages/ui/forms/Button.tsx";
const CAPABILITY = "capabilities/editing/panels/editor/EditorBlock.tsx";
const PRIMITIVES = "packages/primitives/base/hooks/useInteractionStyles.ts";
const TEST_FILE = "packages/ui/forms/__tests__/Button.test.tsx";

// Step 24 is flipped: Emotion pseudo-selectors are preferred; this check reports no violations.
// useInteractionStyles is prohibited — see check-no-use-interaction-styles (Step 20).

describe("checkPseudoSelectorStyles — flipped step (pseudo-selectors allowed)", () => {
	test("allows &:hover in style object", () => {
		const v = checkPseudoSelectorStyles(`const s = { "&:hover": { opacity: 0.85 } }`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows &:focus-visible in style object", () => {
		const v = checkPseudoSelectorStyles(`const s = { "&:focus-visible": { outline: "2px solid blue" } }`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows &:focus in style object", () => {
		const v = checkPseudoSelectorStyles(`const s = { "&:focus": { boxShadow: "..." } }`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows &:active in style object", () => {
		const v = checkPseudoSelectorStyles(`const s = { "&:active": { transform: "scale(0.97)" } }`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows &:disabled in style object", () => {
		const v = checkPseudoSelectorStyles(`const s = { "&:disabled": { opacity: 0.5 } }`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows &[disabled] in style object", () => {
		const v = checkPseudoSelectorStyles(`const s = { "&[disabled]": { opacity: 0.5 } }`, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows pseudo-selector inside variant() definition", () => {
		const source = `variant({ variants: { ghost: { "&:hover": { bg: color.brand.alpha(0.08) } } } })`;
		const v = checkPseudoSelectorStyles(source, FILE);
		expect(v).toHaveLength(0);
	});

	test("allows pseudo-selector inside styled() call", () => {
		const source = `const S = styled(Box)({ "&:hover": { opacity: 0.85 } })`;
		const v = checkPseudoSelectorStyles(source, CAPABILITY);
		expect(v).toHaveLength(0);
	});

	test("allows pseudo-selectors in capabilities files", () => {
		const v = checkPseudoSelectorStyles(`const s = { "&:hover": { bg: "blue" } }`, CAPABILITY);
		expect(v).toHaveLength(0);
	});

	test("allows multiple pseudo-selectors in one file", () => {
		const source = [
			`const s = { "&:hover": { opacity: 0.85 } }`,
			`const t = { "&:focus-visible": { outline: "2px solid" } }`,
			`const u = { "&:active": { transform: "scale(0.97)" } }`,
		].join("\n");
		const v = checkPseudoSelectorStyles(source, FILE);
		expect(v).toHaveLength(0);
	});
});

describe("checkPseudoSelectorStyles — clean cases", () => {
	test("passes useInteractionStyles usage (enforced by Step 20 instead)", () => {
		const source = `const handlers = useInteractionStyles({ hover: { opacity: 0.85 } })`;
		const v = checkPseudoSelectorStyles(source, FILE);
		expect(v).toHaveLength(0);
	});

	test("passes useInteractionStyles with focusVisible", () => {
		const source = `const handlers = useInteractionStyles({ focusVisible: { outline: "2px solid", outlineColor: color.primary } })`;
		const v = checkPseudoSelectorStyles(source, FILE);
		expect(v).toHaveLength(0);
	});

	test("passes non-interaction pseudo-selectors (e.g. &:first-child)", () => {
		const source = `const s = { "&:first-child": { marginTop: 0 } }`;
		const v = checkPseudoSelectorStyles(source, FILE);
		expect(v).toHaveLength(0);
	});

	test("passes &:placeholder pseudo-selector", () => {
		const source = `const s = { "&::placeholder": { color: "gray" } }`;
		const v = checkPseudoSelectorStyles(source, FILE);
		expect(v).toHaveLength(0);
	});
});

describe("checkPseudoSelectorStyles — scope exclusions", () => {
	test("allows pseudo-selectors in packages/primitives/base/ (defines the system)", () => {
		const v = checkPseudoSelectorStyles(`const s = { "&:hover": { opacity: 0.85 } }`, PRIMITIVES);
		expect(v).toHaveLength(0);
	});

	test("allows pseudo-selectors in test files", () => {
		const v = checkPseudoSelectorStyles(`const s = { "&:hover": { opacity: 0.85 } }`, TEST_FILE);
		expect(v).toHaveLength(0);
	});

	test("allows pseudo-selectors in .md files", () => {
		const v = checkPseudoSelectorStyles(`const s = { "&:hover": { opacity: 0.85 } }`, "docs/INTERACTION.md");
		expect(v).toHaveLength(0);
	});
});

describe("checkPseudoSelectorStyles — suppression", () => {
	test("respects @symphony-ignore block", () => {
		const source = `// ---------- @symphony-ignore-start
const s = { "&:hover": { opacity: 0.85 } }
// ---------- @symphony-ignore-end`;
		const v = checkPseudoSelectorStyles(source, FILE);
		expect(v).toHaveLength(0);
	});
});

describe("checkPseudoSelectorStyles — comment lines", () => {
	test("does not flag pseudo-selectors in comments", () => {
		const v = checkPseudoSelectorStyles(`// "&:hover" — use useInteractionStyles instead`, FILE);
		expect(v).toHaveLength(0);
	});

	test("does not flag pseudo-selectors in JSDoc", () => {
		const v = checkPseudoSelectorStyles(` * "&:focus-visible" example`, FILE);
		expect(v).toHaveLength(0);
	});
});
