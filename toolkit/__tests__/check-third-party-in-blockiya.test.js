import { describe, test, expect } from "vitest";
import { checkThirdPartyInBlockiya } from "../checks/check-third-party-in-blockiya.js";

const BLOCKIYA_PATH = "capabilities/editing/panels/editor/blockiyas/EditorBlock/index.tsx";
const NON_BLOCKIYA_PATH = "capabilities/editing/panels/editor/hooks/useEditor.ts";

const SUPPRESSED = src => `// ---------- @symphony-ignore-start
${src}
// ---------- @symphony-ignore-end`;

describe("checkThirdPartyInBlockiya", () => {
	// ── Original libs ──────────────────────────────────────────────────────────

	test("detects @codemirror import in blockiya", () => {
		const violations = checkThirdPartyInBlockiya(`import { EditorView } from '@codemirror/view'`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Third-party library import in Blockiya");
	});

	test("detects @xterm import in blockiya", () => {
		const violations = checkThirdPartyInBlockiya(`import { Terminal } from '@xterm/xterm'`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
	});

	test("detects @radix-ui import in blockiya", () => {
		const violations = checkThirdPartyInBlockiya(`import * as Dialog from '@radix-ui/react-dialog'`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
	});

	// ── Newly added libs ───────────────────────────────────────────────────────

	test("detects react-resizable-panels import in blockiya", () => {
		const violations = checkThirdPartyInBlockiya(
			`import { Panel, PanelGroup } from 'react-resizable-panels'`,
			BLOCKIYA_PATH
		);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Third-party library import in Blockiya");
	});

	test("detects framer-motion import in blockiya", () => {
		const violations = checkThirdPartyInBlockiya(`import { motion } from 'framer-motion'`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
	});

	test("detects react-dnd import in blockiya", () => {
		const violations = checkThirdPartyInBlockiya(`import { useDrag } from 'react-dnd'`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
	});

	test("detects react-beautiful-dnd import in blockiya", () => {
		const violations = checkThirdPartyInBlockiya(
			`import { DragDropContext } from 'react-beautiful-dnd'`,
			BLOCKIYA_PATH
		);
		expect(violations).toHaveLength(1);
	});

	test("detects @tanstack/react-table import in blockiya", () => {
		const violations = checkThirdPartyInBlockiya(
			`import { useReactTable } from '@tanstack/react-table'`,
			BLOCKIYA_PATH
		);
		expect(violations).toHaveLength(1);
	});

	test("detects @tanstack/react-virtual import in blockiya", () => {
		const violations = checkThirdPartyInBlockiya(
			`import { useVirtualizer } from '@tanstack/react-virtual'`,
			BLOCKIYA_PATH
		);
		expect(violations).toHaveLength(1);
	});

	test("detects @tanstack/react-query import in blockiya", () => {
		const violations = checkThirdPartyInBlockiya(`import { useQuery } from '@tanstack/react-query'`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
	});

	// ── Clean cases ────────────────────────────────────────────────────────────

	test("passes adapter import", () => {
		const violations = checkThirdPartyInBlockiya(
			`import { CodeEditorAdapter } from '@symphony/adapters/code-editor'`,
			BLOCKIYA_PATH
		);
		expect(violations).toHaveLength(0);
	});

	test("passes symphony/ui import", () => {
		const violations = checkThirdPartyInBlockiya(`import { Box, Flex } from '@symphony/ui'`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Suppression ────────────────────────────────────────────────────────────

	test("respects @symphony-ignore block", () => {
		const violations = checkThirdPartyInBlockiya(
			SUPPRESSED(`import { EditorView } from '@codemirror/view'`),
			BLOCKIYA_PATH
		);
		expect(violations).toHaveLength(0);
	});

	test("respects @symphony-ignore block for new libs", () => {
		const violations = checkThirdPartyInBlockiya(
			SUPPRESSED(`import { Panel } from 'react-resizable-panels'`),
			BLOCKIYA_PATH
		);
		expect(violations).toHaveLength(0);
	});

	// ── Scope ──────────────────────────────────────────────────────────────────

	test("ignores non-blockiya files", () => {
		const violations = checkThirdPartyInBlockiya(
			`import { EditorView } from '@codemirror/view'`,
			NON_BLOCKIYA_PATH
		);
		expect(violations).toHaveLength(0);
	});

	test("ignores adapter files", () => {
		const violations = checkThirdPartyInBlockiya(
			`import { Panel } from 'react-resizable-panels'`,
			"packages/adapters/layout/ResizablePanelAdapter.tsx"
		);
		expect(violations).toHaveLength(0);
	});

	test("detects third-party import in TabManagerBlock", () => {
		const violations = checkThirdPartyInBlockiya(
			`import { motion } from 'framer-motion'`,
			"packages/shell/TabManagerBlock/TabManagerBlock.tsx"
		);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Third-party library import in Blockiya");
	});

	test("detects react-resizable-panels in TabManagerBlock", () => {
		const violations = checkThirdPartyInBlockiya(
			`import { Panel } from 'react-resizable-panels'`,
			"packages/shell/TabManagerBlock/children/TabGroup.tsx"
		);
		expect(violations).toHaveLength(1);
	});

	test("passes adapter import in TabManagerBlock", () => {
		const violations = checkThirdPartyInBlockiya(
			`import { ResizablePanelGroup } from '@symphony/adapters/resizable-panels'`,
			"packages/shell/TabManagerBlock/TabManagerBlock.tsx"
		);
		expect(violations).toHaveLength(0);
	});
});
