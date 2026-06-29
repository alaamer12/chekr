import { describe, test, expect } from "vitest";
import { checkStyledHtmlElement } from "../checks/check-styled-html-element.js";

const APP = "capabilities/x/blockiyas/XBlock/index.tsx";
const PATTERNS = "packages/patterns/interaction/Dropdown.tsx";

describe("checkStyledHtmlElement", () => {
	test("flags styled.div in blockiya", () => {
		const v = checkStyledHtmlElement("const X = styled.div({ padding: 4 })", APP);
		expect(v.length).toBeGreaterThan(0);
	});

	test("allows styled(Box) from ui", () => {
		const v = checkStyledHtmlElement(
			"import { Box } from '@symphony/ui'\nconst X = styled(Box)({ padding: 4 })",
			APP
		);
		expect(v).toHaveLength(0);
	});

	test("allows styled.div in patterns package", () => {
		const v = checkStyledHtmlElement("const X = styled.div({})", PATTERNS);
		expect(v).toHaveLength(0);
	});
});
