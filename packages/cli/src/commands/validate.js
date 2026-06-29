import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, resolveConfig } from "@checkr/core";
import { deriveCheckExport, deriveFixExport, toAbsolute } from "@checkr/helpers";
import { cliToConfigPatch } from "../argv/cli-to-config-patch.js";

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string[]} positionals
 * @param {string} cwd
 */
export async function validateCommand(flags, positionals, cwd) {
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
  const fixesDir = /** @type {string} */ (config.fixesDir);

  let fail = 0;

  fail += await validateDir(toAbsolute(checksDir, cwd), "check_", deriveCheckExport);

  fail += await validateDir(toAbsolute(fixesDir, cwd), "fix_", deriveFixExport);

  if (fail > 0) {
    process.exitCode = 1;
  }
}

/**
 * @param {string} dir
 * @param {string} prefix
 * @param {(filename: string) => string} deriveExport
 * @returns {Promise<number>}
 */
async function validateDir(dir, prefix, deriveExport) {
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch {
    return 0;
  }

  let fail = 0;

  for (const filename of entries.sort()) {
    if (!filename.endsWith(".js")) continue;

    if (!filename.startsWith(prefix)) {
      console.log(`❌ ${filename} — filename must start with "${prefix}"`);
      fail++;
      continue;
    }

    const filePath = path.join(dir, filename);
    let mod;
    try {
      mod = await import(pathToFileURL(filePath).href);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`❌ ${filename} — failed to load: ${message}`);
      fail++;
      continue;
    }

    const exportName = deriveExport(filename);
    const fn = mod[exportName];
    const fnPrefix = prefix === "check_" ? "check" : "fix";

    if (typeof fn !== "function") {
      console.log(`❌ ${filename} — no exported function ${exportName}(source, filePath)`);
      fail++;
      continue;
    }

    const fnExports = Object.keys(mod).filter(
      (k) => k.startsWith(fnPrefix) && typeof mod[k] === "function",
    );

    if (fnExports.length > 1 && prefix === "check_") {
      console.log(
        `❌ ${filename} — exports ${fnExports.length} check functions: ${fnExports.join(", ")}`,
      );
      fail++;
      continue;
    }

    console.log(`✅ ${filename} — exports ${exportName}(source, filePath)`);
  }

  return fail;
}
