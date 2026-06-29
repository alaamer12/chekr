/**
 * Step 43: check-tsconfig-paths
 *
 * Flags tsconfig.json files in apps/ and capabilities/ that bypass workspace package
 * resolution with manual `compilerOptions.paths` or relative `extends` into packages/config.
 *
 * Violations:
 *   ❌ paths key `@symphony/*` → relative target under ../../capabilities/, ../../packages/, etc.
 *   ❌ extends: "../../packages/config/tsconfig/..." (use @symphony/config/tsconfig/...)
 *
 * Allowed:
 *   ✅ App-local aliases: `@/*` → `./src/*`
 *   ✅ Non-@symphony paths (e.g. test mocks for npm packages)
 *   ✅ extends: "@symphony/config/tsconfig/..."
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { IGNORED_DIRS } from "../utils/constants.js";
import { matchesScope } from "../utils/scope-matcher.js";
import { isMainEntryPoint } from "../utils/path-utils.js";
import { pass, fail } from "../utils/colors.js";
import { printViolations, writeReport } from "../utils/reporter.js";

const SCAN_SCOPE = ["apps/", "capabilities/"];
const TSCONFIG_NAME = "tsconfig.json";

const SKIP_DIRS = new Set([...IGNORED_DIRS, "target", "src-tauri"]);

/** @symphony path alias keys */
const SYMPHONY_PATH_KEY = /^@symphony\//;

/** Relative path into monorepo workspace roots (not app-local ./src) */
const MONOREPO_RELATIVE_TARGET = /^\.\.(\/|\\)(\.\.(\/|\\))*(capabilities|packages)(\/|\\)/;

/** Relative extends into packages/config instead of package import */
const RELATIVE_CONFIG_EXTENDS = /^\.\.(\/|\\)(\.\.(\/|\\))*packages(\/|\\)config(\/|\\)tsconfig(\/|\\)/;

const FIX_PATHS =
	'Remove the `paths` entry, add `"@symphony/<package>": "workspace:*"` to package.json dependencies, and import from the published package name (package `exports`).';

const FIX_EXTENDS =
	'Use `"extends": "@symphony/config/tsconfig/<profile>.json"` and add `"@symphony/config": "workspace:*"` to devDependencies.';

/**
 * @param {string} scanPath
 * @returns {string[]}
 */
function findTsconfigFiles(scanPath) {
	const absRoot = resolve(scanPath);
	const results = [];

	function walk(dir, inScope) {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}

		const relDir = relative(absRoot, dir).replace(/\\/g, "/");
		const dirInScope = inScope || matchesScope(`${relDir}/`, SCAN_SCOPE);

		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name)) continue;
				walk(join(dir, entry.name), dirInScope);
			} else if (entry.isFile() && entry.name === TSCONFIG_NAME && dirInScope) {
				results.push(relative(absRoot, join(dir, entry.name)).replace(/\\/g, "/"));
			}
		}
	}

	for (const scopeRoot of ["apps", "capabilities"]) {
		const rootPath = join(absRoot, scopeRoot);
		if (existsSync(rootPath)) {
			walk(rootPath, true);
		}
	}

	return results;
}

/**
 * @param {unknown} target
 * @returns {boolean}
 */
function isMonorepoRelativeTarget(target) {
	if (typeof target !== "string") return false;
	return MONOREPO_RELATIVE_TARGET.test(target.replace(/\\/g, "/"));
}

/**
 * @param {Record<string, unknown>} config
 * @param {string} filePath
 * @returns {import('../utils/reporter.js').Violation[]}
 */
export function analyzeTsconfig(config, filePath) {
	const normalised = filePath.replace(/\\/g, "/");
	const violations = [];
	const extendsValue = config.extends;
	if (typeof extendsValue === "string" && RELATIVE_CONFIG_EXTENDS.test(extendsValue.replace(/\\/g, "/"))) {
		violations.push({
			file: normalised,
			line: 1,
			text: `"extends": "${extendsValue}"`,
			message:
				"tsconfig extends uses a deep relative path into packages/config — use the @symphony/config package instead.",
			fix: FIX_EXTENDS,
		});
	}

	const paths = config.compilerOptions?.paths;
	if (paths && typeof paths === "object") {
		for (const [alias, targets] of Object.entries(paths)) {
			if (!SYMPHONY_PATH_KEY.test(alias)) continue;

			const targetList = Array.isArray(targets) ? targets : [targets];
			for (const target of targetList) {
				if (!isMonorepoRelativeTarget(target)) continue;

				violations.push({
					file: normalised,
					line: 1,
					text: `"${alias}": ${JSON.stringify(targetList)}`,
					message: `Manual tsconfig path alias for workspace package "${alias}" — use package.json workspace dependencies and package exports instead.`,
					fix: FIX_PATHS,
				});
				break;
			}
		}
	}

	return violations;
}

/**
 * @param {string} filePath
 * @param {string} scanPath
 * @returns {import('../utils/reporter.js').Violation[]}
 */
export function checkTsconfigPathsFile(filePath, scanPath = ".") {
	const normalised = filePath.replace(/\\/g, "/");
	if (!normalised.endsWith(TSCONFIG_NAME)) return [];
	if (!matchesScope(normalised, SCAN_SCOPE)) return [];

	const fullPath = resolve(scanPath, filePath);
	if (!existsSync(fullPath)) return [];

	let config;
	try {
		config = JSON.parse(readFileSync(fullPath, "utf8"));
	} catch {
		// JSONC / Convex-generated configs — skip (TypeScript accepts them; this check is JSON-only).
		return [];
	}

	return analyzeTsconfig(config, normalised);
}

/**
 * Repo-level scan of apps/ and capabilities/ tsconfig.json files.
 *
 * @param {string} [scanPath]
 * @returns {import('../utils/reporter.js').Violation[]}
 */
export function checkTsconfigPathsRepo(scanPath = ".") {
	return findTsconfigFiles(scanPath).flatMap(relPath => checkTsconfigPathsFile(relPath, scanPath));
}

/** Per-file hook for check-all orchestrator (no-op). */
export function checkTsconfigPaths() {
	return [];
}

if (isMainEntryPoint(import.meta.url)) {
	const args = process.argv.slice(2);
	const reportPath = args.find(arg => arg.startsWith("--report="))?.split("=")[1];
	const scanPath = args.find(arg => !arg.startsWith("--")) || ".";

	const violations = checkTsconfigPathsRepo(scanPath);

	if (violations.length === 0) {
		console.log(pass("✅ No tsconfig path alias violations found"));
		process.exit(0);
	}

	console.log(fail(`❌ ${violations.length} tsconfig path alias violations found\n`));
	printViolations(violations);

	if (reportPath) {
		writeReport(reportPath, {
			steps: [{ step: 43, name: "check-tsconfig-paths", status: "fail", violations }],
			timestamp: new Date().toISOString(),
			mode: "single-check",
			passed: false,
			totalViolations: violations.length,
		});
	}

	process.exit(1);
}
