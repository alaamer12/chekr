/**
 * matchesScope — cross-platform file path scope matching.
 *
 * Supports two pattern types:
 *   - Glob patterns containing ** (e.g. "GLOB_BLOCKIYAS" → matches any path with /blockiyas/ segment)
 *   - Prefix patterns (e.g. "capabilities/", "packages/")
 *
 * Normalises backslashes to forward slashes before matching so that
 * Windows paths (e.g. "panels\\welcome\\blockiyas\\...") are correctly
 * matched by forward-slash glob patterns.
 *
 * @param {string} filePath - File path to test (may contain backslashes on Windows)
 * @param {string[]} scope - Array of glob or prefix patterns
 * @returns {boolean}
 */
export function matchesScope(filePath, scope) {
	// Normalise to forward slashes for cross-platform glob matching
	const normalisedPath = filePath.replace(/\\/g, "/");
	return scope.some(pattern => {
		if (pattern.includes("**")) {
			// Glob pattern — escape special regex chars except * and **
			const regexPattern = pattern
				.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
				.replace(/\*\*/g, "___DOUBLESTAR___")
				.replace(/\*/g, "[^/]*")
				.replace(/___DOUBLESTAR___/g, ".*");

			const regex = new RegExp(`^${regexPattern}$`);
			return regex.test(normalisedPath);
		}
		// Prefix match — also normalised
		return normalisedPath.startsWith(pattern);
	});
}
