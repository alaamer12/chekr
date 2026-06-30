import { writeFile, mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../lib/core/config/load-config.js";
import { resolveConfig } from "../lib/core/config/resolve-config.js";
import { readLockFile, writeLockFile, findLockEntry, upsertLockEntry } from "../lib/marketplace/lock.js";
import readline from "node:readline";

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string[]} positionals
 * @param {string} cwd
 */
export async function installCommand(flags, positionals, cwd) {
  const checkId = positionals[0];
  if (!checkId) {
    throw new Error("Missing check ID. Usage: chekr install <check-id>");
  }

  const rawConfig = await loadConfig(/** @type {string} */ (flags.config), cwd);
  const config = resolveConfig(rawConfig, cwd);
  const { marketplace, checksDir } = config;

  if (!marketplace.repository) {
    throw new Error("Marketplace repository not configured in chekr.config.js");
  }

  const [owner, repo] = marketplace.repository.split("/");
  const branch = marketplace.branch || "main";
  const token = process.env.GITHUB_TOKEN;

  // 1. Fetch registry
  console.log(`Fetching registry from ${marketplace.repository}...`);
  const registryUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/registry.json`;
  const fetchOptions = token ? { headers: { Authorization: `token ${token}` } } : {};
  const registryRes = await fetch(registryUrl, fetchOptions);
  if (!registryRes.ok) {
    throw new Error(`Failed to fetch marketplace registry from ${registryUrl}`);
  }
  
  /** @type {import('../../../../types/marketplace.js').MarketplaceRegistry} */
  const registry = await registryRes.json();
  const entry = registry.find((e) => e.id === checkId);

  if (!entry) {
    throw new Error(`Check '${checkId}' not found in marketplace registry.`);
  }

  // 2. Check lock file
  const lockFile = await readLockFile(cwd);
  const installed = findLockEntry(lockFile, checkId);

  if (installed && !flags.force) {
    if (installed.version === entry.version) {
      console.log(`${checkId} v${entry.version} is already installed. Use --force to reinstall.`);
      return;
    } else {
      const proceed = await askQuestion(`Upgrade available: v${installed.version} -> v${entry.version}. Proceed? [y/N] `);
      if (proceed.toLowerCase() !== "y") {
        console.log("Installation cancelled.");
        return;
      }
    }
  }

  console.log(`Installing ${entry.name} v${entry.version}...`);

  const installedFiles = [];
  const tempFiles = [];

  try {
    // 3. Download and write files
    for (const fileMap of entry.files) {
      const fileUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/rules/${entry.id}/${fileMap.dest}`;
      console.log(`  Downloading ${fileMap.dest}...`);
      
      const fileRes = await fetch(fileUrl, fetchOptions);
      if (!fileRes.ok) {
        throw new Error(`Failed to download ${fileMap.dest} from ${fileUrl}`);
      }

      const content = await fileRes.text();
      const destPath = path.resolve(checksDir, fileMap.dest);
      const tempPath = `${destPath}.tmp`;

      await mkdir(path.dirname(destPath), { recursive: true });
      await writeFile(tempPath, content);
      tempFiles.push({ temp: tempPath, final: destPath });
      installedFiles.push(path.relative(cwd, destPath));
    }

    // Atomic move
    for (const { temp, final } of tempFiles) {
      await rename(temp, final);
    }

    // 4. Update lock file
    upsertLockEntry(lockFile, {
      id: entry.id,
      version: entry.version,
      installedAt: new Date().toISOString(),
      repository: marketplace.repository,
      files: installedFiles,
    });
    await writeLockFile(cwd, lockFile);

    console.log(`\nSuccessfully installed ${entry.id} v${entry.version}`);
  } catch (err) {
    console.error(`\nInstallation failed: ${err.message}`);
    console.log("Cleaning up temporary files...");
    for (const { temp } of tempFiles) {
      try { await unlink(temp); } catch {}
    }
    throw err;
  }
}

/**
 * @param {string} query
 * @returns {Promise<string>}
 */
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}
