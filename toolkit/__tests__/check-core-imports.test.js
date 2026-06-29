import { describe, test, expect } from "vitest";
import { checkCoreImports } from "../checks/check-core-imports.js";

describe("checkCoreImports", () => {
	test("detects xi-editor importing symphony commands", () => {
		const source = `import { conductorGetStatus } from '@symphony/core/symphony'`;
		const violations = checkCoreImports(source, "apps/xi-editor/src/App.tsx");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("XI-editor app importing Symphony commands");
	});

	test("detects symphony importing xi-editor commands", () => {
		const source = `import { fsReadFile } from '@symphony/core/xi-editor'`;
		const violations = checkCoreImports(source, "apps/symphony/src/App.tsx");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Symphony app importing XI-editor commands");
	});

	test("passes correct imports", () => {
		const xiSource = `import { fsReadFile } from '@symphony/core/xi-editor'`;
		const symphonySource = `import { conductorGetStatus } from '@symphony/core/symphony'`;

		expect(checkCoreImports(xiSource, "apps/xi-editor/src/App.tsx")).toHaveLength(0);
		expect(checkCoreImports(symphonySource, "apps/symphony/src/App.tsx")).toHaveLength(0);
	});

	test("respects @symphony-ignore block", () => {
		const source = `// ---------- @symphony-ignore-start
import { conductorGetStatus } from '@symphony/core/symphony'
// ---------- @symphony-ignore-end`;
		const violations = checkCoreImports(source, "apps/xi-editor/src/App.tsx");
		expect(violations).toHaveLength(0);
	});
});
