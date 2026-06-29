import { describe, test, expect } from "vitest";
import { checkVariantImport } from "../checks/check-variant-import.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Violations — variant imported directly from styled-system
const VIOLATION_SOLO = `import { variant } from "styled-system";`;
const VIOLATION_SOLO_SINGLE_QUOTE = `import { variant } from 'styled-system';`;
const VIOLATION_MIXED = `import { variant, space, layout } from "styled-system";`;
const VIOLATION_MIXED_SPACED = `import { space, variant, typography } from "styled-system";`;
const VIOLATION_MIXED_TRAILING = `import { space, variant } from "styled-system";`;

// Clean — correct import source
const CLEAN_PRIMITIVES = `import { variant } from "@symphony/primitives/base";`;
const CLEAN_UI = `import { variant } from "@symphony/ui";`;

// Clean — styled-system import without variant (space, layout, etc. are fine)
const CLEAN_NO_VARIANT = `import { space, layout, color } from "styled-system";`;
const CLEAN_SYSTEM_ONLY = `import { system } from "styled-system";`;

// Suppressed — @symphony-ignore block
const SUPPRESSED = `// ---------- @symphony-ignore-start
import { variant } from "styled-system"
// ---------- @symphony-ignore-end`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("checkVariantImport", () => {
	// ── Violation detection ──────────────────────────────────────────────────

	test("detects solo variant import from styled-system (double quotes)", () => {
		const violations = checkVariantImport(VIOLATION_SOLO, "packages/ui/forms/Button.tsx");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("@symphony/primitives/base");
		expect(violations[0].fix).toBe("import { variant } from '@symphony/primitives/base'");
	});

	test("detects solo variant import from styled-system (single quotes)", () => {
		const violations = checkVariantImport(VIOLATION_SOLO_SINGLE_QUOTE, "packages/ui/layout/Box.tsx");
		expect(violations).toHaveLength(1);
		expect(violations[0].line).toBe(1);
	});

	test("detects variant mixed with other imports", () => {
		const violations = checkVariantImport(VIOLATION_MIXED, "packages/ui/typography/Text.tsx");
		expect(violations).toHaveLength(1);
		expect(violations[0].text).toContain("variant, space, layout");
	});

	test("detects variant when it is not the first named import", () => {
		const violations = checkVariantImport(VIOLATION_MIXED_SPACED, "packages/ui/feedback/Badge.tsx");
		expect(violations).toHaveLength(1);
	});

	test("detects variant when it is the last named import", () => {
		const violations = checkVariantImport(VIOLATION_MIXED_TRAILING, "packages/ui/layout/Flex.tsx");
		expect(violations).toHaveLength(1);
	});

	test("reports correct file path", () => {
		const violations = checkVariantImport(VIOLATION_SOLO, "capabilities/editing/panels/editor/Editor.tsx");
		expect(violations[0].file).toBe("capabilities/editing/panels/editor/Editor.tsx");
	});

	test("reports correct line number", () => {
		const source = `import React from "react";\n${VIOLATION_SOLO}\nimport { color } from "@symphony/shared/tokens";`;
		const violations = checkVariantImport(source, "packages/ui/forms/Input.tsx");
		expect(violations).toHaveLength(1);
		expect(violations[0].line).toBe(2);
	});

	// ── Clean cases ──────────────────────────────────────────────────────────

	test("passes correct import from @symphony/primitives/base", () => {
		const violations = checkVariantImport(CLEAN_PRIMITIVES, "packages/ui/forms/Button.tsx");
		expect(violations).toHaveLength(0);
	});

	test("passes correct import from @symphony/ui", () => {
		const violations = checkVariantImport(CLEAN_UI, "capabilities/editing/panels/editor/Editor.tsx");
		expect(violations).toHaveLength(0);
	});

	test("passes styled-system import that does not include variant", () => {
		const violations = checkVariantImport(CLEAN_NO_VARIANT, "packages/ui/layout/Box.tsx");
		expect(violations).toHaveLength(0);
	});

	test("passes styled-system import of system() only", () => {
		const violations = checkVariantImport(CLEAN_SYSTEM_ONLY, "packages/primitives/base/system/index.ts");
		expect(violations).toHaveLength(0);
	});

	// ── Suppression ──────────────────────────────────────────────────────────

	test("respects @symphony-ignore block", () => {
		const violations = checkVariantImport(SUPPRESSED, "packages/ui/forms/Button.tsx");
		expect(violations).toHaveLength(0);
	});

	// ── Scope exclusion ──────────────────────────────────────────────────────

	test("allows variant from styled-system inside the wrapper file itself", () => {
		const violations = checkVariantImport(VIOLATION_SOLO, "packages/primitives/base/utils/variant.ts");
		expect(violations).toHaveLength(0);
	});

	test("allows variant from styled-system inside the wrapper file (Windows path)", () => {
		const violations = checkVariantImport(VIOLATION_SOLO, "packages\\primitives\\base\\utils\\variant.ts");
		expect(violations).toHaveLength(0);
	});

	// ── Multi-violation ──────────────────────────────────────────────────────

	test("detects multiple violations in one file", () => {
		const source = [
			`import { variant } from "styled-system";`,
			`import { space } from "styled-system";`,
			`import { variant } from "styled-system";`,
		].join("\n");
		const violations = checkVariantImport(source, "packages/ui/forms/Select.tsx");
		expect(violations).toHaveLength(2);
		expect(violations[0].line).toBe(1);
		expect(violations[1].line).toBe(3);
	});
});
