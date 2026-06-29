/**
 * Bulk-replace common raw hex/rgba and px literals with Symphony tokens.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const COLOR_REPLACEMENTS = [
	["#252530", "${color.borderSubtle}"],
	["#252526", "${color.bgSurface}"],
	["#2D2D30", "${color.bgElevated}"],
	["#1E1E1E", "${color.bgBase}"],
	["#E8E8F0", "${color.textPrimary}"],
	["#9CA3AF", "${color.textSecondary}"],
	["#6B7280", "${color.textTertiary}"],
	["#5B8FF9", "${color.brand}"],
	["#7BA5FA", "${color.brandLight}"],
	["#3B82F6", "${color.brand}"],
	["#22C55E", "${color.success}"],
	["#FF6B6B", "${color.danger}"],
	["#F6BD16", "${color.warning}"],
	["#9333EA", "${color.syntaxMacro}"],
	["rgba(91, 143, 249, 0.15)", "${color.brand.alpha(0.15)}"],
	["rgba(91, 143, 249, 0.12)", "${color.brand.alpha(0.12)}"],
	["rgba(91,143,249,0.12)", "${color.brand.alpha(0.12)}"],
	["rgba(91, 143, 249, 0.1)", "${color.brand.alpha(0.1)}"],
	["rgba(91,143,249,0.09)", "${color.brand.alpha(0.09)}"],
	["rgba(91, 143, 249, 0.09)", "${color.brand.alpha(0.09)}"],
	["rgba(246,189,22,0.06)", "${color.warning.alpha(0.06)}"],
	["rgba(255,107,107,0.06)", "${color.danger.alpha(0.06)}"],
	["rgba(97,221,170,0.07)", "${color.success.alpha(0.07)}"],
	["rgba(45,45,48,1)", "${color.bgElevated}"],
	["rgba(45, 45, 48, 1)", "${color.bgElevated}"],
	["rgba(37,37,48,1)", "${color.borderSubtle}"],
	["rgba(37, 37, 38, 1)", "${color.bgBase}"],
	["rgba(37,37,38,1)", "${color.bgBase}"],
	["rgb(91, 143, 249)", "${color.brand}"],
	["'transparent'", "'transparent'"],
];

const SIZE_REPLACEMENTS = [
	[/\bwidth='40px'/g, "width={size.lg}"],
	[/\bheight='40px'/g, "height={size.lg}"],
	[/\bwidth='32px'/g, "width={size.md}"],
	[/\bheight='32px'/g, "height={size.md}"],
	[/\bwidth='36px'/g, "width={size.lg}"],
	[/\bheight='36px'/g, "height={size.lg}"],
	[/\bwidth='24px'/g, "width={size.sm}"],
	[/\bheight='24px'/g, "height={size.sm}"],
	[/\bwidth='14px'/g, "width={size['2xs']}"],
	[/\bheight='14px'/g, "height={size['2xs']}"],
	[/\bwidth='8px'/g, "width={space['2xs']}"],
	[/\bheight='8px'/g, "height={space['2xs']}"],
	[/\bborderRadius='8px'/g, "borderRadius={space.xs}"],
	[/\bfontSize='20px'/g, "fontSize={size.xs}"],
	[/\bfontSize='18px'/g, "fontSize={fontSize.sm}"],
	[/\bfontSize='16px'/g, "fontSize={fontSize.md}"],
	[/\bfontSize='14px'/g, "fontSize={fontSize.sm}"],
	[/\bfontSize='12px'/g, "fontSize={fontSize.xs}"],
	[/\bfontSize='10px'/g, "fontSize={fontSize['2xs']}"],
	[/\bfontSize='9px'/g, "fontSize={fontSize['2xs']}"],
	[/\bpy='10px'/g, "py={space.sm}"],
	[/\bpy='2px'/g, "py={space['3xs']}"],
];

function walk(dir, acc = []) {
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		if (["node_modules", ".git", "dist", "target"].includes(ent.name)) continue;
		const p = join(dir, ent.name);
		if (ent.isDirectory()) walk(p, acc);
		else if (/\.tsx$/.test(ent.name) && !ent.name.includes(".test.")) acc.push(p);
	}
	return acc;
}

function ensureImports(source, needs) {
	const imp = /import\s*\{([^}]*)\}\s*from\s*['"]@symphony\/shared\/tokens['"]/;
	const m = source.match(imp);
	const add = [];
	if (needs.color && !/\bcolor\b/.test(m?.[1] ?? "")) add.push("color");
	if (needs.size && !/\bsize\b/.test(m?.[1] ?? "")) add.push("size");
	if (needs.space && !/\bspace\b/.test(m?.[1] ?? "")) add.push("space");
	if (needs.fontSize && !/\bfontSize\b/.test(m?.[1] ?? "")) add.push("fontSize");
	if (!add.length) return source;
	if (m) {
		const parts = m[1].split(",").map(s => s.trim()).filter(Boolean);
		return source.replace(imp, `import { ${[...new Set([...add, ...parts])].join(", ")} } from '@symphony/shared/tokens'`);
	}
	return `import { ${add.join(", ")} } from '@symphony/shared/tokens'\n${source}`;
}

const dirs = [
	join(ROOT, "apps"),
	join(ROOT, "capabilities"),
	join(ROOT, "packages/shell"),
	join(ROOT, "packages/adapters"),
];

let fixed = 0;
for (const dir of dirs) {
	for (const file of walk(dir)) {
		let source = readFileSync(file, "utf8");
		const orig = source;
		const needs = { color: false, size: false, space: false, fontSize: false };

		for (const [from, to] of COLOR_REPLACEMENTS) {
			if (source.includes(from)) {
				source = source.split(from).join(to);
				if (to.includes("color.")) needs.color = true;
			}
		}
		for (const [re, rep] of SIZE_REPLACEMENTS) {
			if (re.test(source)) {
				source = source.replace(re, rep);
				if (rep.includes("size.")) needs.size = true;
				if (rep.includes("space.")) needs.space = true;
				if (rep.includes("fontSize.")) needs.fontSize = true;
			}
			re.lastIndex = 0;
		}

		// borderRight='1px solid #hex' → borderRight with color token
		source = source.replace(
			/border(Right|Left|Top|Bottom)='1px solid #([0-9A-Fa-f]{6})'/g,
			(_, side) => {
				needs.color = true;
				return `border${side}='1px solid' borderColor={color.borderSubtle}`;
			}
		);

		if (source !== orig) {
			source = ensureImports(source, needs);
			writeFileSync(file, source);
			fixed++;
			console.log("fixed", file.replace(ROOT + "\\", "").replace(ROOT + "/", ""));
		}
	}
}
console.log("done", fixed);
