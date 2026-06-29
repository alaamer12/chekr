import { describe, test, expect } from "vitest";
import { checkStoryHtml } from "../checks/check-story-html.js";

const VIOLATION = `<div className="container">`;
const CLEAN = `<Box p={4}>`;
const SUPPRESSED = `// ---------- @symphony-ignore-start
<div className="container">
// ---------- @symphony-ignore-end`;

describe("checkStoryHtml", () => {
	test("detects raw HTML in story", () => {
		const violations = checkStoryHtml(VIOLATION, "capabilities/x/stories/Component.stories.tsx");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Raw HTML in story");
	});

	test("passes primitives usage", () => {
		const violations = checkStoryHtml(CLEAN, "capabilities/x/stories/Component.stories.tsx");
		expect(violations).toHaveLength(0);
	});

	test("respects @symphony-ignore block", () => {
		const violations = checkStoryHtml(SUPPRESSED, "capabilities/x/stories/Component.stories.tsx");
		expect(violations).toHaveLength(0);
	});

	test("ignores non-story files", () => {
		const violations = checkStoryHtml(VIOLATION, "capabilities/x/index.tsx");
		expect(violations).toHaveLength(0);
	});
});
