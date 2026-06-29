import { describe, test, expect } from "vitest";
import { checkStoryLocation } from "../checks/check-story-location.js";

describe("checkStoryLocation", () => {
	test("detects story not in stories/ folder", () => {
		const violations = checkStoryLocation(
			"",
			"capabilities/x/panels/terminal/blockiyas/TerminalBlock/TerminalBlock.stories.tsx"
		);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("not in stories/ folder");
	});

	test("passes story in stories/ folder", () => {
		const violations = checkStoryLocation("", "capabilities/x/panels/terminal/stories/TerminalBlock.stories.tsx");
		expect(violations).toHaveLength(0);
	});

	test("ignores non-story files", () => {
		const violations = checkStoryLocation("", "capabilities/x/panels/terminal/index.tsx");
		expect(violations).toHaveLength(0);
	});
});
