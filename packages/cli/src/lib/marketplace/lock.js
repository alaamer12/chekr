import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const LOCK_FILE_NAME = "marketplace.lock.json";

/**
 * @param {string} cwd
 * @returns {string}
 */
export function getLockFilePath(cwd) {
  return path.join(cwd, ".chekr", LOCK_FILE_NAME);
}

/**
 * @param {string} cwd
 * @returns {Promise<import('../../../../types/marketplace.js').MarketplaceLockFile>}
 */
export async function readLockFile(cwd) {
  const filePath = getLockFilePath(cwd);
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    return {
      version: 1,
      installed: [],
    };
  }
}

/**
 * @param {string} cwd
 * @param {import('../../../../types/marketplace.js').MarketplaceLockFile} lockFile
 */
export async function writeLockFile(cwd, lockFile) {
  const filePath = getLockFilePath(cwd);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(lockFile, null, 2));
}

/**
 * @param {import('../../../../types/marketplace.js').MarketplaceLockFile} lockFile
 * @param {string} id
 */
export function findLockEntry(lockFile, id) {
  return lockFile.installed.find((entry) => entry.id === id);
}

/**
 * @param {import('../../../../types/marketplace.js').MarketplaceLockFile} lockFile
 * @param {import('../../../../types/marketplace.js').MarketplaceLockEntry} entry
 */
export function upsertLockEntry(lockFile, entry) {
  const index = lockFile.installed.findIndex((e) => e.id === entry.id);
  if (index !== -1) {
    lockFile.installed[index] = entry;
  } else {
    lockFile.installed.push(entry);
  }
}
