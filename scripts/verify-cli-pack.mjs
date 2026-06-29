/**
 * Fail if npm pack would include paths outside packages/cli (Bun / workspace leak).
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "packages/cli");

const out = execSync("npm pack --dry-run --ignore-scripts 2>&1", { cwd: CLI, encoding: "utf8" });

const contentsStart = out.indexOf("Tarball Contents");
const contentsEnd = out.indexOf("Tarball Details");
const tarballLines =
  contentsStart === -1 || contentsEnd === -1
    ? out.split("\n")
    : out.slice(contentsStart, contentsEnd).split("\n");

const badPatterns = ["../../", ".bun/", "node_modules/.bun"];
for (const line of tarballLines) {
  for (const pattern of badPatterns) {
    if (line.includes(pattern)) {
      console.error(`npm pack dry-run includes forbidden path pattern: ${pattern}`);
      console.error(line);
      process.exit(1);
    }
  }
}

const required = [
  "vendor/@chekr/core",
  "vendor/@chekr/core/node_modules/@chekr/helpers",
  "vendor/@chekr/core/node_modules/@chekr/utils",
  "vendor/@chekr/core/node_modules/simple-git",
  "vendor/@chekr/core/node_modules/ignore",
  "vendor/@chekr/helpers",
  "vendor/@chekr/utils",
  "src/index.js",
];
for (const entry of required) {
  if (!out.includes(entry)) {
    console.error(`npm pack dry-run missing: ${entry}`);
    console.error(out);
    process.exit(1);
  }
}

console.log("npm pack dry-run OK — vendor layout and paths look correct");
