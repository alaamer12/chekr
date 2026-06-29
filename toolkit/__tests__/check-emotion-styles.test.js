import { describe, test, expect } from "vitest";
import { checkEmotionStyles } from "../checks/check-emotion-styles.js";

const VIOLATION_CSS = `import './styles.css'`;
const VIOLATION_STYLED = `import styled from 'styled-components'`;
const CLEAN = `import { Box } from '@symphony/ui'`;
const SUPPRESSED = `// ---------- @symphony-ignore-start
import './styles.css'
// ---------- @symphony-ignore-end`;

describe("checkEmotionStyles", () => {
	test("detects raw CSS import", () => {
		const violations = checkEmotionStyles(VIOLATION_CSS, "capabilities/x/panels/y/index.tsx");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Raw CSS import");
	});

	test("detects styled-components import", () => {
		const violations = checkEmotionStyles(VIOLATION_STYLED, "capabilities/x/panels/y/index.tsx");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("styled-components import");
	});

	test("passes clean import", () => {
		const violations = checkEmotionStyles(CLEAN, "capabilities/x/panels/y/index.tsx");
		expect(violations).toHaveLength(0);
	});

	test("respects @symphony-ignore block", () => {
		const violations = checkEmotionStyles(SUPPRESSED, "capabilities/x/panels/y/index.tsx");
		expect(violations).toHaveLength(0);
	});

	test("allows CSS in packages/ui", () => {
		const violations = checkEmotionStyles(VIOLATION_CSS, "packages/ui/components/Button.tsx");
		expect(violations).toHaveLength(0);
	});

	test("allows CSS in primitives", () => {
		const violations = checkEmotionStyles(VIOLATION_CSS, "packages/primitives/base/Box.tsx");
		expect(violations).toHaveLength(0);
	});
});
