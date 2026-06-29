/**
 * Vendor internal @chekr/* packages into packages/cli/node_modules before npm pack.
 * Bun workspace symlinks resolve outside the package and break npm publish (E415).
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "packages/cli");
const VENDOR_ROOT = path.join(CLI, "vendor", "@chekr");
const NM_CHEKR = path.join(CLI, "node_modules", "@chekr");

const INTERNAL = ["helpers", "utils", "core"];

const COPY_ALLOW = new Set(["package.json", "README.md"]);

function shouldCopyRelative(rel) {
  if (COPY_ALLOW.has(rel)) return true;
  if (rel === "src" || rel.startsWith("src/")) return true;
  return false;
}

function walk(dir, base = "") {
  const entries = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "__tests__" || ent.name === "__fixtures__") {
        continue;
      }
      entries.push(...walk(path.join(dir, ent.name), rel));
    } else {
      entries.push(rel);
    }
  }
  return entries;
}

function copyPackage(name) {
  const srcRoot = path.join(ROOT, "packages", name);
  const destRoot = path.join(VENDOR_ROOT, name);

  rmSync(destRoot, { recursive: true, force: true });
  mkdirSync(destRoot, { recursive: true });

  for (const rel of walk(srcRoot)) {
    if (!shouldCopyRelative(rel)) continue;
    const from = path.join(srcRoot, rel);
    const to = path.join(destRoot, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
  }

  const pkgPath = path.join(destRoot, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  delete pkg.private;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

rmSync(VENDOR_ROOT, { recursive: true, force: true });
mkdirSync(VENDOR_ROOT, { recursive: true });

for (const name of INTERNAL) {
  copyPackage(name);
}

rmSync(path.join(CLI, "node_modules"), { recursive: true, force: true });
mkdirSync(NM_CHEKR, { recursive: true });

for (const name of INTERNAL) {
  cpSync(path.join(VENDOR_ROOT, name), path.join(NM_CHEKR, name), { recursive: true });
}

console.log("Prepared @chekr/cli for npm publish (run verify-cli-pack.mjs next)");
