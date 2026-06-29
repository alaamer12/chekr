/**
 * Fixes mistaken 'prop="${color.x}"' / 'prop='${color.x}'' from over-eager hex replacement.
 * Converts to JSX expression form: prop={color.x}
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function walk(dir, acc = []) {
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		if (["node_modules", ".git", "dist", "target"].includes(ent.name)) continue;
		const p = join(dir, ent.name);
		if (ent.isDirectory()) walk(p, acc);
		else if (/\.tsx$/.test(ent.name)) acc.push(p);
	}
	return acc;
}

const PROP_RE =
	/\b([a-zA-Z][\w]*)\s*=\s*(['"])\$\{((?:color|palette|space|size|fontSize)[^}]+)\}\2/g;

let fixed = 0;
for (const file of walk(join(ROOT, "packages"))) {
	fixFile(file);
}
for (const file of walk(join(ROOT, "capabilities"))) {
	fixFile(file);
}
for (const file of walk(join(ROOT, "apps"))) {
	fixFile(file);
}

function fixFile(file) {
	let source = readFileSync(file, "utf8");
	const orig = source;
	source = source.replace(PROP_RE, (_, prop, _q, expr) => `${prop}={${expr}}`);
	// borderTop='1px solid ${color.x}' → borderTop='1px solid' borderColor={color.x}
	source = source.replace(
		/\b(border(?:Top|Bottom|Left|Right)?)\s*=\s*(['"])1px solid \$\{((?:color)[^}]+)\}\2/g,
		(_, prop, _q, expr) => `${prop}='1px solid' borderColor={${expr}}`
	);
	if (source !== orig) {
		writeFileSync(file, source);
		fixed++;
		console.log("fixed", file.replace(ROOT + "/", "").replace(ROOT + "\\", ""));
	}
}
console.log("done", fixed);
