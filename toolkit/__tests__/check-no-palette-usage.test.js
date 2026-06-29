import { describe, test, expect } from "vitest";
import { checkNoPaletteUsage } from "../checks/check-no-palette-usage.js";
import { suggestSemanticForPalette } from "../utils/palette-to-semantic-map.js";

const APP = "apps/xi-editor/src/zones/EditorLeft.tsx";
const TOKENS = "packages/shared/tokens/color.ts";

describe("checkNoPaletteUsage", () => {
	test("detects palette.gray[900] in component", () => {
		const src = `bg={palette.gray[900]}`;
		const v = checkNoPaletteUsage(src, APP);
		expect(v.length).toBeGreaterThan(0);
		expect(v[0].message).toContain("palette");
	});

	test("detects palette import from tokens", () => {
		const src = `import { palette, space } from '@symphony/shared/tokens'`;
		const v = checkNoPaletteUsage(src, APP);
		expect(v.some(x => x.message.includes("import palette"))).toBe(true);
	});

	test("allows palette in tokens package", () => {
		const src = `export const color = { brand: palette.blue[500] }`;
		expect(checkNoPaletteUsage(src, TOKENS)).toHaveLength(0);
	});

	test("suggestSemanticForPalette maps gray[900]", () => {
		expect(suggestSemanticForPalette("palette.gray[900]")).toBe("bgBase");
	});
});
