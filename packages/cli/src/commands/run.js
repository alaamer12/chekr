import { rm } from "node:fs/promises";
import { cliToConfigPatch } from "../argv/cli-to-config-patch.js";
import { ENGINE_DEFAULTS, loadConfig, resolveConfig, run } from "../lib/core/engine.js";
import { toAbsolute } from "../lib/helpers/index.js";

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string[]} positionals
 * @param {string} cwd
 */
export async function runCommand(flags, positionals, cwd) {
  // Guard: catch `chekr run <subcommand>` mistakes (e.g. `chekr run prune all`)
  // This happens when the CLI is aliased to `chekr run` in package.json scripts
  // and the user types e.g. `bun chekr prune all` → `chekr run prune all`.
  const KNOWN_COMMANDS = new Set(["prune", "fix", "list", "validate", "init", "install", "publish"]);
  if (positionals.length > 0 && KNOWN_COMMANDS.has(positionals[0])) {
    const subcmd = positionals[0];
    const rest = positionals.slice(1).join(" ");
    console.error(
      `\n❌ Wrong invocation: "chekr run ${positionals.join(" ")}"\n` +
      `   "${subcmd}" is a chekr subcommand, not a step filter.\n` +
      `   Did you mean: chekr ${subcmd}${rest ? " " + rest : ""}\n`
    );
    process.exitCode = 1;
    return;
  }

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

  const reportFile = patch.reportFile;
  const hasJsonReport = typeof reportFile === "string" && reportFile.endsWith(".json");

  if (!hasJsonReport && !result.passed) {
    process.exitCode = 1;
  }

  return result;
}
