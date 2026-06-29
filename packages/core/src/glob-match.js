/**
 * Simple glob matching for include/exclude patterns.
 * Supports *, **, and {a,b} brace expansion.
 */

/**
 * Expand brace groups like *.{js,ts} → *.js, *.ts
 * @param {string} pattern
 * @returns {string[]}
 */
function expandBraces(pattern) {
  const match = pattern.match(/\{([^}]+)\}/);
  if (!match) return [pattern];

  const alternatives = match[1].split(",").map((s) => s.trim());
  return alternatives.flatMap((alt) =>
    expandBraces(pattern.replace(match[0], alt)),
  );
}

/**
 * Convert glob pattern to RegExp.
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegExp(glob) {
  let regex = "^";
  let i = 0;

  while (i < glob.length) {
    if (glob[i] === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        regex += "(?:.*/)?";
        i += 3;
      } else {
        regex += ".*";
        i += 2;
      }
      continue;
    }

    if (glob[i] === "*") {
      regex += "[^/]*";
      i += 1;
      continue;
    }

    if (glob[i] === "?") {
      regex += "[^/]";
      i += 1;
      continue;
    }

    regex += glob[i].replace(/[.+^${}()|[\]\\]/g, "\\$&");
    i += 1;
  }

  regex += "$";
  return new RegExp(regex);
}

/**
 * @param {string} filePath
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchGlob(filePath, pattern) {
  const normalized = filePath.replace(/\\/g, "/");
  const patterns = expandBraces(pattern);

  return patterns.some((p) => globToRegExp(p).test(normalized));
}

/**
 * @param {string} filePath
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function matchesAny(filePath, patterns) {
  if (!patterns?.length) return true;
  return patterns.some((p) => matchGlob(filePath, p));
}

/**
 * Derive file extensions from include patterns and explicit extensions.
 * @param {string[] | undefined} include
 * @param {string[] | undefined} extensions
 * @returns {string[]}
 */
export function deriveExtensions(include, extensions) {
  if (extensions?.length) {
    return extensions.map((ext) => (ext.startsWith(".") ? ext : `.${ext}`));
  }

  const derived = new Set([".js", ".jsx", ".ts", ".tsx"]);

  if (include?.length) {
    for (const pattern of include) {
      const braceMatch = pattern.match(/\{([^}]+)\}/);
      if (braceMatch) {
        for (const ext of braceMatch[1].split(",")) {
          const trimmed = ext.trim();
          derived.add(trimmed.startsWith(".") ? trimmed : `.${trimmed}`);
        }
      }
    }
  }

  return [...derived];
}
