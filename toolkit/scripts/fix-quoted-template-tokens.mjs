import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function walk(dir, acc = []) {
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		if (["node_modules", ".git"].includes(ent.name)) continue;
		const p = join(dir, ent.name);
		if (ent.isDirectory()) walk(p, acc);
		else if (/\.tsx$/.test(ent.name)) acc.push(p);
	}
	return acc;
}

let n = 0;
for (const file of [
	...walk(join(ROOT, "packages")),
	...walk(join(ROOT, "capabilities")),
	...walk(join(ROOT, "apps")),
]) {
	let s = readFileSync(file, "utf8");
	const o = s;
	s = s.replace(/'\$\{([^}]+)\}'/g, "$1");
	s = s.replace(/"\$\{([^}]+)\}"/g, "$1");
	if (s !== o) {
		writeFileSync(file, s);
		n++;
		console.log(file.replace(ROOT, ""));
	}
}
console.log("done", n);
