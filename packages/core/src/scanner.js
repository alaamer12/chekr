import path from "node:path";
import { walkFiles } from "@checkr/utils";
import { isInsideDir, toAbsolute, normalizePosixPath } from "@checkr/helpers";
import {
  createGitignoreFilter,
  applyGitignoreFilter,
} from "./git/gitignore-filter.js";
import {
  getChangedPaths,
  getStagedPaths,
  isRepo,
} from "./git/git-service.js";
import { deriveExtensions, matchesAny } from "./glob-match.js";

/**
 * Scan files for a resolved step config.
 * @param {Record<string, unknown>} stepConfig
 * @param {Record<string, unknown>} globalConfig
 * @returns {Promise<string[]>}
 */
export async function scanFiles(stepConfig, globalConfig) {
  const cwd = /** @type {string} */ (globalConfig.cwd ?? process.cwd());
  const scanPath = /** @type {string} */ (
    stepConfig.scanPath ?? globalConfig.scanPath ?? "."
  );
  const scanMode = /** @type {string} */ (
    globalConfig.scanMode ?? "full"
  );

  const include = /** @type {string[] | undefined} */ (stepConfig.include);
  const exclude = /** @type {string[] | undefined} */ (stepConfig.exclude);
  const extensions = deriveExtensions(
    include,
    /** @type {string[] | undefined} */ (stepConfig.extensions),
  );

  const absoluteScan = toAbsolute(scanPath, cwd);
  let candidates = walkFiles(absoluteScan, extensions);

  const processCwd = path.resolve(".");
  const projectRoot = path.resolve(cwd);

  candidates = candidates.map((p) => {
    const absolute = path.resolve(processCwd, p);
    return normalizePosixPath(path.relative(projectRoot, absolute));
  });

  if (include?.length) {
    candidates = candidates.filter((p) => matchesAny(p, include));
  }

  if (exclude?.length) {
    candidates = candidates.filter((p) => !matchesAny(p, exclude));
  }

  const scope = /** @type {string[] | undefined} */ (stepConfig.scope);
  if (scope?.length) {
    candidates = candidates.filter((p) =>
      scope.some((prefix) => {
        const normalizedPrefix = normalizePosixPath(prefix);
        return (
          p.startsWith(normalizedPrefix) ||
          isInsideDir(toAbsolute(p, cwd), toAbsolute(normalizedPrefix, cwd))
        );
      }),
    );
  }

  const gitignorePath = stepConfig.gitignore ?? globalConfig.gitignore;
  if (gitignorePath) {
    const isIgnored = createGitignoreFilter(
      /** @type {string} */ (gitignorePath),
      cwd,
    );
    candidates = applyGitignoreFilter(candidates, isIgnored);
  }

  if (scanMode === "changed" || scanMode === "staged") {
    const inRepo = await isRepo(cwd);
    if (inRepo) {
      const gitPaths =
        scanMode === "staged"
          ? await getStagedPaths(cwd)
          : await getChangedPaths(cwd);
      const gitSet = new Set(gitPaths);
      candidates = candidates.filter((p) => gitSet.has(p));
    }
  }

  return candidates.sort();
}
