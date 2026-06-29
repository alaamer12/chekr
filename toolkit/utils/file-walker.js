/**
 * Recursively walks the workspace file tree and yields file paths
 * matching a given set of extensions.
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { IGNORED_DIRS, IGNORED_PATHS } from "./constants.js";

/**
 * Walk a directory recursively and return all matching file paths.
 *
 * @param {string} rootDir - Directory to start from (absolute or relative to CWD)
 * @param {string[]} extensions - File extensions to include e.g. ['.ts', '.tsx', '.md']
 * @returns {string[]} Sorted array of matching file paths (relative to CWD, forward slashes)
 */
export function walkFiles(rootDir, extensions) {
	const absoluteRoot = resolve(rootDir);
	const cwd = resolve(".");
	const results = [];

	// Handle single file case
	try {
		const rootStats = statSync(absoluteRoot);
		if (rootStats.isFile()) {
			const hasMatchingExt = extensions.some(ext => absoluteRoot.endsWith(ext));
			if (hasMatchingExt) {
				const relativePath = relative(cwd, absoluteRoot).replace(/\\/g, "/");
				return [relativePath];
			}
			return [];
		}
	} catch {
		return [];
	}

	function walk(dir) {
		let entries;
		try {
			entries = readdirSync(dir);
		} catch {
			// Skip directories we can't read
			return;
		}

		for (const entry of entries) {
			const fullPath = join(dir, entry);

			let stats;
			try {
				stats = statSync(fullPath);
			} catch {
				// Skip entries we can't stat
				continue;
			}

			if (stats.isDirectory()) {
				// Skip ignored directories
				if (IGNORED_DIRS.has(entry)) {
					continue;
				}
				const relativeDir = relative(cwd, fullPath).replace(/\\/g, "/");
				if (IGNORED_PATHS.has(relativeDir)) {
					continue;
				}
				walk(fullPath);
			} else if (stats.isFile()) {
				// Check if file matches any of the extensions
				const hasMatchingExt = extensions.some(ext => fullPath.endsWith(ext));
				if (hasMatchingExt) {
					// Store relative path from CWD (not from rootDir) with forward slashes
					const relativePath = relative(cwd, fullPath).replace(/\\/g, "/");
					results.push(relativePath);
				}
			}
		}
	}

	walk(absoluteRoot);

	// Return sorted for deterministic output
	return results.sort();
}
