/**
 * Git-scoped incremental cache for check-violations (check-all.js).
 * Per branch + step: stores content hashes for files that passed on the last run.
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TOOLKIT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_CACHE_ROOT = join(TOOLKIT_ROOT, ".cache", "check-violations");

/**
 * @param {string} content
 * @returns {string}
 */
export function contentHash(content) {
	return createHash("sha256").update(content).digest("hex");
}

/**
 * @param {string} branch
 * @returns {string}
 */
export function sanitizeBranchName(branch) {
	const trimmed = (branch ?? "").trim();
	if (!trimmed) return "unknown";
	return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

/**
 * @param {{ head: string, status: string }} params
 * @returns {string}
 */
export function buildStatusFingerprint({ head, status }) {
	return createHash("sha256").update(`${head}\n${status}`).digest("hex").slice(0, 16);
}

/**
 * @typedef {{ branch: string, head: string, status: string, statusFingerprint: string }} GitContext
 */

/**
 * @param {(cmd: string, args: string[]) => Promise<{ stdout: string }>} execGit
 * @returns {Promise<GitContext | null>}
 */
export async function getGitContext(execGit = defaultExecGit) {
	const branch = (await execGit("git", ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
	const head = (await execGit("git", ["rev-parse", "HEAD"])).stdout.trim();
	const status = (await execGit("git", ["status", "--porcelain"])).stdout;
	return {
		branch,
		head,
		status,
		statusFingerprint: buildStatusFingerprint({ head, status }),
	};
}

/**
 * @param {string} baseHead
 * @param {string} currentHead
 * @param {Function} [execGit]
 * @returns {Promise<Set<string> | null>}
 */
export async function getChangedPathsSince(baseHead, currentHead, execGit = defaultExecGit) {
	try {
		const { stdout } = await execGit("git", ["diff", "--name-only", baseHead, currentHead]);
		const diffPaths = stdout.split("\n").map(l => l.trim().replace(/\\/g, "/")).filter(Boolean);
		return new Set(diffPaths);
	} catch {
		return null; // indicates failure
	}
}

/**
 * @param {(cmd: string, args: string[]) => Promise<{ stdout: string }>} [execGit]
 * @returns {Promise<boolean>}
 */
export async function isGitAvailable(execGit = defaultExecGit) {
	try {
		await execGit("git", ["--version"]);
		return true;
	} catch {
		return false;
	}
}

async function defaultExecGit(cmd, args) {
	const { stdout } = await execFileAsync(cmd, args, {
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	});
	return { stdout: stdout ?? "" };
}

/**
 * @param {string} cacheRoot
 * @param {GitContext} gitContext
 * @param {string} stepName
 * @returns {string}
 */
export function stepCachePath(cacheRoot, gitContext, stepName) {
	const branchDir = join(cacheRoot, sanitizeBranchName(gitContext.branch), "steps");
	return join(branchDir, `${stepName}.json`);
}

/**
 * Step cache stays valid for the same commit on the same branch.
 * Working-tree dirtiness is handled per file via `parseModifiedPathsFromStatus` —
 * do NOT invalidate the whole step when unrelated files change in `git status`.
 *
 * @param {object | null} stepCache
 * @param {GitContext} gitContext
 * @returns {boolean}
 */
export function isStepCacheValid(stepCache, gitContext) {
	if (gitContext.forceFullScan) return false;
	if (!stepCache?.meta?.head) return false;

	const currentBranch = sanitizeBranchName(gitContext.branch);
	const cachedBranch = stepCache.meta.branch;
	if (cachedBranch !== undefined && cachedBranch !== currentBranch) {
		return false;
	}

	return true;
}

/**
 * Paths appearing in `git status --porcelain` (normalized to forward slashes).
 *
 * @param {string} status
 * @returns {Set<string>}
 */
/** Paths that must not force per-file recheck (toolkit cache output, etc.). */
const CACHE_EXEMPT_PATH_PREFIXES = ["packages/toolkit/.cache/"];

/**
 * @param {string} status
 * @returns {Set<string>}
 */
export function parseModifiedPathsFromStatus(status) {
	const modified = new Set();
	for (const line of status.split("\n")) {
		if (!line.trim()) continue;
		const pathPart = line.slice(3).trim();
		const path = pathPart.includes(" -> ") ? pathPart.split(" -> ").pop() : pathPart;
		const normalized = path.replace(/\\/g, "/");
		if (CACHE_EXEMPT_PATH_PREFIXES.some(prefix => normalized.startsWith(prefix))) {
			continue;
		}
		modified.add(normalized);
	}
	return modified;
}

/**
 * Decide which files need per-file checks.
 * Uses git status to skip unchanged tracked files; optional content-hash map for explicit verification.
 *
 * @param {string[]} filePaths
 * @param {Record<string, string> | undefined} cachedFiles
 * @param {Set<string>} modifiedPaths
 * @param {Map<string, string>} [currentHashes]
 * @returns {{ toCheck: string[], skipped: string[] }}
 */
export function partitionFilesByCache(filePaths, cachedFiles, modifiedPaths, currentHashes = new Map()) {
	const toCheck = [];
	const skipped = [];

	for (const file of filePaths) {
		const cachedHash = cachedFiles?.[file];
		if (!cachedHash) {
			toCheck.push(file);
			continue;
		}

		if (modifiedPaths.has(file)) {
			toCheck.push(file);
			continue;
		}

		const liveHash = currentHashes.get(file);
		if (liveHash !== undefined && liveHash !== cachedHash) {
			toCheck.push(file);
			continue;
		}

		skipped.push(file);
	}

	return { toCheck, skipped };
}

/**
 * Whether a repo-level check must run (any scoped file missing or changed vs cache).
 *
 * @param {string[]} scopedFiles
 * @param {Record<string, string> | undefined} cachedFiles
 * @param {Set<string>} modifiedPaths
 * @param {Map<string, string>} [currentHashes]
 * @returns {boolean}
 */
export function needsRepoLevelCheck(scopedFiles, cachedFiles, modifiedPaths, currentHashes = new Map()) {
	return partitionFilesByCache(scopedFiles, cachedFiles, modifiedPaths, currentHashes).toCheck.length > 0;
}

/**
 * @param {string} cachePath
 * @returns {Promise<object | null>}
 */
export async function loadStepCache(cachePath) {
	try {
		const raw = await readFile(cachePath, "utf8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

/**
 * @param {string} cachePath
 * @param {GitContext} gitContext
 * @param {Record<string, string>} files
 * @param {any[]} [violations=[]]
 * @returns {Promise<void>}
 */
export async function saveStepCache(cachePath, gitContext, files, violations = []) {
	const payload = {
		meta: {
			head: gitContext.head,
			branch: sanitizeBranchName(gitContext.branch),
			statusFingerprint: gitContext.statusFingerprint,
			savedAt: new Date().toISOString(),
		},
		files,
		violations,
	};
	await mkdir(dirname(cachePath), { recursive: true });
	await writeFile(cachePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * Synchronous version for use during process termination (SIGINT).
 *
 * @param {string} cachePath
 * @param {GitContext} gitContext
 * @param {Record<string, string>} files
 * @param {any[]} [violations=[]]
 */
export function saveStepCacheSync(cachePath, gitContext, files, violations = []) {
	const payload = {
		meta: {
			head: gitContext.head,
			branch: sanitizeBranchName(gitContext.branch),
			statusFingerprint: gitContext.statusFingerprint,
			savedAt: new Date().toISOString(),
		},
		files,
		violations,
	};
	mkdirSync(dirname(cachePath), { recursive: true });
	writeFileSync(cachePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * @param {string} cacheRoot
 * @returns {Promise<void>}
 */
export async function clearCacheDir(cacheRoot = DEFAULT_CACHE_ROOT) {
	await rm(cacheRoot, { recursive: true, force: true });
}

/**
 * @param {string} head
 * @returns {string}
 */
export function shortHead(head) {
	return (head ?? "").slice(0, 7) || "unknown";
}

/**
 * Reads `meta` from any step cache file saved for this branch (all steps share the same HEAD).
 *
 * @param {string} cacheRoot
 * @param {GitContext} gitContext
 * @returns {Promise<object | null>}
 */
export async function getBranchCacheMeta(cacheRoot, gitContext) {
	const branchDir = join(cacheRoot, sanitizeBranchName(gitContext.branch), "steps");
	try {
		const entries = await readdir(branchDir);
		const jsonFile = entries.find(entry => entry.endsWith(".json"));
		if (!jsonFile) return null;
		const stepCache = await loadStepCache(join(branchDir, jsonFile));
		return stepCache?.meta ?? null;
	} catch {
		return null;
	}
}

/**
 * Human-readable summary of whether incremental cache applies on this run.
 *
 * @param {GitContext} gitContext
 * @param {object | null} branchMeta
 * @param {number} modifiedPathCount
 * @returns {string}
 */
export function formatIncrementalCacheBanner(gitContext, branchMeta, modifiedPathCount) {
	const branch = gitContext.branch;
	const current = shortHead(gitContext.head);

	if (!branchMeta?.head) {
		return `Incremental cache: commit ${current} on ${branch} — no saved results for this branch yet (full scan, then cache is written).`;
	}

	const previous = shortHead(branchMeta.head);
	const extra = branchMeta.head !== gitContext.head ? ` (based on previous cache for ${previous})` : "";

	if (modifiedPathCount === 0) {
		return `Incremental cache: commit ${current} on ${branch}${extra} — reusing saved results (clean working tree).`;
	}

	return `Incremental cache: commit ${current} on ${branch}${extra} — reusing saved results; rechecking ${modifiedPathCount} changed/dirty path(s).`;
}
