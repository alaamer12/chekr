import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../ui");

function walk(dir, acc = []) {
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, ent.name);
		if (ent.isDirectory()) walk(p, acc);
		else if (ent.name.endsWith(".stories.tsx")) acc.push(p);
	}
	return acc;
}

for (const file of walk(ROOT)) {
	let s = readFileSync(file, "utf8");
	if (!s.includes("color.") && !s.includes("{color")) continue;
	if (/import\s*\{[^}]*\bcolor\b/.test(s)) continue;
	const imp = s.match(/^import .+ from .+;?\n/m);
	const insert = `import { color } from '@symphony/shared/tokens'\n`;
	if (imp) {
		const idx = s.indexOf(imp[0]) + imp[0].length;
		s = s.slice(0, idx) + insert + s.slice(idx);
	} else {
		s = insert + s;
	}
	writeFileSync(file, s);
	console.log("added import", file);
}
