import { describe, test, expect } from "vitest";
import { checkFiltersUsage } from "../checks/check-filters-usage.js";

const VIOLATION_CHAINED = `items.filter(x => x.active).filter(x => x.verified)`;
const VIOLATION_TOLOWER = `items.filter(item => item.name.toLowerCase().includes(query))`;
const CLEAN = `const gate = all_(isActive, isVerified); items.filter(gate)`;
const SUPPRESSED = `// ---------- @symphony-ignore-start
items.filter(x => x.active).filter(x => x.verified)
// ---------- @symphony-ignore-end`;

describe("checkFiltersUsage", () => {
	test("detects chained filters", () => {
		const violations = checkFiltersUsage(VIOLATION_CHAINED, "capabilities/x.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Chained .filter()");
	});

	test("detects toLowerCase in filter", () => {
		const violations = checkFiltersUsage(VIOLATION_TOLOWER, "capabilities/x.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("toLowerCase() in filter");
	});

	test("passes clean usage", () => {
		const violations = checkFiltersUsage(CLEAN, "capabilities/x.ts");
		expect(violations).toHaveLength(0);
	});

	test("respects @symphony-ignore block", () => {
		const violations = checkFiltersUsage(SUPPRESSED, "capabilities/x.ts");
		expect(violations).toHaveLength(0);
	});
});
