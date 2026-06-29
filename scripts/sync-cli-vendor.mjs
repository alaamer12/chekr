/**
 * Copy internal @chekr/* packages into packages/cli/vendor for publishing.
 * Consumers install via file: deps — no registry lookup for @chekr/core|helpers|utils.
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "packages/cli");
const VENDOR_ROOT = path.join(CLI, "vendor", "@chekr");

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

function patchVendoredPackageJson(name, pkg) {
  delete pkg.private;

  if (name === "core" && pkg.dependencies) {
    delete pkg.dependencies["@chekr/helpers"];
    delete pkg.dependencies["@chekr/utils"];
  }

  return pkg;
}

function installNestedCoreDeps() {
  const nestedScope = path.join(VENDOR_ROOT, "core", "node_modules", "@chekr");
  mkdirSync(nestedScope, { recursive: true });

  for (const name of ["helpers", "utils"]) {
    const from = path.join(VENDOR_ROOT, name);
    const to = path.join(nestedScope, name);
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
  }
}

function installNestedCoreRuntimeDeps() {
  const coreRoot = path.join(VENDOR_ROOT, "core");
  execSync("npm install --omit=dev --no-package-lock --ignore-scripts", {
    cwd: coreRoot,
    stdio: "pipe",
  });
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
  const pkg = patchVendoredPackageJson(name, JSON.parse(readFileSync(pkgPath, "utf8")));
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

rmSync(VENDOR_ROOT, { recursive: true, force: true });
mkdirSync(VENDOR_ROOT, { recursive: true });

for (const name of INTERNAL) {
  copyPackage(name);
}

installNestedCoreRuntimeDeps();
installNestedCoreDeps();

rmSync(path.join(VENDOR_ROOT, "core", "node_modules", ".package-lock.json"), { force: true });

console.log("Synced internal packages to packages/cli/vendor/@chekr/");
