import { describe, test, expect } from "vitest";
import { checkBoxAsPrimitive } from "../checks/check-box-as-primitive.js";

const BLOCKIYA_PATH = "capabilities/x/blockiyas/XBlock/index.tsx";
const CAPABILITY_PATH = "capabilities/x/panels/y/index.tsx";
const APP_PATH = "apps/xi-editor/src/App.tsx";

// ── Violations ────────────────────────────────────────────────────────────────
const VIOLATION_INPUT = `<Box as="input" placeholder="Search..." />`;
const VIOLATION_BUTTON = `<Flex as="button" onClick={handler}>Click</Flex>`;
const VIOLATION_TEXTAREA = `<Box as="textarea" rows={4} />`;
const VIOLATION_SELECT = `<Box as="select" />`;
const VIOLATION_LABEL = `<Box as="label" htmlFor="x">Name</Box>`;
const VIOLATION_H1 = `<Box as="h1" color="white">Title</Box>`;
const VIOLATION_H3 = `<Flex as="h3">Subtitle</Flex>`;
const VIOLATION_P = `<Box as="p">paragraph text</Box>`;
const VIOLATION_SPAN = `<Box as="span">inline text</Box>`;
const VIOLATION_CODE = `<Box as="code">snippet</Box>`;
const VIOLATION_PRE = `<Box as="pre">block</Box>`;
const VIOLATION_IMG = `<Box as="img" src="x.png" alt="x" />`;
const VIOLATION_ANCHOR = `<Box as="a" href="/path">link</Box>`;

// ── Allowed — no dedicated Symphony primitive ─────────────────────────────────
const ALLOWED_SECTION = `<Box as="section" p={4}>Content</Box>`;
const ALLOWED_ARTICLE = `<Box as="article">Article</Box>`;
const ALLOWED_MAIN = `<Box as="main">Main</Box>`;
const ALLOWED_NAV = `<Box as="nav">Nav</Box>`;
const ALLOWED_ASIDE = `<Box as="aside">Aside</Box>`;
const ALLOWED_HEADER = `<Box as="header">Header</Box>`;
const ALLOWED_FOOTER = `<Box as="footer">Footer</Box>`;
const ALLOWED_UL = `<Box as="ul">list</Box>`;
const ALLOWED_OL = `<Box as="ol">list</Box>`;
const ALLOWED_LI = `<Box as="li">item</Box>`;

// ── Already correct ───────────────────────────────────────────────────────────
const CLEAN_INPUT = `<Input placeholder="Search..." />`;
const CLEAN_BUTTON = `<Button onClick={handler}>Click</Button>`;
const CLEAN_HEADING = `<Heading>Title</Heading>`;
const CLEAN_TEXT = `<Text>paragraph</Text>`;
const CLEAN_BOX = `<Box p={4} bg="gray.900">Content</Box>`;

// ── Suppression ───────────────────────────────────────────────────────────────
const SUPPRESSED = `// ---------- @symphony-ignore-start
<Box as="input" placeholder="Search..." />
// ---------- @symphony-ignore-end`;

describe("checkBoxAsPrimitive", () => {
	// ── Form element violations ────────────────────────────────────────────────

	test("detects <Box as='input'>", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_INPUT, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Input");
		expect(violations[0].message).toContain("@symphony/ui");
	});

	test("detects <Flex as='button'>", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_BUTTON, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Button");
	});

	test("detects <Box as='textarea'>", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_TEXTAREA, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Textarea");
	});

	test("detects <Box as='select'>", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_SELECT, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Select");
	});

	test("detects <Box as='label'>", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_LABEL, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Label");
	});

	// ── Typography violations ──────────────────────────────────────────────────

	test("detects <Box as='h1'>", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_H1, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Heading");
	});

	test("detects <Flex as='h3'>", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_H3, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Heading");
	});

	test("detects <Box as='p'>", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_P, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Text");
	});

	test("detects <Box as='span'>", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_SPAN, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Text");
	});

	test("detects <Box as='code'>", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_CODE, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Code");
	});

	test("detects <Box as='pre'>", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_PRE, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Code");
	});

	// ── Media violations ───────────────────────────────────────────────────────

	test("detects <Box as='img'>", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_IMG, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Image");
	});

	test("detects <Box as='a'>", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_ANCHOR, BLOCKIYA_PATH);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain('as="a"');
	});

	// ── Violation includes fix suggestion ─────────────────────────────────────

	test("violation includes a fix suggestion", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_INPUT, BLOCKIYA_PATH);
		expect(violations[0].fix).toBeTruthy();
		expect(violations[0].fix).toContain("@symphony/ui");
	});

	test("violation includes file and line number", () => {
		const violations = checkBoxAsPrimitive(VIOLATION_INPUT, BLOCKIYA_PATH);
		expect(violations[0].file).toBe(BLOCKIYA_PATH);
		expect(violations[0].line).toBe(1);
	});

	// ── Allowed semantic HTML (no dedicated primitive) ─────────────────────────

	test("allows <Box as='section'> — no dedicated primitive", () => {
		expect(checkBoxAsPrimitive(ALLOWED_SECTION, BLOCKIYA_PATH)).toHaveLength(0);
	});

	test("allows <Box as='article'>", () => {
		expect(checkBoxAsPrimitive(ALLOWED_ARTICLE, BLOCKIYA_PATH)).toHaveLength(0);
	});

	test("allows <Box as='main'>", () => {
		expect(checkBoxAsPrimitive(ALLOWED_MAIN, BLOCKIYA_PATH)).toHaveLength(0);
	});

	test("allows <Box as='nav'>", () => {
		expect(checkBoxAsPrimitive(ALLOWED_NAV, BLOCKIYA_PATH)).toHaveLength(0);
	});

	test("allows <Box as='aside'>", () => {
		expect(checkBoxAsPrimitive(ALLOWED_ASIDE, BLOCKIYA_PATH)).toHaveLength(0);
	});

	test("allows <Box as='header'>", () => {
		expect(checkBoxAsPrimitive(ALLOWED_HEADER, BLOCKIYA_PATH)).toHaveLength(0);
	});

	test("allows <Box as='footer'>", () => {
		expect(checkBoxAsPrimitive(ALLOWED_FOOTER, BLOCKIYA_PATH)).toHaveLength(0);
	});

	test("allows <Box as='ul'>", () => {
		expect(checkBoxAsPrimitive(ALLOWED_UL, BLOCKIYA_PATH)).toHaveLength(0);
	});

	test("allows <Box as='ol'>", () => {
		expect(checkBoxAsPrimitive(ALLOWED_OL, BLOCKIYA_PATH)).toHaveLength(0);
	});

	test("allows <Box as='li'>", () => {
		expect(checkBoxAsPrimitive(ALLOWED_LI, BLOCKIYA_PATH)).toHaveLength(0);
	});

	// ── Clean cases ────────────────────────────────────────────────────────────

	test("passes <Input /> — already correct", () => {
		expect(checkBoxAsPrimitive(CLEAN_INPUT, BLOCKIYA_PATH)).toHaveLength(0);
	});

	test("passes <Button /> — already correct", () => {
		expect(checkBoxAsPrimitive(CLEAN_BUTTON, BLOCKIYA_PATH)).toHaveLength(0);
	});

	test("passes <Heading /> — already correct", () => {
		expect(checkBoxAsPrimitive(CLEAN_HEADING, BLOCKIYA_PATH)).toHaveLength(0);
	});

	test("passes <Text /> — already correct", () => {
		expect(checkBoxAsPrimitive(CLEAN_TEXT, BLOCKIYA_PATH)).toHaveLength(0);
	});

	test("passes <Box> without as prop", () => {
		expect(checkBoxAsPrimitive(CLEAN_BOX, BLOCKIYA_PATH)).toHaveLength(0);
	});

	// ── Suppression ────────────────────────────────────────────────────────────

	test("respects @symphony-ignore block", () => {
		expect(checkBoxAsPrimitive(SUPPRESSED, BLOCKIYA_PATH)).toHaveLength(0);
	});

	// ── Scope — skipped paths ──────────────────────────────────────────────────

	test("skips packages/ui/ — design system internals", () => {
		expect(checkBoxAsPrimitive(VIOLATION_INPUT, "packages/ui/forms/Input.tsx")).toHaveLength(0);
	});

	test("skips packages/primitives/ — primitive definitions", () => {
		expect(checkBoxAsPrimitive(VIOLATION_INPUT, "packages/primitives/base/Box.tsx")).toHaveLength(0);
	});

	test("skips packages/adapters/ — third-party wrappers", () => {
		expect(
			checkBoxAsPrimitive(VIOLATION_INPUT, "packages/adapters/code-editor/CodeEditorAdapter.tsx")
		).toHaveLength(0);
	});

	test("skips test files", () => {
		expect(checkBoxAsPrimitive(VIOLATION_INPUT, "capabilities/x/__tests__/XBlock.test.tsx")).toHaveLength(0);
	});

	test("skips .spec. files", () => {
		expect(checkBoxAsPrimitive(VIOLATION_INPUT, "capabilities/x/XBlock.spec.tsx")).toHaveLength(0);
	});

	test("skips .md files", () => {
		expect(checkBoxAsPrimitive(`<Box as="input" />`, "docs/guide.md")).toHaveLength(0);
	});

	test("skips pure .ts files (no JSX)", () => {
		expect(checkBoxAsPrimitive(VIOLATION_INPUT, "capabilities/x/hooks/useX.ts")).toHaveLength(0);
	});

	// ── Scope — detected paths ─────────────────────────────────────────────────

	test("detects in capabilities/ panel files", () => {
		expect(checkBoxAsPrimitive(VIOLATION_INPUT, CAPABILITY_PATH)).toHaveLength(1);
	});

	test("detects in apps/", () => {
		expect(checkBoxAsPrimitive(VIOLATION_INPUT, APP_PATH)).toHaveLength(1);
	});

	test("detects in packages/shell/", () => {
		expect(checkBoxAsPrimitive(VIOLATION_INPUT, "packages/shell/header/Header.tsx")).toHaveLength(1);
	});
});
