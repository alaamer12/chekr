const INFRASTRUCTURE_DIRS = [
	"packages/toolkit",
	".kiro",
	".repertoire",
	".agent",
	".github",
	".vscode",
	".idea",
	".storybook",
	"__mocks__",
	"__stubs__",
];

/**
 * Normalises a file path to forward slashes for cross-platform comparison.
 */
export function normalisePath(path) {
	return path.replace(/\\/g, "/");
}

/**
 * Detects if the current script is being executed as the main entry point.
 * This is cross-platform safe (handles Windows drive letters and leading slashes).
 *
 * @param {string} importMetaUrl - The import.meta.url of the calling script
 * @returns {boolean}
 */
export function isMainEntryPoint(importMetaUrl) {
	const argv1 = process.argv[1];
	if (!argv1) return false;

	const normalisedArgv = normalisePath(argv1);
	const normalisedUrl = normalisePath(new URL(importMetaUrl).pathname);

	return normalisedUrl.includes(normalisedArgv);
}

/**
 * Checks if a file path belongs to an infrastructure directory (toolkit, docs, etc.)
 * that should be excluded from architectural audits.
 *
 * @param {string} filePath - Path to check
 * @returns {boolean}
 */
export function isInfrastructurePath(filePath) {
	const normalised = normalisePath(filePath);

	if (INFRASTRUCTURE_DIRS.some(dir => normalised.includes(dir))) {
		return true;
	}

	const parts = normalised.split("/");
	return parts.some(part => part.startsWith(".") && !part.includes(".ts") && !part.includes(".js"));
}
