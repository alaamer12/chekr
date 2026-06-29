import { describe, test, expect } from "vitest";
import { checkRawHtml } from "../checks/check-raw-html.js";

const VIOLATION = `<div className="container">`;
const CLEAN = `<Box p={4}>`;
const SUPPRESSED = `// ---------- @symphony-ignore-start
<div className="container">
// ---------- @symphony-ignore-end`;

describe("checkRawHtml", () => {
	test("detects raw HTML in capabilities", () => {
		const violations = checkRawHtml(VIOLATION, "capabilities/x/panels/y/index.tsx");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Raw HTML element");
	});

	test("allows raw HTML in packages/ui (design system — intentional)", () => {
		const violations = checkRawHtml(VIOLATION, "packages/ui/components/Button.tsx");
		expect(violations).toHaveLength(0);
	});

	test("passes primitives usage", () => {
		const violations = checkRawHtml(CLEAN, "capabilities/x/panels/y/index.tsx");
		expect(violations).toHaveLength(0);
	});

	test("respects @symphony-ignore block", () => {
		const violations = checkRawHtml(SUPPRESSED, "capabilities/x/panels/y/index.tsx");
		expect(violations).toHaveLength(0);
	});

	test("allows raw HTML in primitives/base", () => {
		const violations = checkRawHtml(VIOLATION, "packages/primitives/base/Box.tsx");
		expect(violations).toHaveLength(0);
	});

	test("allows raw HTML in primitives/compound", () => {
		const violations = checkRawHtml(VIOLATION, "packages/primitives/compound/Modal.tsx");
		expect(violations).toHaveLength(0);
	});
});
