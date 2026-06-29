/**
 * App workbench structure analyzer — shared by check-app-workbench.
 *
 * Encodes decisions from:
 *   - .repertoire/v2/features/components/shell/AppWorkbench/spec.md
 *   - .repertoire/v2/features/components/shell/AppLayoutBlock/V2_MIGRATION.md
 *   - apps/xi-editor/SCAFFOLD_PLAN.md
 *
 * One Shell: each React shell app owns exactly ONE workbench root under src/.
 * Valid variants (pick one per app, never both):
 *   - apps/{app}/src/workbench/          (documented canonical in SCAFFOLD_PLAN)
 *   - apps/{app}/src/app/workbench/        (allowed glue-adjacent layout used by xi-editor)
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Apps that do not follow the React One Shell workbench layout. */
export const WORKBENCH_EXEMPT_APPS = new Set(["vue-ui-app", "backend", "convex"]);

/** Relative to apps/{app}/src/ — mutually exclusive workbench roots. */
export const WORKBENCH_ROOT_VARIANTS = [
	{ id: "src-workbench", segment: "workbench" },
	{ id: "app-workbench", segment: "app/workbench" },
];

/**
 * Directories under src/ that indicate legacy Plan-2 drift when a workbench root exists.
 * These must not coexist with a canonical workbench tree.
 */
export const LEGACY_ORPHAN_DIRS = [
	{
		segment: "zones",
		message: "Orphan src/zones/ — workbench zones belong under src/workbench/zones/ or src/app/workbench/zones/",
	},
	{
		segment: "workbench",
		conflictsWith: "app/workbench",
		message: "Legacy src/workbench/ alongside src/app/workbench/ — consolidate to a single workbench root",
	},
];

/** Workbench view-state files that must not be duplicated at src/state/ when app/state exists. */
export const WORKBENCH_STATE_MARKERS = ["editorViewAtom.ts", "editorViewAtom.tsx"];

function dirHasSourceFiles(absDir) {
	if (!existsSync(absDir)) return false;
	try {
		const entries = readdirSync(absDir);
		return entries.some(name => /\.(tsx?|jsx?)$/.test(name));
	} catch {
		return false;
	}
}

function dirExists(absPath) {
	try {
		return existsSync(absPath) && statSync(absPath).isDirectory();
	} catch {
		return false;
	}
}

/**
 * @param {string} appSrcPath - Absolute path to apps/{name}/src
 * @returns {{ active: string | null, variants: string[] }}
 */
export function detectWorkbenchRoots(appSrcPath) {
	const active = [];
	for (const { segment } of WORKBENCH_ROOT_VARIANTS) {
		const abs = join(appSrcPath, ...segment.split("/"));
		if (dirHasSourceFiles(abs) || dirExists(join(abs, "zones")) || dirExists(join(abs, "hooks"))) {
			active.push(segment);
		}
	}
	return {
		variants: active,
		active: active.length === 1 ? active[0] : active.length > 1 ? active.join(" + ") : null,
	};
}

/**
 * @param {string} appRelPath - e.g. apps/xi-editor/src
 * @param {string} appSrcPath - absolute src path
 * @returns {import('../checks/check-app-workbench.js').Violation[]}
 */
export function analyzeAppWorkbenchStructure(appRelPath, appSrcPath) {
	const violations = [];
	const { variants, active } = detectWorkbenchRoots(appSrcPath);

	if (variants.length > 1) {
		violations.push(
			makeStructuralViolation(
				appRelPath,
				`Duplicate workbench roots: ${variants.map(v => `src/${v}/`).join(" and ")}`,
				"Keep exactly one workbench root per app (see AppWorkbench/spec.md §4.1)",
				"Remove the legacy tree; canonical content lives under src/app/workbench/ or src/workbench/"
			)
		);
	}

	if (active) {
		for (const orphan of LEGACY_ORPHAN_DIRS) {
			if (orphan.conflictsWith && variants.includes(orphan.conflictsWith) && variants.includes(orphan.segment)) {
				continue; // covered by duplicate-root violation
			}
			const orphanAbs = join(appSrcPath, orphan.segment);
			if (!dirHasSourceFiles(orphanAbs) && !dirExists(join(orphanAbs, "zones"))) continue;

			// src/zones is always orphan when any workbench root is active
			if (orphan.segment === "zones") {
				violations.push(
					makeStructuralViolation(
						`${appRelPath}/${orphan.segment}`,
						orphan.message,
						"One Shell workbench zones must not live as a sibling of app/ and workbench/",
						`Move zones/ into src/${active}/zones/ and update imports`
					)
				);
				continue;
			}
		}

		// Duplicate view-state at src/state/ when app/state/ or workbench/state/ exists
		const srcState = join(appSrcPath, "state");
		const appState = join(appSrcPath, "app/state");
		const wbState = join(appSrcPath, active, "state");
		const hasCanonicalState =
			dirHasSourceFiles(appState) ||
			dirHasSourceFiles(wbState) ||
			WORKBENCH_STATE_MARKERS.some(m => existsSync(join(appState, m)) || existsSync(join(wbState, m)));

		if (hasCanonicalState && dirHasSourceFiles(srcState)) {
			const hasDuplicateMarker = WORKBENCH_STATE_MARKERS.some(m => existsSync(join(srcState, m)));
			if (hasDuplicateMarker) {
				violations.push(
					makeStructuralViolation(
						`${appRelPath}/state`,
						"Orphan src/state/ duplicates app/state/ or workbench/state/ view atoms",
						"Workbench view state belongs in src/app/state/ or src/{workbench}/state/ — not src/state/",
						"Remove src/state/editorViewAtom.* and import from the canonical app/state path"
					)
				);
			}
		}

		// Active workbench should contain a root composer
		const wbAbs = join(appSrcPath, ...active.split("/"));
		const entries = existsSync(wbAbs) ? readdirSync(wbAbs) : [];
		const hasRootComposer = entries.some(
			name => /Workbench\.(tsx?|jsx?)$/.test(name) || name.endsWith("Workbench.tsx")
		);
		if (!hasRootComposer && dirHasSourceFiles(wbAbs)) {
			violations.push(
				makeStructuralViolation(
					`${appRelPath}/${active}`,
					"Workbench root missing *Workbench.tsx composer",
					"App workbench must expose a root composer mounted in AppLayoutBlock.slot",
					"Add EditorWorkbench.tsx (or {App}Workbench.tsx) at the workbench root"
				)
			);
		}
	}

	return violations;
}

/**
 * @param {string} scanPath - Repo root (relative or absolute)
 * @returns {import('../checks/check-app-workbench.js').Violation[]}
 */
export function analyzeAllAppWorkbenchStructures(scanPath = ".") {
	const violations = [];
	const appsDir = join(scanPath, "apps");
	if (!dirExists(appsDir)) return violations;

	for (const appName of readdirSync(appsDir)) {
		if (WORKBENCH_EXEMPT_APPS.has(appName)) continue;
		const appSrc = join(appsDir, appName, "src");
		if (!dirExists(appSrc)) continue;
		const appRel = `apps/${appName}/src`;
		violations.push(...analyzeAppWorkbenchStructure(appRel, appSrc));
	}

	return violations;
}

function makeStructuralViolation(file, text, message, fix) {
	return { file, line: 1, text, message, fix };
}
