import { describe, test, expect } from "vitest";
import { checkBoxAsLayout } from "../checks/check-box-as-layout.js";

const APP = "apps/xi-editor/src/App.tsx";

describe("checkBoxAsLayout", () => {
	test("detects Box with display flex", () => {
		const src = `<Box display="flex" flexDirection="column" gap={2}>content</Box>`;
		const v = checkBoxAsLayout(src, APP);
		expect(v.length).toBeGreaterThan(0);
		expect(v[0].message).toContain("Flex");
	});

	test("detects Box with display grid", () => {
		const src = `<Box display="grid" gridTemplateColumns="1fr 1fr" />`;
		const v = checkBoxAsLayout(src, APP);
		expect(v[0].message).toContain("Grid");
	});

	test("detects multiline Box flex layout", () => {
		const src = `<Box
  display="flex"
  alignItems="center"
  gap={space.md}
>
`;
		expect(checkBoxAsLayout(src, APP).length).toBeGreaterThan(0);
	});

	test("allows Flex component", () => {
		const src = `<Flex direction="column" gap={2} />`;
		expect(checkBoxAsLayout(src, APP)).toHaveLength(0);
	});

	test("allows Box without layout props", () => {
		const src = `<Box p={4} bg={color.bgSurface} />`;
		expect(checkBoxAsLayout(src, APP)).toHaveLength(0);
	});
});
