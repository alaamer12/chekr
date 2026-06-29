/**
 * Dependency Boundary Check Example
 * 
 * Enforces architectural boundaries by preventing low-level packages (e.g., shared)
 * from importing from high-level ones (e.g., apps).
 * 
 * This demonstrates:
 * 1. High flexibility in defining custom logic.
 * 2. Professional reporting with logicalId, impact, and occurrences.
 */

/**
 * @param {string} source
 * @param {string} filePath
 * @param {import('chekr').RunContext} context
 */
export function checkDependencyBoundary(source, filePath, context) {
  // Only check files in packages/shared
  if (!filePath.includes('packages/shared')) {
    return;
  }

  const importRegex = /import\s+.*\s+from\s+['"](.*)['"]/g;
  let match;

  while ((match = importRegex.exec(source)) !== null) {
    const importPath = match[1];

    // Violation: shared package importing from apps/
    if (importPath.includes('apps/')) {
      const line = source.substring(0, match.index).split('\n').length;
      
      context.report({
        message: `Architectural violation: 'shared' package depends on 'apps'`,
        impact: "Circular dependencies and high coupling, making the shared package non-reusable.",
        severity: "error",
        file: filePath,
        line,
        text: match[0],
        // Use logicalId to group all illegal imports from apps/ into a single report category
        logicalId: `boundary:shared-to-apps`,
        data: {
          importedPath: importPath,
          forbiddenPattern: "apps/"
        }
      });
    }
  }
}
