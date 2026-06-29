/**
 * Step 42: check-literal-unions
 *
 * Detects inline literal union types and encourages extraction into reusable named aliases.
 *
 * Step 1 — Inline detection: unions of 2+ string/number/boolean literals used inline
 *   (params, properties, return types, generics, etc.) instead of a named alias.
 *
 * Step 2 — Global reuse: normalised signatures (sorted literal members) tracked repo-wide;
 *   duplicate inline unions and unused existing aliases are flagged.
 *
 * Policy: unions mixing literals with non-literals (e.g. `string | "a"`) are skipped.
 * Single-member unions are skipped. Named type-alias bodies are not counted as inline.
 *
 * Tooling: ts-morph Project (in-memory), same pattern as check-duplicate-interfaces.
 * Does NOT use ts-patch or Typia transforms.
 */

import fs from "node:fs";
import path from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import { buildIgnoredLines } from "../utils/ignore-handler.js";
import { matchesScope } from "../utils/scope-matcher.js";
import { walkFiles } from "../utils/file-walker.js";
import { printViolations, writeReport } from "../utils/reporter.js";
import { isMainEntryPoint } from "../utils/path-utils.js";
import { pass, fail } from "../utils/colors.js";

const SCOPE = ["capabilities/", "apps/", "packages/"];
const EXTENSIONS = [".ts", ".tsx"];

export const CODE = {
	INLINE_LITERAL_UNION: "INLINE_LITERAL_UNION",
	DUPLICATE_INLINE_UNION: "DUPLICATE_INLINE_UNION",
	INLINE_EXISTING_ALIAS_UNUSED: "INLINE_EXISTING_ALIAS_UNUSED",
};

const DEFAULT_MIN_MEMBERS = 2;

const SKIP_PATH_SEGMENTS = [
	"/node_modules/",
	"/dist/",
	"/build/",
	"/.turbo/",
	"/coverage/",
	"packages/toolkit/",
	"/__tests__/",
	"/__tests__",
];

function isExcludedTestOrStoryPath(normalised) {
	if (/\.(test|spec)\.[jt]sx?$/.test(normalised)) return true;
	if (/\.stories\.(tsx?|ts)$/.test(normalised)) return true;
	return false;
}

const IN_SCOPE_RE = /(^|\/)(capabilities|apps|packages)\//;

function shouldScanFile(filePath) {
	const normalised = filePath.replace(/\\/g, "/");
	if (!matchesScope(normalised, SCOPE) && !IN_SCOPE_RE.test(normalised)) return false;
	if (!EXTENSIONS.some(ext => normalised.endsWith(ext))) return false;
	if (normalised.endsWith(".d.ts")) return false;
	if (SKIP_PATH_SEGMENTS.some(seg => normalised.includes(seg))) return false;
	if (isExcludedTestOrStoryPath(normalised)) return false;
	return true;
}

/** @param {string[]} members */
export function normalizeUnionSignature(members) {
	return [...new Set(members)]
		.map(m => m.trim())
		.sort()
		.join("|");
}

/**
 * @param {import("ts-morph").UnionTypeNode} unionNode
 * @returns {string[] | null}
 */
export function collectLiteralMembers(unionNode, minMembers = DEFAULT_MIN_MEMBERS) {
	const members = [];
	for (const child of unionNode.getTypeNodes()) {
		const kind = child.getKind();
		if (kind === SyntaxKind.LiteralType || child.getKindName() === "LiteralType") {
			members.push(child.getText());
		} else if (kind === SyntaxKind.TrueKeyword || kind === SyntaxKind.FalseKeyword) {
			members.push(child.getText());
		} else {
			return null;
		}
	}
	return members.length >= minMembers ? members : null;
}

function pascalCase(identifier) {
	return identifier.replace(/[-_]+(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, c => c.toUpperCase());
}

/**
 * @param {import("ts-morph").Node} unionNode
 * @returns {string | null}
 */
export function suggestAliasNameFromContext(unionNode) {
	const parent = unionNode.getParent();
	if (!parent) return null;

	const k = parent.getKindName();
	if (k === "Parameter" || k === "VariableDeclaration" || k === "PropertySignature" || k === "PropertyDeclaration") {
		const id = parent.getFirstChildByKind?.(SyntaxKind.Identifier);
		if (id) return `${pascalCase(id.getText())}Type`;
	}
	return null;
}

/**
 * @param {string[]} members
 * @param {Set<string>} existingNames
 */
export function suggestAliasNameFromMembers(members, existingNames = new Set()) {
	const words = members
		.slice(0, 4)
		.map(m =>
			m
				.replace(/^["'`]|["'`]$/g, "")
				.replace(/[^a-zA-Z0-9_]/g, "_")
				.replace(/^_+|_+$/g, "")
				.replace(/(?:^|_)(\w)/g, (_, c) => c.toUpperCase())
		)
		.join("");
	const base = words ? `${words}Type` : "LiteralUnionType";
	let candidate = base;
	let counter = 2;
	while (existingNames.has(candidate)) {
		candidate = `${base}${counter++}`;
	}
	return candidate;
}

/**
 * @param {import("ts-morph").Node} unionNode
 */
function describeLocation(unionNode) {
	const parent = unionNode.getParent();
	if (!parent) return "unknown position";

	const k = parent.getKindName();

	switch (k) {
		case "Parameter": {
			const paramName = parent.getFirstChildByKind?.(SyntaxKind.Identifier)?.getText() ?? "?";
			const fn = parent.getParent();
			const fnName =
				fn?.getFirstChildByKind?.(SyntaxKind.Identifier)?.getText() ?? fn?.getKindName() ?? "anonymous";
			return `parameter \`${paramName}\` of \`${fnName}\``;
		}
		case "VariableDeclaration": {
			const varName = parent.getFirstChildByKind?.(SyntaxKind.Identifier)?.getText() ?? "?";
			return `variable declaration \`${varName}\``;
		}
		case "PropertySignature":
		case "PropertyDeclaration": {
			const propName = parent.getFirstChildByKind?.(SyntaxKind.Identifier)?.getText() ?? "?";
			return `property \`${propName}\``;
		}
		case "TypeAliasDeclaration": {
			const aliasName = parent.getFirstChildByKind?.(SyntaxKind.Identifier)?.getText() ?? "?";
			return `type alias \`${aliasName}\``;
		}
		case "AsExpression":
		case "TypeAssertionExpression":
			return "type assertion / cast";
		default:
			return k;
	}
}

function createParseProject() {
	return new Project({
		skipAddingFilesFromTsConfig: true,
		skipFileDependencyResolution: true,
		skipLoadingLibFiles: true,
		compilerOptions: { allowJs: false },
	});
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
 * @param {string[] | null} [prefilteredFiles]
 * @param {{ minMembers?: number }} [opts]
 * @returns {import('../utils/reporter.js').Violation[]}
 */
export function checkLiteralUnionsRepo(scanPath = ".", prefilteredFiles = null, opts = {}) {
	const { minMembers = DEFAULT_MIN_MEMBERS } = opts;
	const resolvedRoot = path.resolve(scanPath);
	const relFiles = prefilteredFiles?.filter(shouldScanFile) ?? collectScopedTypeScriptFiles(scanPath);

	const project = createParseProject();
	const sourceFiles = [];
	const ignoredByFile = new Map();

	for (const rel of relFiles) {
		const abs = path.resolve(resolvedRoot, rel);
		if (!fs.existsSync(abs)) continue;
		try {
			const content = fs.readFileSync(abs, "utf8");
			ignoredByFile.set(rel, buildIgnoredLines(content.split("\n")));
			sourceFiles.push({ rel, sf: project.addSourceFileAtPath(abs) });
		} catch {
			// unparseable — skip
		}
	}

	const namedAliasRegistry = new Map();

	for (const { rel, sf } of sourceFiles) {
		for (const ta of sf.getTypeAliases()) {
			const typeNode = ta.getTypeNode?.();
			if (!typeNode || typeNode.getKindName() !== "UnionType") continue;
			const members = collectLiteralMembers(typeNode, minMembers);
			if (!members) continue;
			const sig = normalizeUnionSignature(members);
			if (!namedAliasRegistry.has(sig)) namedAliasRegistry.set(sig, []);
			namedAliasRegistry.get(sig).push({
				name: ta.getName(),
				file: rel,
				line: ta.getStartLineNumber(),
			});
		}
	}

	const inlineRegistry = new Map();

	for (const { rel, sf } of sourceFiles) {
		const ignored = ignoredByFile.get(rel) ?? new Set();

		sf.forEachDescendant((node, traversal) => {
			if (node.getKindName() !== "UnionType") return;

			const members = collectLiteralMembers(node, minMembers);
			if (!members) return;

			const parent = node.getParent();
			if (parent?.getKindName() === "TypeAliasDeclaration") {
				traversal.skip();
				return;
			}

			const line = node.getStartLineNumber();
			if (ignored.has(line)) {
				traversal.skip();
				return;
			}

			const sig = normalizeUnionSignature(members);
			if (!inlineRegistry.has(sig)) inlineRegistry.set(sig, []);
			inlineRegistry.get(sig).push({
				file: rel,
				line,
				col: sf.getLineAndColumnAtPos(node.getStart()).column,
				location: describeLocation(node),
				text: node.getText(),
				members,
				unionNode: node,
			});

			traversal.skip();
		});
	}

	const allAliasNames = new Set([...namedAliasRegistry.values()].flatMap(arr => arr.map(a => a.name)));
	const violations = [];

	for (const [sig, occurrences] of inlineRegistry) {
		const existingAliases = namedAliasRegistry.get(sig) ?? [];
		const isDuplicated = occurrences.length > 1;
		const hasExistingAlias = existingAliases.length > 0;

		const contextName = suggestAliasNameFromContext(occurrences[0].unionNode);
		const memberName = suggestAliasNameFromMembers(occurrences[0].members, allAliasNames);
		const suggestedName =
			existingAliases[0]?.name ?? (contextName && !allAliasNames.has(contextName) ? contextName : memberName);

		if (!allAliasNames.has(suggestedName)) {
			allAliasNames.add(suggestedName);
		}

		for (let i = 0; i < occurrences.length; i++) {
			const occ = occurrences[i];
			const isFirstOccurrence = i === 0;

			let message;
			let fix;

			if (hasExistingAlias) {
				const aliasRef = existingAliases.map(a => `\`${a.name}\` (${a.file}:${a.line})`).join(", ");
				message =
					`[Step 1 + Step 2 failed] Inline literal union \`${occ.text}\` at ` +
					`${occ.file}:${occ.line} (${occ.location}) duplicates the already-extracted ` +
					`type alias ${aliasRef}. Import and reference the existing alias instead of ` +
					`repeating the inline union.`;
				fix =
					`Replace the inline union with \`${existingAliases[0].name}\` and ` +
					`add \`import type { ${existingAliases[0].name} } from '…'\` (adjust the import path).`;
			} else if (isDuplicated && !isFirstOccurrence) {
				const firstRef = `${occurrences[0].file}:${occurrences[0].line}`;
				message =
					`[Step 2 failed] Inline literal union \`${occ.text}\` at ` +
					`${occ.file}:${occ.line} (${occ.location}) is identical to the one at ` +
					`${firstRef}. Extract a shared type alias \`${suggestedName} = ${occ.text}\` ` +
					`and reference it in both locations.`;
				fix =
					`Extract \`export type ${suggestedName} = ${occ.text};\` to a shared types file, ` +
					`then replace this inline union with \`${suggestedName}\`.`;
			} else {
				message =
					`[Step 1 failed] Inline literal union \`${occ.text}\` at ` +
					`${occ.file}:${occ.line} (${occ.location}). Literal unions with ${occ.members.length} ` +
					`members should be extracted into a named type alias for reusability and clarity.`;
				fix =
					`Declare \`export type ${suggestedName} = ${occ.text};\` near the top of the file ` +
					`(or in a shared types file) and replace the inline union with \`${suggestedName}\`.`;
			}

			violations.push({
				file: occ.file,
				line: occ.line,
				text: occ.text,
				message,
				fix,
			});
		}
	}

	violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
	return violations;
}

/** Per-file hook required by check-all — analysis is repo-level. */
export function checkLiteralUnions() {
	return [];
}

if (isMainEntryPoint(import.meta.url)) {
	const args = process.argv.slice(2);
	const reportPath = args.find(arg => arg.startsWith("--report="))?.split("=")[1];
	const minArg = args.find(arg => arg.startsWith("--min-members="));
	const scanPath = args.find(arg => !arg.startsWith("--")) || ".";
	const minMembers = minArg ? parseInt(minArg.split("=")[1], 10) : DEFAULT_MIN_MEMBERS;

	const violations = checkLiteralUnionsRepo(scanPath, null, { minMembers });

	if (violations.length === 0) {
		console.log(pass("✅ No inline literal union violations found"));
		if (reportPath) {
			writeReport(reportPath, {
				steps: [{ step: 42, name: "check-literal-unions", status: "pass", violations: [] }],
				timestamp: new Date().toISOString(),
				mode: "single-check",
				passed: true,
				totalViolations: 0,
			});
		}
		process.exit(0);
	}

	console.log(fail(`❌ ${violations.length} inline literal union violation(s) found\n`));
	printViolations(violations);

	if (reportPath) {
		writeReport(reportPath, {
			steps: [{ step: 42, name: "check-literal-unions", status: "fail", violations }],
			timestamp: new Date().toISOString(),
			mode: "single-check",
			passed: false,
			totalViolations: violations.length,
		});
	}

	process.exit(1);
}
