import { describe, test, expect } from "vitest";
import { checkHooksImports } from "../checks/check-hooks-imports.js";

// ---------- @symphony-ignore-start
const VIOLATION_HOOKZ = `import { useDebouncedState } from '@react-hookz/web'`;
const VIOLATION_PRIMITIVES = `import { useThrottledState } from '@symphony/shared/hooks/primitives'`;
// ---------- @symphony-ignore-end
const CLEAN = `import { useDebounceInput } from '@symphony/shared/hooks/composites'`;
const SUPPRESSED = `// ---------- @symphony-ignore-start
import { useDebouncedState } from '@react-hookz/web'
// ---------- @symphony-ignore-end`;

describe("checkHooksImports", () => {
	test("detects direct @react-hookz/web import", () => {
		const violations = checkHooksImports(VIOLATION_HOOKZ, "capabilities/x.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Direct @react-hookz/web import");
	});

	test("detects primitives layer import", () => {
		const violations = checkHooksImports(VIOLATION_PRIMITIVES, "capabilities/x.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Direct primitives layer import");
	});

	test("passes composites import", () => {
		const violations = checkHooksImports(CLEAN, "capabilities/x.ts");
		expect(violations).toHaveLength(0);
	});

	test("respects @symphony-ignore block", () => {
		const violations = checkHooksImports(SUPPRESSED, "capabilities/x.ts");
		expect(violations).toHaveLength(0);
	});

	test("allows violations in primitives layer", () => {
		const violations = checkHooksImports(VIOLATION_HOOKZ, "packages/shared/hooks/primitives/index.ts");
		expect(violations).toHaveLength(0);
	});

	test("allows violations in composites layer", () => {
		const violations = checkHooksImports(
			VIOLATION_PRIMITIVES,
			"packages/shared/hooks/composites/useDebounceInput.ts"
		);
		expect(violations).toHaveLength(0);
	});
});
