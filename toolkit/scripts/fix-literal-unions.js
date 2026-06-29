/**
 * One-shot autofix for check-literal-unions violations.
 * Run from repo root: node packages/toolkit/scripts/fix-literal-unions.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Project, SyntaxKind } from "ts-morph";
import {
	collectScopedTypeScriptFiles,
	collectLiteralMembers,
	normalizeUnionSignature,
	suggestAliasNameFromContext,
	suggestAliasNameFromMembers,
} from "../checks/check-literal-unions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

function readPackageName(packageDir) {
	const pkgPath = path.join(packageDir, "package.json");
	if (!fs.existsSync(pkgPath)) return null;
	try {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
		return typeof pkg.name === "string" ? pkg.name : null;
	} catch {
		return null;
	}
}

/** @param {string} fromRel @param {string} aliasRel */
function resolveSymphonyImport(fromRel, aliasRel) {
	const fromAbs = path.join(ROOT, fromRel);
	const aliasAbs = path.join(ROOT, aliasRel);

	if (path.dirname(fromAbs) === path.dirname(aliasAbs)) {
		const base = path.basename(aliasRel).replace(/\.tsx?$/, "");
		return base === "index" ? "./types" : `./${base}`;
	}

	const fromParts = fromRel.replace(/\\/g, "/").split("/");
	const aliasParts = aliasRel.replace(/\\/g, "/").split("/");

	if (fromParts[0] === "packages" && aliasParts[0] === "packages" && fromParts[1] === aliasParts[1]) {
		const pkgName = readPackageName(path.join(ROOT, "packages", fromParts[1]));
		if (pkgName?.startsWith("@symphony/")) return pkgName;
	}

	if (aliasParts[0] === "packages" && aliasParts[1]) {
		const pkgName = readPackageName(path.join(ROOT, "packages", aliasParts[1]));
		if (pkgName?.startsWith("@symphony/")) return pkgName;
	}

	let rel = path.relative(path.dirname(fromAbs), aliasAbs).replace(/\\/g, "/");
	if (!rel.startsWith(".")) rel = `./${rel}`;
	return rel.replace(/\.tsx?$/, "").replace(/\/index$/, "");
}

/** @param {string} relFile */
function findTypesTarget(relFile) {
	const dir = path.dirname(relFile);
	const candidates = [
		path.join(dir, "types.ts"),
		path.join(dir, "types/index.ts"),
		path.join(dir, "../types.ts"),
		path.join(dir, "../types/index.ts"),
	];
	for (const c of candidates) {
		const rel = c.replace(/\\/g, "/");
		if (fs.existsSync(path.join(ROOT, rel))) return rel;
	}
	return path.join(dir, "types.ts").replace(/\\/g, "/");
}

/** @param {import('ts-morph').SourceFile} sf */
function ensureTypeAlias(sf, aliasName, unionText) {
	if (sf.getTypeAlias(aliasName)) return false;
	const trimmed = unionText.replace(/^\|\s*/, "").trim();
	const imports = sf.getImportDeclarations();
	const idx = imports.length > 0 ? imports[imports.length - 1].getChildIndex() + 1 : 0;
	sf.insertStatements(idx, `export type ${aliasName} = ${trimmed};`);
	return true;
}

/** @param {import('ts-morph').SourceFile} sf @param {string} aliasDefRel */
function ensureTypeImport(sf, aliasName, fromSpec, aliasDefRel) {
	const occRel = toRel(sf.getFilePath());
	if (occRel === aliasDefRel.replace(/\\/g, "/")) return;
	const existing = sf.getImportDeclarations().find(d => d.getModuleSpecifierValue() === fromSpec && d.isTypeOnly());
	if (existing) {
		if (!existing.getNamedImports().some(n => n.getName() === aliasName)) {
			existing.addNamedImport({ name: aliasName, isTypeOnly: true });
		}
		return;
	}
	const imports = sf.getImportDeclarations();
	const idx = imports.length > 0 ? imports[0].getChildIndex() : 0;
	sf.insertStatements(idx, `import type { ${aliasName} } from "${fromSpec}";`);
}

function toRel(absPath) {
	return absPath.replace(/\\/g, "/").replace(ROOT.replace(/\\/g, "/") + "/", "");
}

function main() {
	const relFiles = collectScopedTypeScriptFiles(ROOT);
	const project = new Project({
		skipAddingFilesFromTsConfig: true,
		skipFileDependencyResolution: true,
		skipLoadingLibFiles: true,
	});

	const sourceFiles = [];
	for (const rel of relFiles) {
		sourceFiles.push({ rel, sf: project.addSourceFileAtPath(path.join(ROOT, rel)) });
	}

	const namedAliasRegistry = new Map();
	for (const { rel, sf } of sourceFiles) {
		for (const ta of sf.getTypeAliases()) {
			const typeNode = ta.getTypeNode?.();
			if (!typeNode || typeNode.getKindName() !== "UnionType") continue;
			const members = collectLiteralMembers(typeNode);
			if (!members) continue;
			const sig = normalizeUnionSignature(members);
			if (!namedAliasRegistry.has(sig)) namedAliasRegistry.set(sig, []);
			namedAliasRegistry.get(sig).push({ name: ta.getName(), file: rel });
		}
	}

	const inlineRegistry = new Map();
	for (const { rel, sf } of sourceFiles) {
		sf.forEachDescendant((node, traversal) => {
			if (node.getKindName() !== "UnionType") return;
			const members = collectLiteralMembers(node);
			if (!members) return;
			if (node.getParent()?.getKindName() === "TypeAliasDeclaration") {
				traversal.skip();
				return;
			}
			const sig = normalizeUnionSignature(members);
			if (!inlineRegistry.has(sig)) inlineRegistry.set(sig, []);
			inlineRegistry.get(sig).push({ file: rel, unionNode: node, text: node.getText(), members });
			traversal.skip();
		});
	}

	const allAliasNames = new Set([...namedAliasRegistry.values()].flatMap(a => a.map(x => x.name)));
	let replaced = 0;
	let aliasesAdded = 0;
	const modified = new Set();

	for (const [sig, occurrences] of inlineRegistry) {
		const existingAliases = namedAliasRegistry.get(sig) ?? [];
		const contextName = suggestAliasNameFromContext(occurrences[0].unionNode);
		const memberName = suggestAliasNameFromMembers(occurrences[0].members, allAliasNames);
		const aliasName =
			existingAliases[0]?.name ?? (contextName && !allAliasNames.has(contextName) ? contextName : memberName);

		if (!allAliasNames.has(aliasName)) allAliasNames.add(aliasName);

		let aliasFile = existingAliases[0]?.file ?? findTypesTarget(occurrences[0].file);
		const aliasAbs = path.join(ROOT, aliasFile);
		if (!fs.existsSync(aliasAbs)) {
			fs.mkdirSync(path.dirname(aliasAbs), { recursive: true });
			fs.writeFileSync(aliasAbs, "", "utf8");
		}

		let aliasSf = project.getSourceFile(aliasAbs);
		if (!aliasSf) aliasSf = project.addSourceFileAtPath(aliasAbs);

		if (!existingAliases.length) {
			const unionText = occurrences[0].text;
			if (ensureTypeAlias(aliasSf, aliasName, unionText)) {
				aliasesAdded++;
				namedAliasRegistry.set(sig, [{ name: aliasName, file: aliasFile }]);
			}
			modified.add(aliasSf);
		}

		for (const occ of occurrences) {
			const sf = occ.unionNode.getSourceFile();
			const occRel = toRel(sf.getFilePath());
			occ.unionNode.replaceWithText(aliasName);
			replaced++;
			modified.add(sf);

			const importSpec = resolveSymphonyImport(occRel, aliasFile);
			ensureTypeImport(sf, aliasName, importSpec, aliasFile);
		}
	}

	for (const sf of modified) {
		sf.saveSync();
	}

	console.log(`Replaced ${replaced} inline unions, added ${aliasesAdded} type aliases, saved ${modified.size} files`);
}

main();
