/**
 * Replaces theme scale color strings with semantic color tokens.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const REPLACEMENTS = [
	[/\bcolor\s*=\s*['"]danger\.500['"]/g, "color={color.danger}"],
	[/\bcolor\s*=\s*['"]primary\.500['"]/g, "color={color.primary}"],
	[/\bbg\s*=\s*['"]purple\.500['"]/g, "bg={color.nodeAddon}"],
	[/\bbg\s*=\s*['"]orange\.500['"]/g, "bg={color.nodeTrigger}"],
	[/\bbg\s*=\s*['"]green\.400['"]/g, "bg={color.nodeOperator}"],
	[/\bbg\s*=\s*['"]green\.500['"]/g, "bg={color.success}"],
	[/\bbg\s*=\s*['"]red\.500['"]/g, "bg={color.danger}"],
	[/\bbg\s*=\s*['"]blue\.500['"]/g, "bg={color.brand}"],
	[/\bbg\s*=\s*['"]red\.50['"]/g, "bg={color.statusErrorSurface}"],
	[/\bbg\s*=\s*['"]green\.50['"]/g, "bg={color.statusSuccessSurface}"],
	[/\bbg\s*=\s*['"]orange\.50['"]/g, "bg={color.statusWarningSurface}"],
	[/\bborderColor\s*=\s*['"]red\.200['"]/g, "borderColor={color.statusErrorBorder}"],
	[/\bborderColor\s*=\s*['"]orange\.200['"]/g, "borderColor={color.statusWarningBorder}"],
	[/\bborderColor\s*=\s*['"]red\.400['"]/g, "borderColor={color.dangerMuted}"],
	[/\bbackgroundColor\s*=\s*['"]red\.50['"]/g, "backgroundColor={color.statusErrorSurface}"],
	[/\bbackgroundColor\s*=\s*['"]green\.50['"]/g, "backgroundColor={color.statusSuccessSurface}"],
	[/\bbg\s*=\s*['"]gray\.900['"]/g, "bg={color.bgBase}"],
	[/\bborderColor\s*=\s*['"]gray\.900['"]/g, "borderColor={color.bgBase}"],
	[/\bcolor\s*=\s*['"]blue\.300['"]/g, "color={color.brandSubtleBg}"],
	[/\bcolor\s*=\s*['"]green\.400['"]/g, "color={color.successMuted}"],
	[/\bcolor\s*=\s*['"]yellow\.400['"]/g, "color={color.warning}"],
	[/\bborderColor\s*=\s*['"]green\.400['"]/g, "borderColor={color.successMuted}"],
	[/\bbg\s*=\s*['"]blue\.50['"]/g, "bg={color.statusSuccessSurface}"],
	[/\bbg\s*=\s*['"]green\.50['"]/g, "bg={color.statusSuccessSurface}"],
	[/\bbg\s*=\s*['"]purple\.50['"]/g, "bg={color.statusWarningSurface}"],
	[/\bbg\s*=\s*['"]orange\.50['"]/g, "bg={color.statusWarningSurface}"],
	[/\bbg\s*=\s*['"]blue\.100['"]/g, "bg={color.brandSubtleBg}"],
	[/\bbg\s*=\s*['"]purple\.500['"]/g, "bg={color.nodeAddon}"],
];

function walk(dir, acc = []) {
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		if (ent.name === "node_modules" || ent.name === ".git") continue;
		const p = join(dir, ent.name);
		if (ent.isDirectory()) walk(p, acc);
		else if (/\.(tsx|ts)$/.test(ent.name) && !ent.name.endsWith(".test.ts")) acc.push(p);
	}
	return acc;
}

function ensureColorImport(source) {
	if (!REPLACEMENTS.some(([, r]) => source.includes("color.")) && !source.includes("color={color")) return source;
	const imp = /import\s*\{([^}]*)\}\s*from\s*['"]@symphony\/shared\/tokens['"]/;
	const m = source.match(imp);
	if (!m) return source;
	const parts = m[1].split(",").map(s => s.trim()).filter(Boolean);
	if (parts.includes("color")) return source;
	return source.replace(imp, `import { color, ${parts.join(", ")} } from '@symphony/shared/tokens'`);
}

const dirs = [
	join(ROOT, "capabilities"),
	join(ROOT, "apps"),
	join(ROOT, "packages/shell"),
	join(ROOT, "packages/ui"),
];

let fixed = 0;
for (const dir of dirs) {
	for (const file of walk(dir)) {
		let source = readFileSync(file, "utf8");
		let changed = false;
		for (const [re, rep] of REPLACEMENTS) {
			if (re.test(source)) {
				source = source.replace(re, rep);
				changed = true;
			}
			re.lastIndex = 0;
		}
		if (changed) {
			source = ensureColorImport(source);
			writeFileSync(file, source);
			fixed++;
			console.log("fixed", file.replace(ROOT + "/", ""));
		}
	}
}
console.log("done", fixed);
