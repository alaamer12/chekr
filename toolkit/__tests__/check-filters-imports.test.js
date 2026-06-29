import { describe, test, expect } from "vitest";
import { checkFiltersImports } from "../checks/check-filters-imports.js";

// ---------- @symphony-ignore-start
const VIOLATION = `import { all_ } from '@symphony/shared/filters/combinators'`;
// ---------- @symphony-ignore-end
const CLEAN = `import { all_, any_, partition } from '@symphony/shared/filters'`;
const SUPPRESSED = `// ---------- @symphony-ignore-start
import { all_ } from '@symphony/shared/filters/combinators'
// ---------- @symphony-ignore-end`;

describe("checkFiltersImports", () => {
	test("detects sub-path import", () => {
		const violations = checkFiltersImports(VIOLATION, "capabilities/x.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Sub-path import from filters");
	});

	test("passes barrel import", () => {
		const violations = checkFiltersImports(CLEAN, "capabilities/x.ts");
		expect(violations).toHaveLength(0);
	});

	test("respects @symphony-ignore block", () => {
		const violations = checkFiltersImports(SUPPRESSED, "capabilities/x.ts");
		expect(violations).toHaveLength(0);
	});
});
