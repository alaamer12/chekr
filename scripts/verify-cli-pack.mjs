/**
 * Fail if npm pack would include paths outside packages/cli (Bun / workspace leak).
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "packages/cli");

const out = execSync("npm pack --dry-run 2>&1", { cwd: CLI, encoding: "utf8" });

const badPatterns = ["../", ".bun/", "node_modules/.bun"];
for (const pattern of badPatterns) {
  if (out.includes(pattern)) {
    console.error(`npm pack dry-run includes forbidden path pattern: ${pattern}`);
    console.error(out);
    process.exit(1);
  }
}

const requiredBundles = ["@chekr/core", "@chekr/helpers", "@chekr/utils"];
for (const name of requiredBundles) {
  if (!out.includes(name)) {
    console.error(`npm pack dry-run missing bundled package: ${name}`);
    console.error(out);
    process.exit(1);
  }
}

if (!out.includes("src/index.js")) {
  console.error("npm pack dry-run missing CLI entrypoint");
  process.exit(1);
}

console.log("npm pack dry-run OK — tarball paths are confined to @chekr/cli");
