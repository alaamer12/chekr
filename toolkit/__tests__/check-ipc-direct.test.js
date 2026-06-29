import { describe, test, expect } from "vitest";
import { checkIpcDirect } from "../checks/check-ipc-direct.js";

const VIOLATION_TAURI = `import { invoke } from '@tauri-apps/api/core'`;
const VIOLATION_EVENT = `import { listen } from '@tauri-apps/api/event'`;
const VIOLATION_TANSTACK = `import { useQuery } from '@tanstack/react-query'`;
const CLEAN = `import { fsReadFile } from '@symphony/core/xi-editor'`;
const SUPPRESSED = `// ---------- @symphony-ignore-start
import { invoke } from '@tauri-apps/api/core'
// ---------- @symphony-ignore-end`;

describe("checkIpcDirect", () => {
	test("detects raw tauri invoke", () => {
		const violations = checkIpcDirect(VIOLATION_TAURI, "capabilities/x.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Raw invoke()");
	});

	test("detects raw tauri event", () => {
		const violations = checkIpcDirect(VIOLATION_EVENT, "capabilities/x.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Raw listen()");
	});

	test("detects direct tanstack import", () => {
		const violations = checkIpcDirect(VIOLATION_TANSTACK, "capabilities/x.ts");
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("Direct TanStack import");
	});

	test("passes clean import", () => {
		const violations = checkIpcDirect(CLEAN, "capabilities/x.ts");
		expect(violations).toHaveLength(0);
	});

	test("respects @symphony-ignore block", () => {
		const violations = checkIpcDirect(SUPPRESSED, "capabilities/x.ts");
		expect(violations).toHaveLength(0);
	});

	test("allows violations in packages/core/", () => {
		const violations = checkIpcDirect(VIOLATION_TAURI, "packages/core/xi-editor/commands/fs.ts");
		expect(violations).toHaveLength(0);
	});
});
