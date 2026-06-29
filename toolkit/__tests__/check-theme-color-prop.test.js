import { describe, test, expect } from "vitest";
import { checkThemeColorProp } from "../checks/check-theme-color-prop.js";

const BLOCKIYA = "capabilities/x/blockiyas/X/index.tsx";

describe("checkThemeColorProp", () => {
	test('detects color="gray.500"', () => {
		const src = `<Text color="gray.500">label</Text>`;
		const v = checkThemeColorProp(src, BLOCKIYA);
		expect(v).toHaveLength(1);
		expect(v[0].fix).toContain("color.");
	});

	test('detects bg="blue.600"', () => {
		const src = `<Box bg="blue.600" />`;
		expect(checkThemeColorProp(src, BLOCKIYA)).toHaveLength(1);
	});

	test("allows color={color.textPrimary}", () => {
		const src = `<Text color={color.textPrimary}>ok</Text>`;
		expect(checkThemeColorProp(src, BLOCKIYA)).toHaveLength(0);
	});
});
