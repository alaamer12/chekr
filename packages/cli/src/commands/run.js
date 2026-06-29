import { rm } from "node:fs/promises";
import { ENGINE_DEFAULTS, loadConfig, resolveConfig, run } from "@chekr/core";
import { toAbsolute } from "@chekr/helpers";
import { cliToConfigPatch } from "../argv/cli-to-config-patch.js";

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string[]} positionals
 * @param {string} cwd
 */
export async function runCommand(flags, positionals, cwd) {
  const { patch, actions } = cliToConfigPatch(flags, positionals);

  if (actions.clearCache) {
    let cacheDir = ENGINE_DEFAULTS.cacheDir;
    try {
      const fileConfig = patch.configPath
        ? await loadConfig(/** @type {string} */ (patch.configPath), cwd)
        : await loadConfig(undefined, cwd);
      const resolved = resolveConfig(fileConfig, patch, { cwd });
      cacheDir = /** @type {string} */ (resolved.cacheDir);
    } catch {
      // use default cache dir
    }
    await rm(toAbsolute(cacheDir, cwd), { recursive: true, force: true });
  }

  const result = await run({ ...patch, cwd });

  if (!result.passed) {
    process.exitCode = 1;
  }

  return result;
}
