/**
 * Step 39: check-duplicate-interfaces
 *
 * Detects duplicated TypeScript interface / object-type-alias declarations using ts-morph.
 * Repo-level analysis (compare declarations across scoped source files).
 *
 * Tooling: standalone ts-morph Project (skipAddingFilesFromTsConfig, in-memory files).
 * Does NOT use ts-patch or Typia compile transforms — safe to run in CI without `prepare`.
 * Optional: add @swc/core later for faster pre-parse; type comparison remains ts-morph.
 *
 * Reported codes:
 *   EXACT_DUPLICATE       — same name + identical props/types (fully redundant)
 *   SAME_STRUCTURE      — different names, identical props/types (merge candidates)
 *   SAME_NAME_DIFF_TYPES  — same name, same prop names, differing types (dangerous conflict)
 *   SAME_NAME_DIFF_STRUCT — same name, different prop sets (dangerous conflict)
 *
 * Ignored: SUBSET, PARTIAL_OVERLAP, SAME_ATTRS_DIFF_TYPES (high noise / often intentional).
 */

import fs from "node:fs";
import path from "node:path";
import { Project } from "ts-morph";
import { buildIgnoredLines } from "../utils/ignore-handler.js";
import { matchesScope } from "../utils/scope-matcher.js";
import { walkFiles } from "../utils/file-walker.js";
import { printViolations, writeReport } from "../utils/reporter.js";
import { isMainEntryPoint } from "../utils/path-utils.js";
import { pass, fail } from "../utils/colors.js";

const SCOPE = ["capabilities/", "apps/", "packages/"];
const EXTENSIONS = [".ts", ".tsx"];

export const CODE = {
	EXACT_DUPLICATE: "EXACT_DUPLICATE",
	SAME_NAME_DIFF_TYPES: "SAME_NAME_DIFF_TYPES",
	SAME_NAME_DIFF_STRUCT: "SAME_NAME_DIFF_STRUCT",
	SAME_STRUCTURE: "SAME_STRUCTURE",
	SAME_ATTRS_DIFF_TYPES: "SAME_ATTRS_DIFF_TYPES",
	SUBSET: "SUBSET",
	PARTIAL_OVERLAP: "PARTIAL_OVERLAP",
};

/** Codes surfaced as toolkit violations */
const REPORTABLE_CODES = new Set([
	CODE.EXACT_DUPLICATE,
	CODE.SAME_STRUCTURE,
	CODE.SAME_NAME_DIFF_TYPES,
	CODE.SAME_NAME_DIFF_STRUCT,
]);

const SKIP_PATH_SEGMENTS = [
	"/node_modules/",
	"/dist/",
	"/build/",
	"/.turbo/",
	"/coverage/",
	"packages/toolkit/",
	"/__tests__/",
	"/.test.",
	"/.spec.",
];

const IN_SCOPE_RE = /(^|\/)(capabilities|apps|packages)\//;

function shouldScanFile(filePath) {
	const normalised = filePath.replace(/\\/g, "/");
	if (!matchesScope(normalised, SCOPE) && !IN_SCOPE_RE.test(normalised)) return false;
	if (!EXTENSIONS.some(ext => normalised.endsWith(ext))) return false;
	if (normalised.endsWith(".d.ts")) return false;
	if (SKIP_PATH_SEGMENTS.some(seg => normalised.includes(seg))) return false;
	return true;
}

function normalizeType(typeStr) {
	return typeStr.replace(/\s+/g, " ").trim();
}

function propTypeText(prop) {
	const typeNode = prop.getTypeNode?.();
	if (typeNode) return normalizeType(typeNode.getText());
	try {
		return normalizeType(prop.getType().getText(prop));
	} catch {
		return "unknown";
	}
}

function extractProps(node) {
	const props = [];
	try {
		const members = typeof node.getProperties === "function" ? node.getProperties() : [];
		for (const prop of members) {
			props.push({
				name: prop.getName(),
				type: propTypeText(prop),
				optional: prop.hasQuestionToken?.() ?? false,
				readonly: prop.isReadonly?.() ?? false,
			});
		}
	} catch {
		// union / unresolved nodes
	}
	return props;
}

function propNames(props) {
	return new Set(props.map(p => p.name));
}

function propMap(props) {
	return new Map(props.map(p => [p.name, p.type]));
}

function setsEqual(a, b) {
	if (a.size !== b.size) return false;
	for (const v of a) if (!b.has(v)) return false;
	return true;
}

function isSubset(smaller, larger) {
	for (const v of smaller) if (!larger.has(v)) return false;
	return true;
}

function propsSignature(props) {
	return [...props]
		.sort((x, y) => x.name.localeCompare(y.name))
		.map(p => `${p.readonly ? "readonly " : ""}${p.name}${p.optional ? "?" : ""}: ${p.type}`)
		.join("; ");
}

export function compareDeclarations(a, b) {
	const namesA = propNames(a.props);
	const namesB = propNames(b.props);
	const mapA = propMap(a.props);
	const mapB = propMap(b.props);

	const sameName = a.name === b.name;
	const sameAttrNames = setsEqual(namesA, namesB);
	const sharedNames = [...namesA].filter(n => namesB.has(n));
	const sharedTypesMatch = sharedNames.every(n => mapA.get(n) === mapB.get(n));

	if (sameName) {
		if (sameAttrNames && sharedTypesMatch) return CODE.EXACT_DUPLICATE;
		if (sameAttrNames && !sharedTypesMatch) return CODE.SAME_NAME_DIFF_TYPES;
		return CODE.SAME_NAME_DIFF_STRUCT;
	}

	if (sameAttrNames && sharedTypesMatch) return CODE.SAME_STRUCTURE;
	if (sameAttrNames && !sharedTypesMatch) return CODE.SAME_ATTRS_DIFF_TYPES;

	if (namesA.size !== namesB.size) {
		const [smaller, larger] = namesA.size < namesB.size ? [namesA, namesB] : [namesB, namesA];
		if (smaller.size > 0 && isSubset(smaller, larger)) return CODE.SUBSET;
	}

	if (sharedNames.length > 0) return CODE.PARTIAL_OVERLAP;
	return null;
}

function suggestSharedPath(fileA, fileB) {
	const normA = fileA.replace(/\\/g, "/");
	const normB = fileB.replace(/\\/g, "/");

	const capA = normA.match(/capabilities\/([^/]+)/);
	const capB = normB.match(/capabilities\/([^/]+)/);
	if (capA && capB && capA[1] === capB[1]) {
		return `capabilities/${capA[1]}/src/types.ts or capabilities/${capA[1]}/shared/types.ts`;
	}

	if (normA.includes("/blockiyas/") || normB.includes("/blockiyas/")) {
		const blockiyaDir = normA.includes("/blockiyas/")
			? normA.split("/blockiyas/")[0] + "/blockiyas/" + normA.split("/blockiyas/")[1].split("/")[0]
			: normB.split("/blockiyas/")[0] + "/blockiyas/" + normB.split("/blockiyas/")[1].split("/")[0];
		return `${blockiyaDir}/shared/types.ts (colocated with the blockiya)`;
	}

	if (normA.includes("packages/shared/") || normB.includes("packages/shared/")) {
		return "@symphony/shared (packages/shared/)";
	}

	if (normA.includes("apps/") && normB.includes("apps/")) {
		const appA = normA.match(/apps\/([^/]+)/)?.[1];
		const appB = normB.match(/apps\/([^/]+)/)?.[1];
		if (appA && appB && appA === appB) {
			return `apps/${appA}/src/shared/types.ts`;
		}
	}

	return "packages/shared/ or a capability-level types.ts";
}

function buildFix(code, primary, duplicate, sharedPathHint) {
	switch (code) {
		case CODE.EXACT_DUPLICATE:
			return `Extract one canonical \`${primary.name}\` to ${sharedPathHint}, import it in both places, and delete the duplicate declaration.`;
		case CODE.SAME_STRUCTURE:
			return `Merge \`${primary.name}\` and \`${duplicate.name}\` into a single exported type at ${sharedPathHint}; alias with \`export type ${duplicate.name} = ${primary.name}\` only if both names are required.`;
		case CODE.SAME_NAME_DIFF_TYPES:
			return `Rename or reconcile conflicting \`${primary.name}\` declarations — same name with different prop types is unsafe. Prefer distinct names per domain (e.g. \`${primary.name}Dto\` vs \`${primary.name}Model\`).`;
		case CODE.SAME_NAME_DIFF_STRUCT:
			return `Rename one \`${primary.name}\` — same identifier with different shapes will confuse imports. Use domain-specific names.`;
		default:
			return `Consolidate types at ${sharedPathHint}.`;
	}
}

function buildMessage(code, primary, duplicate, sharedPathHint) {
	const relA = primary.filePath;
	const relB = duplicate.filePath;
	const sig = propsSignature(primary.props);

	switch (code) {
		case CODE.EXACT_DUPLICATE:
			return `Duplicate interface \`${primary.name}\` — identical structure in ${relA}:${primary.line} and ${relB}:${duplicate.line} ({ ${sig} }). Extract to ${sharedPathHint} and import instead of copy-pasting.`;
		case CODE.SAME_STRUCTURE:
			return `\`${primary.name}\` and \`${duplicate.name}\` have identical structure ({ ${sig} }) at ${relA}:${primary.line} vs ${relB}:${duplicate.line}. Use one canonical type at ${sharedPathHint}.`;
		case CODE.SAME_NAME_DIFF_TYPES:
			return `\`${primary.name}\` declared twice with same prop names but different types (${relA}:${primary.line} vs ${relB}:${duplicate.line}). Rename one or align types — do not merge blindly.`;
		case CODE.SAME_NAME_DIFF_STRUCT:
			return `\`${primary.name}\` declared with different prop sets (${relA}:${primary.line} vs ${relB}:${duplicate.line}) — likely a naming collision. Rename one interface to reflect its domain.`;
		default:
			return `Related type declarations at ${relA}:${primary.line} and ${relB}:${duplicate.line}.`;
	}
}

function ignoreSuffix(code) {
	if (code === CODE.EXACT_DUPLICATE || code === CODE.SAME_STRUCTURE) {
		return "Only use @symphony-ignore-start/end if both types must stay separate for a documented runtime reason (e.g. intentional parallel API surfaces).";
	}
	return "Do not use @symphony-ignore for same-name conflicts — rename or fix types instead.";
}

/**
 * @param {string} scanPath
 * @param {string[]} [filePaths] optional pre-filtered absolute/relative paths
 * @returns {import('../utils/reporter.js').Violation[]}
 */
function createParseProject() {
	return new Project({
		skipAddingFilesFromTsConfig: true,
		skipFileDependencyResolution: true,
		skipLoadingLibFiles: true,
		compilerOptions: { allowJs: false },
	});
}

export function extractDeclarationsFromFiles(filePaths, scanPath) {
	const declarations = [];
	const resolvedRoot = path.resolve(scanPath);
	const project = createParseProject();

	for (const rel of filePaths) {
		const absolute = path.resolve(scanPath, rel);
		if (!fs.existsSync(absolute)) continue;

		const content = fs.readFileSync(absolute, "utf8");
		const ignored = buildIgnoredLines(content.split("\n"));
		const relPath = path.relative(resolvedRoot, absolute).replace(/\\/g, "/");

		const sourceFile = project.addSourceFileAtPath(absolute);

		const pushDecl = decl => {
			if (ignored.has(decl.line)) return;
			declarations.push({ ...decl, filePath: relPath });
		};

		for (const iface of sourceFile.getInterfaces()) {
			pushDecl({
				kind: "interface",
				name: iface.getName(),
				line: iface.getStartLineNumber(),
				props: extractProps(iface),
			});
		}

		for (const typeAlias of sourceFile.getTypeAliases()) {
			const typeNode = typeAlias.getTypeNode();
			if (!typeNode || typeNode.getKindName() !== "TypeLiteral") continue;
			pushDecl({
				kind: "type",
				name: typeAlias.getName(),
				line: typeAlias.getStartLineNumber(),
				props: extractProps(typeNode),
			});
		}
	}

	return declarations;
}

function structureSignature(props) {
	if (props.length === 0) return "";
	return [...props]
		.sort((x, y) => x.name.localeCompare(y.name))
		.map(p => `${p.name}|${p.type}|${p.optional ? "?" : ""}|${p.readonly ? "r" : ""}`)
		.join(";");
}

function recordPair(results, seenPairs, a, b, code) {
	const pairKey = [a.filePath, a.line, a.name, b.filePath, b.line, b.name].sort().join("|");
	if (seenPairs.has(pairKey)) return;
	seenPairs.add(pairKey);
	const [primary, duplicate] =
		`${a.filePath}:${a.line}`.localeCompare(`${b.filePath}:${b.line}`) <= 0 ? [a, b] : [b, a];
	results.push({ code, primary, duplicate });
}

function compareGroup(results, seenPairs, group) {
	for (let i = 0; i < group.length; i++) {
		for (let j = i + 1; j < group.length; j++) {
			const a = group[i];
			const b = group[j];
			if (a.props.length === 0 && b.props.length === 0) continue;
			const code = compareDeclarations(a, b);
			if (code && REPORTABLE_CODES.has(code)) {
				recordPair(results, seenPairs, a, b, code);
			}
		}
	}
}

/**
 * @param {ReturnType<typeof extractDeclarationsFromFiles>} declarations
 * @returns {{ code: string, primary: object, duplicate: object }[]}
 */
export function findDuplicatePairs(declarations) {
	const results = [];
	const seenPairs = new Set();

	const byStructure = new Map();
	const byName = new Map();

	for (const decl of declarations) {
		if (decl.props.length === 0) continue;
		const sig = structureSignature(decl.props);
		if (!byStructure.has(sig)) byStructure.set(sig, []);
		byStructure.get(sig).push(decl);

		if (!byName.has(decl.name)) byName.set(decl.name, []);
		byName.get(decl.name).push(decl);
	}

	for (const group of byStructure.values()) {
		if (group.length < 2) continue;
		compareGroup(results, seenPairs, group);
	}

	for (const group of byName.values()) {
		if (group.length < 2) continue;
		compareGroup(results, seenPairs, group);
	}

	return results;
}

/** @param {string} scanPath */
export function collectScopedTypeScriptFiles(scanPath = ".") {
	const roots = ["capabilities", "apps", "packages"];
	const files = [];
	for (const root of roots) {
		const dir = path.join(scanPath, root);
		if (!fs.existsSync(dir)) continue;
		files.push(...walkFiles(dir, EXTENSIONS));
	}
	return files.filter(shouldScanFile);
}

/**
 * @param {string} scanPath
 * @returns {import('../utils/reporter.js').Violation[]}
 */
export function pairsToViolations(pairs) {
	const violations = [];
	for (const { code, primary, duplicate } of pairs) {
		const sharedPathHint = suggestSharedPath(primary.filePath, duplicate.filePath);
		const message = `${buildMessage(code, primary, duplicate, sharedPathHint)} ${ignoreSuffix(code)}`;
		const fix = buildFix(code, primary, duplicate, sharedPathHint);
		violations.push({
			file: duplicate.filePath,
			line: duplicate.line,
			text: `${duplicate.kind} ${duplicate.name}`,
			message,
			fix,
		});
	}
	return violations;
}

/**
 * @param {string} [scanPath]
 * @param {string[] | null} [prefilteredFiles] from check-all (already extension + scope filtered)
 */
export function checkDuplicateInterfacesRepo(scanPath = ".", prefilteredFiles = null) {
	const files = prefilteredFiles?.filter(shouldScanFile) ?? collectScopedTypeScriptFiles(scanPath);
	const declarations = extractDeclarationsFromFiles(files, scanPath);
	const pairs = findDuplicatePairs(declarations);
	return pairsToViolations(pairs);
}

/** Per-file hook required by check-all — analysis is repo-level. */
export function checkDuplicateInterfaces() {
	return [];
}

if (isMainEntryPoint(import.meta.url)) {
	const args = process.argv.slice(2);
	const reportPath = args.find(arg => arg.startsWith("--report="))?.split("=")[1];
	const scanPath = args.find(arg => !arg.startsWith("--")) || ".";

	const violations = checkDuplicateInterfacesRepo(scanPath);

	if (violations.length === 0) {
		console.log(pass("✅ No duplicate interface violations found"));
		if (reportPath) {
			writeReport(reportPath, {
				steps: [{ step: 39, name: "check-duplicate-interfaces", status: "pass", violations: [] }],
				timestamp: new Date().toISOString(),
				mode: "single-check",
				passed: true,
				totalViolations: 0,
			});
		}
		process.exit(0);
	}

	console.log(fail(`❌ ${violations.length} duplicate interface violations found\n`));
	printViolations(violations);

	if (reportPath) {
		writeReport(reportPath, {
			steps: [{ step: 39, name: "check-duplicate-interfaces", status: "fail", violations }],
			timestamp: new Date().toISOString(),
			mode: "single-check",
			passed: false,
			totalViolations: violations.length,
		});
	}

	process.exit(1);
}
