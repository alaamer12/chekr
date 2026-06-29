import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	DUPLICATION_SCORE_THRESHOLD,
	extractComponentsFromSource,
	findHighDuplicationPairs,
	pairsToViolations,
	checkCodeDuplicationRepo,
	compareComponentPair,
	shouldScanFile,
} from "../check-code-duplication.js";

let tempDir;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "symphony-code-dup-"));
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

function write(rel, content) {
	const full = join(tempDir, rel);
	mkdirSync(join(full, ".."), { recursive: true });
	writeFileSync(full, content, "utf8");
	return full.replace(/\\/g, "/");
}

const DUPLICATE_JSX = `
    <Box className="panel-root">
      <Flex direction="column" gap={2}>
        <Text variant="title">Welcome</Text>
        <Button onClick={onClose}>Dismiss</Button>
      </Flex>
    </Box>
`;

function buildComponent(name, jsxBody) {
	return `
export function ${name}() {
  return (
${jsxBody}
  );
}
`;
}

describe("compareComponentPair / score threshold", () => {
	test("identical JSX bodies → score above 75", () => {
		const a = { body: `return (${DUPLICATE_JSX});` };
		const b = { body: `return (${DUPLICATE_JSX});` };
		const { confidence } = compareComponentPair(
			{ ...a, file: "a.tsx", name: "A", startLine: 1, endLine: 10 },
			{ ...b, file: "b.tsx", name: "B", startLine: 1, endLine: 10 }
		);
		expect(confidence).toBeGreaterThan(DUPLICATION_SCORE_THRESHOLD);
	});

	test("clearly different JSX → score at or below 75", () => {
		const a = {
			body: `return (<Box><Text>Alpha</Text></Box>);`,
			file: "a.tsx",
			name: "A",
			startLine: 1,
			endLine: 3,
		};
		const b = {
			body: `return (<Grid columns={4}><Cell key="z">Z</Cell></Grid>);`,
			file: "b.tsx",
			name: "B",
			startLine: 1,
			endLine: 3,
		};
		const { confidence } = compareComponentPair(a, b);
		expect(confidence).toBeLessThanOrEqual(DUPLICATION_SCORE_THRESHOLD);
	});
});

describe("findHighDuplicationPairs", () => {
	test("score above 75 → pair returned", () => {
		const blocks = [
			{
				file: "capabilities/a/PanelA.tsx",
				name: "PanelA",
				startLine: 2,
				endLine: 12,
				body: `return (${DUPLICATE_JSX});`,
			},
			{
				file: "capabilities/b/PanelB.tsx",
				name: "PanelB",
				startLine: 2,
				endLine: 12,
				body: `return (${DUPLICATE_JSX});`,
			},
		];
		const pairs = findHighDuplicationPairs(blocks);
		expect(pairs.length).toBeGreaterThan(0);
		expect(pairs[0].score).toBeGreaterThan(DUPLICATION_SCORE_THRESHOLD);
	});

	test("score below 75 → no pairs", () => {
		const blocks = [
			{
				file: "capabilities/a/A.tsx",
				name: "A",
				startLine: 1,
				endLine: 3,
				body: `return (<Box><Text>One</Text></Box>);`,
			},
			{
				file: "capabilities/b/B.tsx",
				name: "B",
				startLine: 1,
				endLine: 3,
				body: `return (<Grid><Cell>Two</Cell></Grid>);`,
			},
		];
		expect(findHighDuplicationPairs(blocks)).toHaveLength(0);
	});
});

describe("extractComponentsFromSource", () => {
	test("@symphony-ignore block skips component", () => {
		const file = "capabilities/demo/Ignored.tsx";
		const source = `
// @symphony-ignore-start
export function IgnoredCard() {
  return (
${DUPLICATE_JSX}
  );
}
// @symphony-ignore-end
`;
		expect(extractComponentsFromSource(source, file)).toHaveLength(0);
	});

	test("stories file excluded by shouldScanFile", () => {
		expect(shouldScanFile("capabilities/demo/Card.stories.tsx")).toBe(false);
	});

	test("test file excluded by shouldScanFile", () => {
		expect(shouldScanFile("capabilities/demo/Card.test.tsx")).toBe(false);
	});
});

describe("checkCodeDuplicationRepo", () => {
	test("repo scan reports violation when duplication score > 75", () => {
		write("capabilities/dup-a/PanelA.tsx", buildComponent("PanelA", DUPLICATE_JSX));
		write("capabilities/dup-b/PanelB.tsx", buildComponent("PanelB", DUPLICATE_JSX));

		const violations = checkCodeDuplicationRepo(tempDir);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].message).toContain("Duplication score");
		expect(violations[0].message).toMatch(/PanelA|PanelB/);
		expect(violations[0].fix).toMatch(/shared/i);
	});

	test("repo scan passes when components differ", () => {
		write("capabilities/only-a/Alpha.tsx", buildComponent("Alpha", `<Box><Text>Alpha only</Text></Box>`));
		write("capabilities/only-b/Beta.tsx", buildComponent("Beta", `<Grid columns={3}><Cell>Beta</Cell></Grid>`));

		expect(checkCodeDuplicationRepo(tempDir)).toHaveLength(0);
	});

	test("stories not scanned in repo check", () => {
		write("capabilities/story/Card.stories.tsx", buildComponent("StoryCard", DUPLICATE_JSX));
		write("capabilities/real/RealCard.tsx", buildComponent("RealCard", DUPLICATE_JSX));

		const violations = checkCodeDuplicationRepo(tempDir);
		// Only one real component — no cross-file pair
		expect(violations).toHaveLength(0);
	});
});

describe("pairsToViolations", () => {
	test("violation message includes score and line ranges", () => {
		const [v] = pairsToViolations([
			{
				score: 88,
				a: {
					file: "capabilities/x/A.tsx",
					name: "CompA",
					startLine: 5,
					endLine: 20,
					body: "",
				},
				b: {
					file: "capabilities/y/B.tsx",
					name: "CompB",
					startLine: 10,
					endLine: 25,
					body: "",
				},
			},
		]);
		expect(v.message).toContain("88");
		expect(v.message).toContain("L5–20");
		expect(v.message).toContain("L10–25");
	});
});
