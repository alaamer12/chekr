import { describe, test, expect } from "vitest";
import { checkStorybookTitles } from "../checks/check-storybook-titles.js";

const STORY_PATH = "capabilities/x/stories/Terminal.stories.tsx";

// ── Valid meta objects ─────────────────────────────────────────────────────────
const CLEAN_META = `const meta = { title: 'Panels/Terminal' } satisfies Meta<typeof Terminal>`;
const CLEAN_PANELS = `const meta = {\n  title: 'Panels/WelcomeBlock',\n  component: WelcomeBlock,\n}`;
const CLEAN_SHELL = `const meta = { title: 'Shell/AppLayoutBlock' }`;
const CLEAN_PRIMITIVES = `const meta = { title: 'Primitives/Button' }`;

// ── Violations ────────────────────────────────────────────────────────────────
const VIOLATION_DEPTH = `const meta = { title: 'Panels/Terminal/Settings' }`;
const VIOLATION_CATEGORY = `const meta = { title: 'Components/Button' }`;

// ── REGRESSION: data object title: fields were false-positived ────────────────
// Bug: pattern /title:\s*['"]([^'"]+)['"]/ matched ANY title: property,
// including { id: "c-1", title: "Open a folder", ... } in story data arrays.
// Fix: only match title: inside the meta object, not inside array literals.
const STORY_WITH_DATA_TITLES = `
const meta = {
  title: 'Panels/WelcomeBlock',
  component: WelcomeBlock,
} satisfies Meta<typeof WelcomeBlock>;

const checklistItems = [
  { id: "c-1", title: "Open a folder", description: "Start by opening a project", completed: true },
  { id: "c-2", title: "Explore your files", description: "Browse the file tree", completed: false },
];

const whatsNewItems = [
  { id: "w-1", title: "Harmony Board v2.0", description: "Visual workflow redesign" },
  { id: "w-2", title: "Conductor RL", description: "Adaptive orchestration" },
];
`;

const SUPPRESSED = `// ---------- @symphony-ignore-start
const meta = { title: 'Components/Button' }
// ---------- @symphony-ignore-end`;

describe("checkStorybookTitles", () => {
	// ── Valid titles ───────────────────────────────────────────────────────────

	test("passes Panels/ComponentName", () => {
		const violations = checkStorybookTitles(CLEAN_PANELS, STORY_PATH);
		expect(violations).toHaveLength(0);
	});

	test("passes Shell/ComponentName", () => {
		const violations = checkStorybookTitles(CLEAN_SHELL, STORY_PATH);
		expect(violations).toHaveLength(0);
	});

	test("passes Primitives/ComponentName", () => {
		const violations = checkStorybookTitles(CLEAN_PRIMITIVES, STORY_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Violations ────────────────────────────────────────────────────────────

	test("detects wrong depth (three levels)", () => {
		const violations = checkStorybookTitles(VIOLATION_DEPTH, STORY_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("flat two-level only");
	});

	test("detects invalid category", () => {
		const violations = checkStorybookTitles(VIOLATION_CATEGORY, STORY_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Invalid category");
	});

	// ── REGRESSION: data object title: fields ─────────────────────────────────

	test("REGRESSION: does NOT flag title: inside array data objects", () => {
		// Before the fix, title: "Open a folder" inside checklistItems array
		// was flagged as a story title violation.
		const violations = checkStorybookTitles(STORY_WITH_DATA_TITLES, STORY_PATH);
		expect(violations).toHaveLength(0);
	});

	test("REGRESSION: only flags the meta.title, not data titles", () => {
		// The meta title is valid — only the data titles should be ignored
		const src = `
const meta = {
  title: 'Panels/WelcomeBlock',
};
const items = [
  { title: "Harmony Board v2.0 — Visual Workflow Redesign" },
  { title: "Conductor RL — Adaptive Orchestration" },
];
`;
		const violations = checkStorybookTitles(src, STORY_PATH);
		expect(violations).toHaveLength(0);
	});

	test("REGRESSION: flags invalid meta.title even when data titles exist", () => {
		const src = `
const meta = {
  title: 'Components/Button',
};
const items = [
  { title: "Some data title" },
];
`;
		const violations = checkStorybookTitles(src, STORY_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Invalid category");
	});

	// ── Suppression ────────────────────────────────────────────────────────────

	test("respects @symphony-ignore block", () => {
		const violations = checkStorybookTitles(SUPPRESSED, STORY_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Scope ──────────────────────────────────────────────────────────────────

	test("ignores non-story files", () => {
		const violations = checkStorybookTitles(VIOLATION_CATEGORY, "capabilities/x/index.tsx");
		expect(violations).toHaveLength(0);
	});
});
