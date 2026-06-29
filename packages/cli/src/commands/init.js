import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CHECK_TEMPLATE = `/**
 * Example check — returns violations for lines containing "FIXME".
 */
export function checkExample(source, filePath) {
  const violations = [];
  const lines = source.split("\\n");

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("FIXME")) {
      violations.push({
        file: filePath,
        line: i + 1,
        message: "Found FIXME comment",
        text: lines[i].trim(),
      });
    }
  }

  return violations;
}
`;

const FIX_TEMPLATE = `/**
 * Example fixer — dry-run by default when invoked via \`chekr fix\`.
 */
export function fixExample(source, filePath, violations) {
  return source;
}
`;

const CONFIG_TEMPLATE = `/** @type {import('chekr').ChekrConfig} */
export default {
  checksDir: "./.chekr/checks",
  fixesDir: "./.chekr/fixes",
  include: ["**/*.{js,jsx,ts,tsx}"],
  gitignore: ".gitignore",
  bail: true,
  parallel: true,
  concurrency: 4,
  ignoreMarker: "@chekr-ignore",
  reporter: "default",
  cache: true,
  cacheDir: ".chekr-cache",
};
`;

/**
 * @param {Record<string, string | boolean>} _flags
 * @param {string[]} _positionals
 * @param {string} cwd
 */
export async function initCommand(_flags, _positionals, cwd) {
  const checksDir = path.join(cwd, ".chekr", "checks");
  const fixesDir = path.join(cwd, ".chekr", "fixes");

  await mkdir(checksDir, { recursive: true });
  await mkdir(fixesDir, { recursive: true });

  await writeFile(path.join(checksDir, "check_example.js"), CHECK_TEMPLATE);
  await writeFile(path.join(fixesDir, "fix_example.js"), FIX_TEMPLATE);
  await writeFile(path.join(cwd, "chekr.config.js"), CONFIG_TEMPLATE);

  console.log("Created:");
  console.log("  .chekr/checks/check_example.js");
  console.log("  .chekr/fixes/fix_example.js");
  console.log("  chekr.config.js");
}
