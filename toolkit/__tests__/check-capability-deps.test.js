import { describe, test, expect } from "vitest";
import { checkCapabilityDeps } from "../checks/check-capability-deps.js";

const VIOLATION_PACKAGE = `import { useSearchFiles } from '@symphony/capability-file-management'`;
const VIOLATION_RELATIVE = `import something from '../../file-management/panels/search'`;
const CLEAN = `import { Box } from '@symphony/ui'`;
const SUPPRESSED = `// ---------- @symphony-ignore-start
import { useSearchFiles } from '@symphony/capability-file-management'
// ---------- @symphony-ignore-end`;

describe("checkCapabilityDeps", () => {
	test("detects cross-capability package import", () => {
		const violations = checkCapabilityDeps(VIOLATION_PACKAGE, "capabilities/editing/panels/editor/index.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Cross-capability import");
	});

	test("detects cross-capability relative import", () => {
		const violations = checkCapabilityDeps(VIOLATION_RELATIVE, "capabilities/editing/panels/editor/index.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("cross-capability import");
	});

	test("passes clean import", () => {
		const violations = checkCapabilityDeps(CLEAN, "capabilities/editing/panels/editor/index.ts");
		expect(violations).toHaveLength(0);
	});

	test("respects @symphony-ignore block", () => {
		const violations = checkCapabilityDeps(SUPPRESSED, "capabilities/editing/panels/editor/index.ts");
		expect(violations).toHaveLength(0);
	});

	test("allows same-capability import", () => {
		const sameCapability = `import { useEditor } from '@symphony/capability-editing'`;
		const violations = checkCapabilityDeps(sameCapability, "capabilities/editing/panels/editor/index.ts");
		expect(violations).toHaveLength(0);
	});

	// ── REGRESSION: internal subfolder imports were false-positived ───────────
	// Bug: pattern extracted first segment after ../../ and compared to capability
	// domain name. "queries" ≠ "welcome-onboarding" → false positive.
	// Fix: internal subfolder names (queries, hooks, utils, etc.) are excluded.

	test("REGRESSION: does NOT flag ../../queries/ as cross-capability", () => {
		const src = `import { useRecentProjects } from '../../queries/useRecentProjects'`;
		const violations = checkCapabilityDeps(
			src,
			"capabilities/welcome-onboarding/panels/welcome/blockiyas/WelcomeBlock/index.tsx"
		);
		expect(violations).toHaveLength(0);
	});

	test("REGRESSION: does NOT flag ../../hooks/ as cross-capability", () => {
		const src = `import { useWelcomeTab } from '../../hooks/useWelcomeTab'`;
		const violations = checkCapabilityDeps(
			src,
			"capabilities/welcome-onboarding/panels/welcome/blockiyas/WelcomeBlock/index.tsx"
		);
		expect(violations).toHaveLength(0);
	});

	test("REGRESSION: does NOT flag ../../utils/ as cross-capability", () => {
		const src = `import { validateDestination } from '../../utils/validation'`;
		const violations = checkCapabilityDeps(
			src,
			"capabilities/welcome-onboarding/panels/welcome/blockiyas/WelcomeBlock/index.tsx"
		);
		expect(violations).toHaveLength(0);
	});

	test("REGRESSION: does NOT flag ../../types as cross-capability", () => {
		const src = `import type { WelcomeBlockProps } from '../../types'`;
		const violations = checkCapabilityDeps(
			src,
			"capabilities/welcome-onboarding/panels/welcome/blockiyas/WelcomeBlock/index.tsx"
		);
		expect(violations).toHaveLength(0);
	});

	test("REGRESSION: does NOT flag ../../components/ as cross-capability", () => {
		const src = `import { SearchInput } from '../../components/SearchInput'`;
		const violations = checkCapabilityDeps(
			src,
			"capabilities/welcome-onboarding/panels/welcome/blockiyas/WelcomeBlock/index.tsx"
		);
		expect(violations).toHaveLength(0);
	});

	test("still flags ../../file-management/ as cross-capability (real violation)", () => {
		const src = `import { useFileTree } from '../../file-management/hooks/useFileTree'`;
		const violations = checkCapabilityDeps(
			src,
			"capabilities/editing/panels/editor/blockiyas/EditorBlock/index.tsx"
		);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("cross-capability import");
	});

	test("still flags ../../ai-orchestration/ as cross-capability (real violation)", () => {
		const src = `import { useHarmony } from '../../ai-orchestration/hooks/useHarmony'`;
		const violations = checkCapabilityDeps(
			src,
			"capabilities/editing/panels/editor/blockiyas/EditorBlock/index.tsx"
		);
		expect(violations).toHaveLength(1);
	});
});
