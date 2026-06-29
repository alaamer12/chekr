import { describe, test, expect } from "vitest";
import { checkNoUseInteractionStyles } from "../checks/check-no-use-interaction-styles.js";

const BLOCKIYA = "capabilities/x/blockiyas/X/index.tsx";
const PRIMITIVES = "packages/primitives/base/hooks/useInteractionStyles.ts";

describe("checkNoUseInteractionStyles", () => {
	test("detects useInteractionStyles call", () => {
		const src = `const h = useInteractionStyles({ hover: { opacity: 0.8 } })`;
		const v = checkNoUseInteractionStyles(src, BLOCKIYA);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("prohibited");
	});

	test("detects import from primitives/base", () => {
		const src = `import { useInteractionStyles } from '@symphony/primitives/base'`;
		expect(checkNoUseInteractionStyles(src, BLOCKIYA).length).toBeGreaterThan(0);
	});

	test("allows hook definition in primitives", () => {
		const src = `export function useInteractionStyles(config) { return {} }`;
		expect(checkNoUseInteractionStyles(src, PRIMITIVES)).toHaveLength(0);
	});

	test("allows pseudo-selector style objects", () => {
		const src = `const s = { "&:hover": { opacity: 0.85 } }`;
		expect(checkNoUseInteractionStyles(src, BLOCKIYA)).toHaveLength(0);
	});
});
