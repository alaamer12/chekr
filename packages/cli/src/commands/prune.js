import { rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { cliToConfigPatch } from "../argv/cli-to-config-patch.js";
import { ENGINE_DEFAULTS, loadConfig, resolveConfig } from "../lib/core/engine.js";
import { loadChecks, resolveStepOrder } from "../lib/core/loader.js";
import { toAbsolute } from "../lib/helpers/index.js";
import { pass, warn, fail } from "../lib/utils/index.js";

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string[]} positionals
 * @param {string} cwd
 */
export async function pruneCommand(flags, positionals, cwd) {
  const target = positionals[0];
  if (!target) {
    console.log(fail("Error: Missing target for prune command."));
    console.log("Usage: chekr prune <step-number | check-id | \"all\">");
    process.exitCode = 1;
    return;
  }

  const { patch } = cliToConfigPatch(flags, positionals);

  let cacheDir = ENGINE_DEFAULTS.cacheDir;
  let fileConfig = null;
  try {
    fileConfig = patch.configPath
      ? await loadConfig(/** @type {string} */ (patch.configPath), cwd)
      : await loadConfig(undefined, cwd);
    const resolved = resolveConfig(fileConfig, patch, { cwd });
    cacheDir = /** @type {string} */ (resolved.cacheDir);
  } catch {
    // use default cache dir
  }

  const absoluteCacheDir = toAbsolute(cacheDir, cwd);

  if (target === "all") {
    try {
      await rm(absoluteCacheDir, { recursive: true, force: true });
      console.log(pass(`Cache directory cleared: ${cacheDir}`));
    } catch (err) {
      console.log(fail(`Failed to clear cache directory: ${err.message}`));
      process.exitCode = 1;
    }
    return;
  }

  let targetCheckId = target;
  const targetStepNumber = parseInt(target, 10);

  // If the target is a number, we need to load the checks to find the corresponding check ID
  if (!Number.isNaN(targetStepNumber) && fileConfig) {
    const resolvedConfig = resolveConfig(fileConfig, patch, { cwd });
    const checksDir = /** @type {string} */ (resolvedConfig.checksDir ?? "./.chekr/checks");
    try {
      const checks = await loadChecks(checksDir, cwd);
      const ordered = resolveStepOrder(checks, resolvedConfig);
      const check = ordered.find((c) => c.step === targetStepNumber);
      if (check) {
        targetCheckId = check.id;
      } else {
        console.log(fail(`Error: No active check found for step number ${targetStepNumber}.`));
        process.exitCode = 1;
        return;
      }
    } catch (err) {
      console.log(fail(`Failed to load checks to resolve step number: ${err.message}`));
      process.exitCode = 1;
      return;
    }
  }

  // Iterate over all folders in cacheDir and delete the targetCheckId.json
  let deletedCount = 0;
  try {
    const cacheDirs = await readdir(absoluteCacheDir, { withFileTypes: true });
    for (const dirent of cacheDirs) {
      if (dirent.isDirectory()) {
        const stepCachePath = join(absoluteCacheDir, dirent.name, "steps", `${targetCheckId}.json`);
        try {
          await rm(stepCachePath, { force: true });
          deletedCount++;
        } catch {
          // file doesn't exist, skip
        }
      }
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log(warn("Cache directory does not exist, nothing to prune."));
      return;
    }
    console.log(fail(`Failed to read cache directory: ${err.message}`));
    process.exitCode = 1;
    return;
  }

  if (deletedCount > 0) {
    console.log(pass(`Pruned cache for check "${targetCheckId}" across ${deletedCount} cache folders.`));
  } else {
    console.log(warn(`No cache files found for check "${targetCheckId}".`));
  }
}
