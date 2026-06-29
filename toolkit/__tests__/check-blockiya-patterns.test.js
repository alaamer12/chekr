import { describe, test, expect } from "vitest";
import { checkBlockiyaPatterns } from "../checks/check-blockiya-patterns.js";

const BLOCKIYA_PATH = "capabilities/x/blockiyas/XBlock/index.tsx";
const NON_BLOCKIYA_PATH = "capabilities/x/hooks/useX.ts";

const SUPPRESSED = src => `// ---------- @symphony-ignore-start
${src}
// ---------- @symphony-ignore-end`;

describe("checkBlockiyaPatterns", () => {
	// ── Structural rendering ───────────────────────────────────────────────────

	test("detects inline conditional {condition && <Component />}", () => {
		const violations = checkBlockiyaPatterns(`{isEditing && <EditView />}`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Inline conditional");
	});

	test("detects ternary in JSX", () => {
		const violations = checkBlockiyaPatterns(`{isEditing ? <EditView /> : <DisplayView />}`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Ternary in JSX");
	});

	test("detects .map() in JSX", () => {
		const violations = checkBlockiyaPatterns(`{items.map((item) => <ItemRow key={item.id} />)}`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain(".map() in JSX");
	});

	// ── UX decisions ──────────────────────────────────────────────────────────

	test("detects window.confirm()", () => {
		const violations = checkBlockiyaPatterns(`if (window.confirm('Sure?')) onDelete()`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("window.confirm()");
	});

	test("detects navigate()", () => {
		const violations = checkBlockiyaPatterns(`navigate('/dashboard')`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("navigate()");
	});

	test("does NOT flag navigateTo() — word boundary respected", () => {
		const violations = checkBlockiyaPatterns(`navigateTo('/dashboard')`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("does NOT flag navigateBack() — word boundary respected", () => {
		const violations = checkBlockiyaPatterns(`navigateBack()`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Logging ───────────────────────────────────────────────────────────────

	test("detects console.log() in blockiya", () => {
		const violations = checkBlockiyaPatterns(`console.log('debug', value)`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("console.log()");
		expect(violations[0].fix).toContain("duck(");
	});

	test("detects console.warn() in blockiya", () => {
		const violations = checkBlockiyaPatterns(`console.warn('something went wrong')`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("console.log()");
	});

	test("detects console.error() in blockiya", () => {
		const violations = checkBlockiyaPatterns(`console.error('error', err)`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
	});

	// ── Raw timers ────────────────────────────────────────────────────────────

	test("detects setTimeout() in blockiya", () => {
		const violations = checkBlockiyaPatterns(`setTimeout(() => doSomething(), 300)`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Raw timer");
	});

	test("detects setInterval() in blockiya", () => {
		const violations = checkBlockiyaPatterns(`setInterval(() => poll(), 1000)`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Raw timer");
	});

	// ── Clean cases ────────────────────────────────────────────────────────────

	test("passes <If> usage", () => {
		const violations = checkBlockiyaPatterns(`<If condition={isEditing}><EditView /></If>`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("passes <For> usage", () => {
		const violations = checkBlockiyaPatterns(
			`<For each={items} keyExtractor={(item) => item.id}>{(item) => <ItemRow item={item} />}</For>`,
			BLOCKIYA_PATH
		);
		expect(violations).toHaveLength(0);
	});

	test("passes duck() usage", () => {
		const violations = checkBlockiyaPatterns(`duck('intent fired', { bufferId })`, BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Suppression ────────────────────────────────────────────────────────────

	test("respects @symphony-ignore block", () => {
		const violations = checkBlockiyaPatterns(SUPPRESSED(`{isEditing && <EditView />}`), BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("respects @symphony-ignore block for console.log", () => {
		const violations = checkBlockiyaPatterns(SUPPRESSED(`console.log('debug')`), BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── Scope ──────────────────────────────────────────────────────────────────

	test("ignores non-blockiya files", () => {
		const violations = checkBlockiyaPatterns(`{isEditing && <EditView />}`, NON_BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	test("ignores non-blockiya files for console.log", () => {
		const violations = checkBlockiyaPatterns(`console.log('debug')`, NON_BLOCKIYA_PATH);
		expect(violations).toHaveLength(0);
	});

	// ── TabManagerBlock scope ──────────────────────────────────────────────────

	test("detects inline conditional in TabManagerBlock", () => {
		const violations = checkBlockiyaPatterns(
			`{isEditing && <EditView />}`,
			"packages/shell/TabManagerBlock/TabManagerBlock.tsx"
		);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Inline conditional");
	});

	test("detects console.log in TabManagerBlock", () => {
		const violations = checkBlockiyaPatterns(
			`console.log('debug', value)`,
			"packages/shell/TabManagerBlock/TabManagerBlock.tsx"
		);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("console.log()");
	});

	test("detects console.log in TabManagerBlock children", () => {
		const violations = checkBlockiyaPatterns(
			`console.log('debug')`,
			"packages/shell/TabManagerBlock/children/TabGroup.tsx"
		);
		expect(violations).toHaveLength(1);
	});

	test("detects .map() in TabManagerBlock", () => {
		const violations = checkBlockiyaPatterns(
			`{items.map((item) => <TabItem key={item.id} />)}`,
			"packages/shell/TabManagerBlock/TabManagerBlock.tsx"
		);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain(".map() in JSX");
	});

	test("passes <For> in TabManagerBlock", () => {
		const violations = checkBlockiyaPatterns(
			`<For each={items} keyExtractor={t => t.id}>{(tab) => <TabItem tab={tab} />}</For>`,
			"packages/shell/TabManagerBlock/TabManagerBlock.tsx"
		);
		expect(violations).toHaveLength(0);
	});

	test("ignores TabManagerBlock hooks — not component files", () => {
		const violations = checkBlockiyaPatterns(
			`console.log('debug')`,
			"packages/shell/TabManagerBlock/hooks/useTabState.ts"
		);
		expect(violations).toHaveLength(0);
	});

	test("ignores TabManagerBlock utils — not component files", () => {
		const violations = checkBlockiyaPatterns(
			`{items.map(item => item.id)}`,
			"packages/shell/TabManagerBlock/utils/tabValidation.ts"
		);
		expect(violations).toHaveLength(0);
	});
});
