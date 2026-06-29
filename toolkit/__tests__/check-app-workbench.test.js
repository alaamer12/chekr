import { describe, test, expect, afterEach } from "vitest";
import { checkAppWorkbench, checkAppWorkbenchStructure } from "../checks/check-app-workbench.js";
import { analyzeAppWorkbenchStructure, detectWorkbenchRoots } from "../utils/app-workbench-analyzer.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const XI_APP = "apps/xi-editor/src/app/App.tsx";
const XI_LAYOUT = "apps/xi-editor/src/app/workbench/EditorLayout.tsx";

describe("check-app-workbench (per-file)", () => {
	test("flags AppLayoutBlock v1 sidebarSlot", () => {
		const source = `<AppLayoutBlock sidebarSlot={<Left />} slot={<W />} />`;
		const v = checkAppWorkbench(source, XI_APP);
		expect(v.some(x => x.message.includes("sidebarSlot"))).toBe(true);
	});

	test("flags AppLayoutBlock v1 bottomPanelSlot", () => {
		const source = `<AppLayoutBlock bottomPanelSlot={<Bottom />} slot={<W />} />`;
		const v = checkAppWorkbench(source, XI_APP);
		expect(v.some(x => x.message.includes("bottomPanelSlot"))).toBe(true);
	});

	test("flags SlotBlock usage", () => {
		const source = `import { SlotBlock } from '@symphony/shell'`;
		const v = checkAppWorkbench(source, XI_APP);
		expect(v.some(x => x.message.includes("SlotBlock"))).toBe(true);
	});

	test("flags homeSlot injection on EditorCenter", () => {
		const source = `export function EditorCenter({ homeSlot }: Props) { return homeSlot; }`;
		const v = checkAppWorkbench(source, "apps/xi-editor/src/app/workbench/zones/EditorCenter.tsx");
		expect(v.some(x => x.message.includes("Slot-injection"))).toBe(true);
	});

	test("allows resizable-panels import under workbench", () => {
		const source = `import { ResizablePanelGroup } from '@symphony/adapters/resizable-panels'`;
		const v = checkAppWorkbench(source, XI_LAYOUT);
		expect(v).toHaveLength(0);
	});

	test("flags resizable-panels import outside workbench", () => {
		const source = `import { ResizablePanelGroup } from '@symphony/adapters/resizable-panels'`;
		const v = checkAppWorkbench(source, "apps/xi-editor/src/app/useEditorChrome.tsx");
		expect(v.some(x => x.message.includes("ResizablePanelAdapter"))).toBe(true);
	});

	test("skips demo pages", () => {
		const source = `<AppLayoutBlock sidebarSlot={<X />} />`;
		const v = checkAppWorkbench(source, "apps/xi-editor/src/pages/EditorPage.tsx");
		expect(v).toHaveLength(0);
	});

	test("skips vue-ui-app", () => {
		const source = `<AppLayoutBlock sidebarSlot={<X />} />`;
		const v = checkAppWorkbench(source, "apps/vue-ui-app/src/App.vue");
		expect(v).toHaveLength(0);
	});
});

describe("app-workbench-analyzer (structural)", () => {
	let tempRoot;

	afterEach(() => {
		if (tempRoot) {
			rmSync(tempRoot, { recursive: true, force: true });
			tempRoot = undefined;
		}
	});

	test("detects single app/workbench root", () => {
		tempRoot = mkdtempSync(join(tmpdir(), "symphony-wb-"));
		const appSrc = join(tempRoot, "apps/xi-editor/src");
		mkdirSync(join(appSrc, "app/workbench/zones"), { recursive: true });
		writeFileSync(join(appSrc, "app/workbench/EditorWorkbench.tsx"), "export {}");

		const roots = detectWorkbenchRoots(appSrc);
		expect(roots.active).toBe("app/workbench");
		expect(roots.variants).toEqual(["app/workbench"]);
	});

	test("flags duplicate workbench roots", () => {
		tempRoot = mkdtempSync(join(tmpdir(), "symphony-wb-"));
		const appSrc = join(tempRoot, "apps/xi-editor/src");
		mkdirSync(join(appSrc, "workbench"), { recursive: true });
		mkdirSync(join(appSrc, "app/workbench"), { recursive: true });
		writeFileSync(join(appSrc, "workbench/EditorWorkbench.tsx"), "export {}");
		writeFileSync(join(appSrc, "app/workbench/EditorWorkbench.tsx"), "export {}");

		const v = analyzeAppWorkbenchStructure("apps/xi-editor/src", appSrc);
		expect(v.some(x => x.text.includes("Duplicate workbench roots"))).toBe(true);
	});

	test("flags orphan src/zones when workbench exists", () => {
		tempRoot = mkdtempSync(join(tmpdir(), "symphony-wb-"));
		const appSrc = join(tempRoot, "apps/xi-editor/src");
		mkdirSync(join(appSrc, "app/workbench"), { recursive: true });
		mkdirSync(join(appSrc, "zones"), { recursive: true });
		writeFileSync(join(appSrc, "app/workbench/EditorWorkbench.tsx"), "export {}");
		writeFileSync(join(appSrc, "zones/EditorCenter.tsx"), "export {}");

		const v = analyzeAppWorkbenchStructure("apps/xi-editor/src", appSrc);
		expect(v.some(x => x.text.includes("zones"))).toBe(true);
	});

	test("flags duplicate editorViewAtom at src/state", () => {
		tempRoot = mkdtempSync(join(tmpdir(), "symphony-wb-"));
		const appSrc = join(tempRoot, "apps/xi-editor/src");
		mkdirSync(join(appSrc, "app/workbench"), { recursive: true });
		mkdirSync(join(appSrc, "app/state"), { recursive: true });
		mkdirSync(join(appSrc, "state"), { recursive: true });
		writeFileSync(join(appSrc, "app/workbench/EditorWorkbench.tsx"), "export {}");
		writeFileSync(join(appSrc, "app/state/editorViewAtom.ts"), "export {}");
		writeFileSync(join(appSrc, "state/editorViewAtom.ts"), "export {}");

		const v = analyzeAppWorkbenchStructure("apps/xi-editor/src", appSrc);
		expect(v.some(x => x.message.includes("src/state/"))).toBe(true);
	});

	test("passes current xi-editor layout (no temp duplicate trees)", () => {
		const v = checkAppWorkbenchStructure(REPO_ROOT);
		const xiViolations = v.filter(x => x.file.includes("apps/xi-editor"));
		expect(xiViolations).toHaveLength(0);
	});
});
