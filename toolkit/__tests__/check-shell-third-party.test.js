import { describe, test, expect } from "vitest";
import { checkShellThirdParty } from "../checks/check-shell-third-party.js";

const VIOLATION_SRC = `import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'`;
const CLEAN_SRC = `import { AppLayoutBlock } from '@symphony/shell'`;
const SUPPRESSED = `// ---------- @symphony-ignore-start
import { Panel } from 'react-resizable-panels'
// ---------- @symphony-ignore-end`;

describe("checkShellThirdParty", () => {
	// ── Violation cases ────────────────────────────────────────────────────────

	test("detects react-resizable-panels in shell component outside AppLayoutBlock", () => {
		const violations = checkShellThirdParty(VIOLATION_SRC, "packages/shell/components/Layout/AppShellLayout.tsx");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("react-resizable-panels outside its adapter");
		expect(violations[0].fix).toContain("@symphony/adapters/resizable-panels");
	});

	test("detects react-resizable-panels in a capability", () => {
		const violations = checkShellThirdParty(
			VIOLATION_SRC,
			"capabilities/editing/panels/editor/blockiyas/EditorBlock/index.tsx"
		);
		expect(violations).toHaveLength(1);
	});

	test("detects react-resizable-panels in an app", () => {
		const violations = checkShellThirdParty(VIOLATION_SRC, "apps/xi-editor/src/App.tsx");
		expect(violations).toHaveLength(1);
	});

	test("detects react-resizable-panels in a hook file", () => {
		const violations = checkShellThirdParty(VIOLATION_SRC, "packages/shell/hooks/useLayoutState.ts");
		expect(violations).toHaveLength(1);
	});

	test("reports correct file, line, and text", () => {
		const src = `// some comment\n${VIOLATION_SRC}\nexport {}`;
		const violations = checkShellThirdParty(src, "packages/shell/hooks/useLayoutState.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].line).toBe(2);
		expect(violations[0].text).toBe(VIOLATION_SRC.trim());
		expect(violations[0].file).toBe("packages/shell/hooks/useLayoutState.ts");
	});

	// ── Allowed cases ──────────────────────────────────────────────────────────

	test("flags react-resizable-panels in AppLayoutBlock/index.tsx (removed from allowlist)", () => {
		const violations = checkShellThirdParty(VIOLATION_SRC, "packages/shell/AppLayoutBlock/index.tsx");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("react-resizable-panels outside its adapter");
	});

	test("flags react-resizable-panels in AppLayoutBlock/index.tsx (with leading path)", () => {
		const violations = checkShellThirdParty(
			VIOLATION_SRC,
			"F:/Projects/Symphony/packages/shell/AppLayoutBlock/index.tsx"
		);
		expect(violations).toHaveLength(1);
	});

	test("allows react-resizable-panels in packages/adapters/resizable-panels/ (the adapter)", () => {
		const violations = checkShellThirdParty(
			VIOLATION_SRC,
			"packages/adapters/resizable-panels/ResizablePanelAdapter.tsx"
		);
		expect(violations).toHaveLength(0);
	});

	test("allows react-resizable-panels anywhere inside packages/adapters/resizable-panels/", () => {
		const violations = checkShellThirdParty(VIOLATION_SRC, "packages/adapters/resizable-panels/index.ts");
		expect(violations).toHaveLength(0);
	});

	test("passes non-panel imports anywhere", () => {
		const violations = checkShellThirdParty(CLEAN_SRC, "packages/shell/components/Layout/AppShellLayout.tsx");
		expect(violations).toHaveLength(0);
	});

	test("passes symphony/ui imports", () => {
		const violations = checkShellThirdParty(
			`import { Box, Flex } from '@symphony/ui'`,
			"packages/shell/components/Layout/AppShellLayout.tsx"
		);
		expect(violations).toHaveLength(0);
	});

	// ── Suppression ────────────────────────────────────────────────────────────

	test("respects @symphony-ignore block", () => {
		const violations = checkShellThirdParty(SUPPRESSED, "packages/shell/components/Layout/AppShellLayout.tsx");
		expect(violations).toHaveLength(0);
	});

	// ── Multiple violations ────────────────────────────────────────────────────

	test("reports multiple violations in one file", () => {
		const src = [
			`import { Panel } from 'react-resizable-panels'`,
			`import { PanelGroup } from 'react-resizable-panels'`,
		].join("\n");
		const violations = checkShellThirdParty(src, "packages/shell/hooks/useLayoutState.ts");
		expect(violations).toHaveLength(2);
	});
});
