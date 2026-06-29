import { describe, test, expect } from "vitest";
import { analyzeTsconfig, checkTsconfigPathsFile } from "../checks/check-tsconfig-paths.js";

const BAD_CONFIG = {
	extends: "../../packages/config/tsconfig/react-bundler.json",
	compilerOptions: {
		paths: {
			"@/*": ["./src/*"],
			"@symphony/capability-editing": ["../../capabilities/editing/index.ts"],
			"@symphony/ui": ["../../packages/ui/index.ts"],
		},
	},
};

const GOOD_CONFIG = {
	extends: "@symphony/config/tsconfig/react-bundler.json",
	compilerOptions: {
		baseUrl: ".",
		paths: {
			"@/*": ["./src/*"],
		},
	},
};

const MOCK_ONLY_CONFIG = {
	compilerOptions: {
		paths: {
			"@/*": ["./src/*"],
			"@xterm/addon-fit": ["../../__mocks__/@xterm/addon-fit.ts"],
		},
	},
};

describe("analyzeTsconfig", () => {
	test("flags @symphony paths pointing into capabilities/ and packages/", () => {
		const violations = analyzeTsconfig(BAD_CONFIG, "apps/xi-editor/tsconfig.json");
		expect(violations.length).toBeGreaterThanOrEqual(2);
		expect(violations.some(v => v.text.includes("@symphony/capability-editing"))).toBe(true);
		expect(violations.some(v => v.text.includes("@symphony/ui"))).toBe(true);
		expect(violations.some(v => v.message.includes("workspace"))).toBe(true);
	});

	test("passes app-local @/* alias and package extends", () => {
		const violations = analyzeTsconfig(GOOD_CONFIG, "apps/symphony/tsconfig.json");
		expect(violations).toHaveLength(0);
	});

	test("allows non-@symphony mock paths", () => {
		const violations = analyzeTsconfig(MOCK_ONLY_CONFIG, "apps/xi-editor/tsconfig.json");
		expect(violations).toHaveLength(0);
	});

	test("flags relative extends into packages/config", () => {
		const violations = analyzeTsconfig(BAD_CONFIG, "capabilities/editing/tsconfig.json");
		expect(violations.some(v => v.message.includes("extends"))).toBe(true);
	});

	test("does not flag @symphony paths that stay inside the package directory", () => {
		const violations = analyzeTsconfig(
			{
				compilerOptions: {
					paths: {
						"@symphony/local": ["./src/index.ts"],
					},
				},
			},
			"capabilities/editing/tsconfig.json"
		);
		expect(violations).toHaveLength(0);
	});
});

describe("checkTsconfigPathsFile", () => {
	test("ignores tsconfigs outside apps/ and capabilities/", () => {
		const violations = checkTsconfigPathsFile("packages/shared/tsconfig.json", ".");
		expect(violations).toHaveLength(0);
	});
});
