import { describe, test, expect } from "vitest";
import {
	checkReactSrp,
	getSrpConditions,
	analyzeSrpSignals,
	countSplitRelevantSignals,
	countSrpSignals,
} from "../check-react-srp.js";

const FEAT = "capabilities/example/panels/blockiyas/ExampleBlock/children/BigPanel.tsx";

function jsxLine(n) {
	return `      <Box key={${n}}><Text>Item ${n}</Text></Box>`;
}

function buildLargePresentationalComponent(name, lineCount) {
	const jsxLines = Array.from({ length: lineCount - 8 }, (_, i) => jsxLine(i + 1)).join("\n");
	return `
export function ${name}() {
  return (
    <Flex direction="column">
${jsxLines}
    </Flex>
  );
}
`;
}

function buildLargeStatefulComponent(name, lineCount) {
	const logicLines = Array.from(
		{ length: lineCount - 15 },
		(_, i) => `  const value${i} = useMemo(() => compute(${i}), [dep${i}]);`
	).join("\n");
	return `
import { useMemo, useState } from "react";

export function ${name}() {
  const [active, setActive] = useState(0);
${logicLines}
  return (
    <Flex>
      <Button onClick={() => setActive(a => a + 1)}>Next</Button>
      <Text>{active}</Text>
    </Flex>
  );
}
`;
}

/** Two independent reactive scopes — should trigger when LOC + hooks + branch signals align. */
function buildMultiScopeStatefulComponent(name, lineCount) {
	const logicLines = Array.from(
		{ length: lineCount - 22 },
		(_, i) => `  const derived${i} = useMemo(() => compute(${i}), [dep${i}]);`
	).join("\n");
	return `
import { useMemo, useState } from "react";
import { If } from "@symphony/shared/blockiya-core";

export function ${name}() {
  const [auth, setAuth] = useState(null);
  const [chartData, setChartData] = useState([]);
${logicLines}
  return (
    <Flex>
      <If condition={auth !== null}>
        <UserPanel user={auth} />
      </If>
      <If condition={chartData.length > 0}>
        <HeavyChart data={chartData} />
      </If>
    </Flex>
  );
}
`;
}

function buildSearchHeaderLikeComponent() {
	const jsxLines = Array.from({ length: 70 }, (_, i) => jsxLine(i + 1)).join("\n");
	return `
export function SearchHeader({ query, isSearching, hasQuery, onClearIntent, onCancelIntent }) {
  return (
    <Box>
      {/* Input row */}
      <Flex>
        <Input value={query} />
        <If condition={hasQuery && !isSearching}>
          <Button onClick={onClearIntent}>Clear</Button>
        </If>
        <If condition={isSearching}>
          <Button onClick={onCancelIntent}>Cancel</Button>
        </If>
      </Flex>
      {/* Status row */}
      <If condition={hasQuery}>
        <Text>Searching…</Text>
      </If>
${jsxLines}
    </Box>
  );
}
`;
}

function buildOrchestratorComponent() {
	return `
import { useState } from "react";
import { If } from "@symphony/shared/blockiya-core";

export function HarmonyLeftPanelBlock() {
  const [state, setState] = useState("loading");
  const displayState = state;

  return (
    <Flex>
      <If condition={displayState === "error"}>
        <HarmonyPanelError />
      </If>
      <If condition={displayState === "empty"}>
        <HarmonyPanelEmpty />
      </If>
      <If condition={displayState === "ready"}>
        <MelodyListSection />
        <PlayerListSection />
      </If>
    </Flex>
  );
}
`;
}

function buildSectionCommentComponent() {
	return `
export function SectionedPanel() {
  return (
    <Flex>
      {/* Left Column: Navigation */}
      <Box>Nav</Box>
      {/* Right Column: What's New */}
      <Box>News</Box>
    </Flex>
  );
}
`;
}

function buildConditionalBranchesComponent() {
	return `
export function BranchPanel() {
  const useVirtual = items.length > 500;
  return (
    <Box>
      <If condition={useVirtual}>
        <VirtualList items={items} />
      </If>
      <If condition={!useVirtual}>
        <For each={items}>{item => <Row item={item} />}</For>
      </If>
    </Box>
  );
}
`;
}

function buildFilterModalLikeComponent() {
	return `
import { useMemo, useState } from "react";
import { If } from "@symphony/shared/blockiya-core";

export function ExtensionFilterModal() {
  const [draft, setDraft] = useState({});
  const activeCount = useMemo(() => 1, [draft]);
  return (
    <Modal>
      {/* Left Column */}
      <Box />
      {/* Right Column */}
      <Box />
      <If condition={activeCount > 0}>
        <If condition={draft.isPlayer === true}><Chip /></If>
        <If condition={(draft.payment?.length ?? 0) > 0}><Chip /></If>
      </If>
    </Modal>
  );
}
`;
}

describe("check-react-srp", () => {
	test("component under 80 LOC → no violation", () => {
		const source = `
export function SmallCard() {
  return <Box><Text>Hello</Text></Box>;
}
`;
		const v = checkReactSrp(source, FEAT);
		expect(v).toHaveLength(0);
	});

	test("component over 80 LOC with hooks but single scope → suppressed", () => {
		const source = buildLargeStatefulComponent("MelodyListSection", 95);
		const v = checkReactSrp(source, FEAT);
		expect(v).toHaveLength(0);
	});

	test("component with multiple independent scopes + high LOC → violation with helpful message", () => {
		const source = buildMultiScopeStatefulComponent("DashboardPanel", 130);
		const v = checkReactSrp(source, FEAT);
		expect(v.length).toBeGreaterThanOrEqual(1);
		const hit = v.find(x => x.message.includes("DashboardPanel"));
		expect(hit).toBeTruthy();
		expect(hit.message).toMatch(/\d+ LOC/);
		expect(hit.message).toMatch(/L\d+–\d+/);
		expect(hit.message).toContain("react-srp.md");
		expect(hit.message).toContain("independent state scopes");
		expect(hit.fix).toContain("DashboardPanel");
		expect(hit.fix).toContain("react-srp.md");
	});

	test("presentational component with visibility If branches suppressed", () => {
		const v = checkReactSrp(buildSearchHeaderLikeComponent(), FEAT);
		expect(v).toHaveLength(0);
	});

	test("hook orchestrator with state-machine If branches suppressed", () => {
		const v = checkReactSrp(buildOrchestratorComponent(), FEAT);
		expect(v).toHaveLength(0);
	});

	test("stories excluded", () => {
		const source = buildMultiScopeStatefulComponent("StoryBig", 130);
		const v = checkReactSrp(source, "capabilities/example/StoryBig.stories.tsx");
		expect(v).toHaveLength(0);
	});

	test("ignored lines skipped", () => {
		const source = `// @symphony-ignore-start
${buildMultiScopeStatefulComponent("IgnoredBig", 130)}
// @symphony-ignore-end`;
		const v = checkReactSrp(source, FEAT);
		expect(v).toHaveLength(0);
	});

	test("cohesive presentational component without hooks suppressed", () => {
		const padded = buildLargePresentationalComponent("SearchResultItem", 95).replace(
			/export function LayoutGrid/,
			"export function SearchResultItem"
		);
		const v = checkReactSrp(padded, FEAT);
		expect(v).toHaveLength(0);
	});

	test("sectionComments condition exists but disabled by default", () => {
		const conditions = getSrpConditions();
		expect(conditions.sectionComments.enabled).toBe(false);
		const v = checkReactSrp(buildSectionCommentComponent(), FEAT);
		expect(v).toHaveLength(0);
	});

	test("conditionalBranches condition exists but disabled by default", () => {
		const conditions = getSrpConditions();
		expect(conditions.conditionalBranches.enabled).toBe(false);
		const v = checkReactSrp(buildConditionalBranchesComponent(), FEAT);
		expect(v).toHaveLength(0);
	});

	test("unified draft filter modal suppressed", () => {
		const source = buildFilterModalLikeComponent();
		const v = checkReactSrp(source, FEAT);
		expect(v).toHaveLength(0);
		const lines = source.split("\n");
		const body = lines.slice(lines.findIndex(l => l.includes("export function ExtensionFilterModal")));
		const analysis = analyzeSrpSignals(body, 90);
		expect(analysis.ifBranches).toBeLessThan(2);
	});

	test("toolkit, apps glue, and test paths excluded", () => {
		const source = buildMultiScopeStatefulComponent("ToolkitBig", 130);
		expect(checkReactSrp(source, "packages/toolkit/foo.tsx")).toHaveLength(0);
		expect(checkReactSrp(source, "apps/workbench/Main.tsx")).toHaveLength(0);
		expect(checkReactSrp(source, "capabilities/foo/__tests__/Big.test.tsx")).toHaveLength(0);
	});

	// Edge: section comments label layout regions only — not independent reactive scopes.
	test("section-labeled layout over 80 LOC suppressed (HarmonyCanvas-style)", () => {
		const jsxLines = Array.from({ length: 72 }, (_, i) => jsxLine(i + 1)).join("\n");
		const source = `
import { useRef } from "react";
export function HarmonyCanvasBlock() {
  const ref = useRef(null);
  return (
    <Box>
      {/* Canvas Adapter */}
      <CanvasAdapter ref={ref} />
      {/* Toolbar */}
      <Flex><Button>Run</Button></Flex>
${jsxLines}
    </Box>
  );
}
`;
		const v = checkReactSrp(source, FEAT);
		expect(v).toHaveLength(0);
		const body = source.split("\n").slice(3);
		expect(countSplitRelevantSignals(body, 90)).toBeLessThan(2);
	});

	// Edge: density signals (many useEffects / nested ternaries) must not gate LOC alone.
	test("compound orchestrator with search.state machine suppressed", () => {
		const logic = Array.from({ length: 50 }, (_, i) => `  useEffect(() => { step${i}(); }, [dep${i}]);`).join("\n");
		const source = `
import { useEffect, useState } from "react";
import { If } from "@symphony/shared/blockiya-core";
import { SearchHeader } from "./SearchHeader";
import { SearchEmptyState } from "./SearchEmptyState";

export function WorkspaceSearchBlock() {
  const [search, setSearch] = useState({ state: "idle", matchCount: 0, error: null });
  const skeleton = search.state === "typing";
${logic}
  return (
    <Flex>
      <SearchHeader />
      <If condition={skeleton}><SearchEmptyState /></If>
      <If condition={search.state === "error" && search.error !== null && !skeleton}>
        <SearchErrorState />
      </If>
      <If condition={search.state === "success" && search.matchCount === 0 && !skeleton}>
        <SearchEmptyState />
      </If>
    </Flex>
  );
}
`;
		const v = checkReactSrp(source, FEAT);
		expect(v).toHaveLength(0);
		// Many useEffects inflate countSrpSignals but must not satisfy the LOC split gate.
		const body = source.split("\n").slice(source.split("\n").findIndex(l => l.includes("export function")));
		expect(countSplitRelevantSignals(body, body.length)).toBeLessThan(2);
	});

	// Edge: high prop surface + hooks is not a split mandate without independent <If> scopes.
	test("high prop count terminal view suppressed", () => {
		const jsxLines = Array.from({ length: 60 }, (_, i) => jsxLine(i + 1)).join("\n");
		const source = `
export function TerminalView({
  status, isVisible, cols, rows, onReady, onInput, onResize, onRetry, onClose, adapterRef, uiId, isInputActive,
}) {
  const showAdapter = status.type === "ready";
  return (
    <Box>
      <If condition={status.type === "error"}><Text>Error</Text></If>
${jsxLines}
    </Box>
  );
}
`;
		const v = checkReactSrp(source, FEAT);
		expect(v).toHaveLength(0);
	});

	test("SRP_CONDITIONS toggles: only locThreshold enabled for production", () => {
		const conditions = getSrpConditions();
		expect(conditions.locThreshold).toEqual({ enabled: true, maxLines: 80 });
		expect(conditions.sectionComments.enabled).toBe(false);
		expect(conditions.conditionalBranches.enabled).toBe(false);
	});

	test("splitScore vs score: multi-scope true positive has splitScore >= 2", () => {
		const source = buildMultiScopeStatefulComponent("DashboardPanel", 130);
		const body = source.split("\n").slice(source.split("\n").findIndex(l => l.includes("export function")));
		const analysis = analyzeSrpSignals(body, 130);
		expect(analysis.splitScore).toBeGreaterThanOrEqual(2);
		expect(analysis.suppressed).toBe(false);
	});
});
