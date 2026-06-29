/**
 * One-off bulk rename: checkr → chekr (scope, CLI, config paths, types).
 * Excludes node_modules and .git.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const SKIP_FILES = new Set(["rename-checkr-to-chekr.mjs"]);

const REPLACEMENTS = [
  ["@checkr-ignore", "@chekr-ignore"],
  ["@checkr/", "@chekr/"],
  ["ResolvedCheckrConfig", "ResolvedChekrConfig"],
  ["CheckrConfigInput", "ChekrConfigInput"],
  ["CheckrConfig", "ChekrConfig"],
  ["checkrConfigSchema", "chekrConfigSchema"],
  [".checkr-cache", ".chekr-cache"],
  [".checkr/", ".chekr/"],
  [".checkr", ".chekr"],
  ["checkr.config", "chekr.config"],
  ["declare module \"checkr\"", "declare module \"chekr\""],
  ["import('checkr')", "import('chekr')"],
  ["import(\"checkr\")", "import(\"chekr\")"],
  [/\bcheckr\b/g, "chekr"],
  [/\bCheckr\b/g, "Chekr"],
];

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name);
}

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (shouldSkipDir(ent.name)) continue;
      walk(path.join(dir, ent.name), files);
    } else {
      files.push(path.join(dir, ent.name));
    }
  }
  return files;
}

function applyReplacements(content) {
  let out = content;
  for (const [from, to] of REPLACEMENTS) {
    out = typeof from === "string" ? out.split(from).join(to) : out.replace(from, to);
  }
  return out;
}

let changed = 0;
for (const file of walk(ROOT)) {
  const base = path.basename(file);
  if (SKIP_FILES.has(base)) continue;
  if (base.endsWith(".png") || base.endsWith(".lock")) continue;

  const raw = fs.readFileSync(file, "utf8");
  const next = applyReplacements(raw);
  if (next !== raw) {
    fs.writeFileSync(file, next, "utf8");
    changed++;
    console.log("updated:", path.relative(ROOT, file));
  }
}

const renames = [
  ["types/checkr.config.d.ts", "types/chekr.config.d.ts"],
  ["examples/minimal/checkr.config.js", "examples/minimal/chekr.config.js"],
  ["examples/symphony-rules/checkr.config.js", "examples/symphony-rules/chekr.config.js"],
  [
    "packages/core/__fixtures__/minimal/checkr.config.js",
    "packages/core/__fixtures__/minimal/chekr.config.js",
  ],
  ["examples/minimal/.checkr", "examples/minimal/.chekr"],
  ["examples/symphony-rules/.checkr", "examples/symphony-rules/.chekr"],
  ["packages/core/__fixtures__/minimal/.checkr", "packages/core/__fixtures__/minimal/.chekr"],
];

for (const [fromRel, toRel] of renames) {
  const from = path.join(ROOT, fromRel);
  const to = path.join(ROOT, toRel);
  if (fs.existsSync(from)) {
    fs.renameSync(from, to);
    console.log("renamed:", fromRel, "→", toRel);
  }
}

console.log(`\nDone. ${changed} files updated.`);
