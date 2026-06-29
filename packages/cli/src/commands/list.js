import { readdir } from "node:fs/promises";
import path from "node:path";
import { cliToConfigPatch } from "../argv/cli-to-config-patch.js";
import { loadConfig, resolveConfig } from "../lib/core/engine.js";
import { toAbsolute } from "../lib/helpers/index.js";

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string[]} positionals
 * @param {string} cwd
 */
export async function listCommand(flags, positionals, cwd) {
  const { patch } = cliToConfigPatch(flags, positionals);

  let fileConfig = {};
  try {
    fileConfig = patch.configPath
      ? await loadConfig(/** @type {string} */ (patch.configPath), cwd)
      : await loadConfig(undefined, cwd);
  } catch {
    fileConfig = {};
  }

  const config = resolveConfig(fileConfig, patch, { cwd });
  const checksDir = /** @type {string} */ (config.checksDir);
  const absoluteDir = toAbsolute(checksDir, cwd);

  let entries = [];
  try {
    entries = await readdir(absoluteDir);
  } catch {
    console.log("No checks directory found.");
    return;
  }

  const checkFiles = entries
    .filter((name) => name.startsWith("check_") && name.endsWith(".js"))
    .sort();

  if (checkFiles.length === 0) {
    console.log("No checks discovered.");
    return;
  }

  const configSteps = Array.isArray(config.steps) ? config.steps : [];
  const stepById = new Map(configSteps.map((s) => [/** @type {{ id: string }} */ (s).id, s]));

  console.log(`Discovered checks (${checkFiles.length})\n`);
  console.log("  Step  ID                        File");
  console.log("  ----  ------------------------  ----------------------------------------------");

  let index = 1;
  for (const filename of checkFiles) {
    const id = filename.replace(/^check_/, "").replace(/\.js$/, "");
    const stepConfig = stepById.get(id);
    const stepNum = stepConfig?.step !== undefined ? String(stepConfig.step) : String(index);
    const relPath = path.join(checksDir, filename).replace(/\\/g, "/");
    console.log(`  ${stepNum.padEnd(4)}  ${id.padEnd(26)}  ${relPath}`);
    index++;
  }
}
