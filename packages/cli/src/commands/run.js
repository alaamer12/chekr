import fs from "node:fs";
import { mkdir, rm, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { cliToConfigPatch } from "../argv/cli-to-config-patch.js";
import { ENGINE_DEFAULTS, loadConfig, resolveConfig, run } from "../lib/core/engine.js";
import { toAbsolute } from "../lib/helpers/index.js";

async function acquireLock(lockPath) {
  let acquired = false;
  
  while (!acquired) {
    try {
      const fh = await open(lockPath, "wx");
      await fh.write(String(process.pid));
      await fh.close();
      acquired = true;
    } catch (err) {
      if (err.code === "EEXIST") {
        try {
          const pidStr = await readFile(lockPath, "utf8");
          const pid = parseInt(pidStr.trim(), 10);
          if (!isNaN(pid)) {
            let isRunning = false;
            try {
              process.kill(pid, 0); // Tests if process exists
              isRunning = true;
            } catch (e) {
              // Process not found
            }
            if (isRunning) {
              console.error("\n❌ Another instance of Chekr is already running in this workspace.");
              console.error(`   (Process ID: ${pid})\n`);
              process.exit(1);
            }
          }
          // Stale lock: delete and retry
          await unlink(lockPath).catch(() => {});
        } catch (e) {
          // File might have just been deleted by the owner, sleep briefly and retry
          await new Promise(r => setTimeout(r, 100));
        }
      } else {
        throw err;
      }
    }
  }

  const releaseLock = () => {
    try {
      fs.unlinkSync(lockPath);
    } catch (e) {}
  };

  // Ensure lock is released on abnormal exits
  const sigintHandler = () => {
    releaseLock();
    process.exit(1);
  };
  process.once("SIGINT", sigintHandler);
  
  return {
    releaseLock: () => {
      process.removeListener("SIGINT", sigintHandler);
      releaseLock();
    }
  };
}

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string[]} positionals
 * @param {string} cwd
 */
export async function runCommand(flags, positionals, cwd) {
  // Guard: catch `chekr run <subcommand>` mistakes
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

  // Resolve cacheDir from config so the lock file lives inside the cache folder
  let cacheDir = ENGINE_DEFAULTS.cacheDir;
  try {
    const fileConfig = patch.configPath
      ? await loadConfig(/** @type {string} */ (patch.configPath), cwd)
      : await loadConfig(undefined, cwd);
    const resolved = resolveConfig(fileConfig, patch, { cwd });
    cacheDir = /** @type {string} */ (resolved.cacheDir ?? ENGINE_DEFAULTS.cacheDir);
  } catch {
    // use default cache dir
  }
  const cacheDirAbs = toAbsolute(cacheDir, cwd);
  await mkdir(cacheDirAbs, { recursive: true });
  const lockPath = path.join(cacheDirAbs, ".chekr.lock");
  const { releaseLock } = await acquireLock(lockPath);

  try {
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
  } finally {
    releaseLock();
  }
}
