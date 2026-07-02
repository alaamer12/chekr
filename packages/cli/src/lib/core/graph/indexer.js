/**
 * Code Graph Context (CGC) — File indexer.
 *
 * Parses files to extract structural information (imports, exports, symbols)
 * and populates the graph database.
 *
 * Handles edge cases:
 * - Binary/corrupted files (skipped with warning)
 * - Semi-structured files (partial indexing)
 * - Scope changes (detects new/removed files vs. cached state)
 *
 * @module graph/indexer
 */

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { EXTENSION_LANGUAGE_MAP, INDEXABLE_EXTENSIONS } from "./schema.js";

/**
 * @typedef {object} FileNode
 * @property {string} path
 * @property {string} contentHash
 * @property {number} lastModified
 * @property {number} loc
 * @property {string} language
 * @property {boolean} isEntryPoint
 */

/**
 * @typedef {object} SymbolNode
 * @property {string} id
 * @property {string} name
 * @property {string} kind
 * @property {string} filePath
 * @property {number} line
 * @property {boolean} isDefault
 */

/**
 * @typedef {object} ImportEdge
 * @property {string} fromPath
 * @property {string} toSpecifier
 * @property {boolean} isDynamic
 */

/**
 * @typedef {object} IndexResult
 * @property {FileNode} file
 * @property {SymbolNode[]} symbols
 * @property {ImportEdge[]} imports
 * @property {string[]} warnings
 * @property {boolean} skipped
 * @property {string} [skipReason]
 */

/** Maximum file size to index (10 MB). Anything larger is skipped. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Threshold ratio of null bytes to detect binary files. */
const BINARY_THRESHOLD = 0.01;

/** Maximum bytes to sample for binary detection. */
const BINARY_SAMPLE_SIZE = 8192;

/**
 * Check if a buffer contains binary (non-human-readable) content.
 * Samples the first N bytes and checks for null bytes and high-ratio
 * non-printable characters.
 *
 * @param {Buffer} buffer
 * @returns {{ isBinary: boolean, reason?: string }}
 */
export function detectBinary(buffer) {
  if (buffer.length === 0) {
    return { isBinary: false };
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, BINARY_SAMPLE_SIZE));
  let nullCount = 0;
  let controlCount = 0;

  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    if (byte === 0) {
      nullCount++;
    } else if (byte < 8 || (byte > 13 && byte < 32 && byte !== 27)) {
      controlCount++;
    }
  }

  const nullRatio = nullCount / sample.length;
  if (nullRatio > BINARY_THRESHOLD) {
    return {
      isBinary: true,
      reason: `null byte ratio ${(nullRatio * 100).toFixed(1)}% exceeds threshold`,
    };
  }

  const controlRatio = controlCount / sample.length;
  if (controlRatio > 0.1) {
    return {
      isBinary: true,
      reason: `control character ratio ${(controlRatio * 100).toFixed(1)}% indicates binary`,
    };
  }

  return { isBinary: false };
}

/**
 * Check if content appears to be semi-structured (minified, generated, etc.).
 * Semi-structured files are indexed with reduced depth.
 *
 * @param {string} source
 * @returns {{ isSemiStructured: boolean, reason?: string }}
 */
export function detectSemiStructured(source) {
  const lines = source.split("\n");

  // Very long average line length suggests minified code
  if (lines.length > 0) {
    const avgLineLength = source.length / lines.length;
    if (avgLineLength > 500) {
      return { isSemiStructured: true, reason: "average line length >500 chars (likely minified)" };
    }
  }

  // Very few lines but large file suggests bundled/minified
  if (source.length > 50000 && lines.length < 100) {
    return { isSemiStructured: true, reason: "large file with very few lines (likely bundled)" };
  }

  // Check for generated file markers
  const firstLines = lines.slice(0, 5).join("\n");
  if (
    firstLines.includes("@generated") ||
    firstLines.includes("AUTO-GENERATED") ||
    firstLines.includes("DO NOT EDIT") ||
    firstLines.includes("This file is generated")
  ) {
    return { isSemiStructured: true, reason: "generated file marker detected" };
  }

  return { isSemiStructured: false };
}

/**
 * Compute SHA-256 hash of file content.
 * @param {string} content
 * @returns {string}
 */
export function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Detect language from file extension.
 * @param {string} filePath
 * @returns {string}
 */
export function detectLanguage(filePath) {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] || "unknown";
}

/**
 * Check if a file extension is indexable for code structure.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isIndexableFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  return INDEXABLE_EXTENSIONS.has(ext);
}

// ─── Import/Export Extraction ───────────────────────────────────────────────

/**
 * Regex patterns for import extraction.
 * Handles: ESM import, require(), dynamic import().
 */
const IMPORT_PATTERNS = [
  // ESM: import X from 'specifier'
  // ESM: import { X } from 'specifier'
  // ESM: import 'specifier' (side-effect)
  /import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g,
  // CommonJS: require('specifier')
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // Dynamic import: import('specifier')
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Regex patterns for export extraction.
 */
const _EXPORT_PATTERNS = [
  // export function name
  /export\s+(?:async\s+)?function\s+(\w+)/g,
  // export class name
  /export\s+class\s+(\w+)/g,
  // export const/let/var name
  /export\s+(?:const|let|var)\s+(\w+)/g,
  // export default function/class name
  /export\s+default\s+(?:(?:async\s+)?function|class)\s+(\w+)/g,
  // export default (anonymous) — no name to capture
  // Named exports: export { name1, name2 }
  /export\s*\{([^}]+)\}/g,
];

/**
 * Extract import specifiers from source code.
 *
 * @param {string} source
 * @returns {ImportEdge[]}
 */
export function extractImports(source) {
  const imports = [];
  const seen = new Set();

  for (const pattern of IMPORT_PATTERNS) {
    // Reset lastIndex for each new search
    const regex = new RegExp(pattern.source, pattern.flags);
    for (let match = regex.exec(source); match !== null; match = regex.exec(source)) {
      const specifier = match[1];
      if (!specifier || seen.has(specifier)) continue;
      seen.add(specifier);

      const isDynamic = match[0].startsWith("import(") || match[0].startsWith("import (");
      imports.push({
        fromPath: "", // filled by caller
        toSpecifier: specifier,
        isDynamic,
      });
    }
  }

  return imports;
}

/**
 * Extract exported symbols from source code.
 *
 * @param {string} source
 * @param {string} filePath
 * @returns {SymbolNode[]}
 */
export function extractExports(source, filePath) {
  const symbols = [];
  const seen = new Set();

  // Named exports (function, class, const)
  const namedPatterns = [
    { regex: /export\s+(?:async\s+)?function\s+(\w+)/g, kind: "function" },
    { regex: /export\s+class\s+(\w+)/g, kind: "class" },
    { regex: /export\s+(?:const|let|var)\s+(\w+)/g, kind: "variable" },
  ];

  for (const { regex, kind } of namedPatterns) {
    for (let match = regex.exec(source); match !== null; match = regex.exec(source)) {
      const name = match[1];
      if (seen.has(name)) continue;
      seen.add(name);

      const line = source.substring(0, match.index).split("\n").length;
      symbols.push({
        id: `${filePath}::${name}`,
        name,
        kind,
        filePath,
        line,
        isDefault: false,
      });
    }
  }

  // Default exports with names
  const defaultRegex = /export\s+default\s+(?:(?:async\s+)?function|class)\s+(\w+)/g;
  for (let match = defaultRegex.exec(source); match !== null; match = defaultRegex.exec(source)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);

    const line = source.substring(0, match.index).split("\n").length;
    symbols.push({
      id: `${filePath}::${name}`,
      name,
      kind: "default",
      filePath,
      line,
      isDefault: true,
    });
  }

  // Named re-exports: export { x, y as z }
  const reExportRegex = /export\s*\{([^}]+)\}/g;
  for (let match = reExportRegex.exec(source); match !== null; match = reExportRegex.exec(source)) {
    // Skip re-exports that have "from" (those are pass-through)
    const afterBrace = source.substring(
      match.index + match[0].length,
      match.index + match[0].length + 30,
    );
    if (afterBrace.trim().startsWith("from")) continue;

    const names = match[1].split(",").map((s) => {
      const parts = s.trim().split(/\s+as\s+/);
      return parts[parts.length - 1].trim();
    });

    for (const name of names) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      symbols.push({
        id: `${filePath}::${name}`,
        name,
        kind: "variable",
        filePath,
        line: source.substring(0, match.index).split("\n").length,
        isDefault: false,
      });
    }
  }

  return symbols;
}

/**
 * Index a single file — read, validate, parse, and return graph data.
 *
 * @param {string} filePath — relative path from project root
 * @param {string} cwd — project root absolute path
 * @returns {IndexResult}
 */
export function indexFile(filePath, cwd) {
  const absolutePath = filePath.startsWith("/") ? filePath : `${cwd}/${filePath}`;
  const warnings = [];

  // 1. Check file stats
  let stat;
  try {
    stat = statSync(absolutePath);
  } catch (err) {
    return {
      file: null,
      symbols: [],
      imports: [],
      warnings: [`Cannot stat file: ${err.message}`],
      skipped: true,
      skipReason: "unreadable",
    };
  }

  if (stat.size > MAX_FILE_SIZE) {
    return {
      file: null,
      symbols: [],
      imports: [],
      warnings: [`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`],
      skipped: true,
      skipReason: "too-large",
    };
  }

  // 2. Read raw buffer for binary detection
  let buffer;
  try {
    buffer = readFileSync(absolutePath);
  } catch (err) {
    return {
      file: null,
      symbols: [],
      imports: [],
      warnings: [`Cannot read file: ${err.message}`],
      skipped: true,
      skipReason: "unreadable",
    };
  }

  // 3. Binary detection
  const binaryCheck = detectBinary(buffer);
  if (binaryCheck.isBinary) {
    return {
      file: null,
      symbols: [],
      imports: [],
      warnings: [`Binary file skipped: ${binaryCheck.reason}`],
      skipped: true,
      skipReason: "binary",
    };
  }

  // 4. Decode to string
  const source = buffer.toString("utf8");
  const contentHash = hashContent(source);
  const loc = source.split("\n").length;
  const language = detectLanguage(filePath);

  // 5. Build file node
  const fileNode = {
    path: filePath,
    contentHash,
    lastModified: Math.floor(stat.mtimeMs),
    loc,
    language,
    isEntryPoint: false, // determined later
  };

  // 6. Semi-structured detection — warn but still index
  const semiCheck = detectSemiStructured(source);
  if (semiCheck.isSemiStructured) {
    warnings.push(`Semi-structured: ${semiCheck.reason}`);
  }

  // 7. Extract imports and exports (only for indexable code files)
  let symbols = [];
  let imports = [];

  if (isIndexableFile(filePath) && !semiCheck.isSemiStructured) {
    imports = extractImports(source).map((imp) => ({
      ...imp,
      fromPath: filePath,
    }));
    symbols = extractExports(source, filePath);
  } else if (isIndexableFile(filePath) && semiCheck.isSemiStructured) {
    // Reduced indexing for semi-structured: only top-level imports
    imports = extractImports(source)
      .filter((imp) => !imp.isDynamic)
      .map((imp) => ({
        ...imp,
        fromPath: filePath,
      }));
  }

  return {
    file: fileNode,
    symbols,
    imports,
    warnings,
    skipped: false,
  };
}

/**
 * Batch index multiple files and return aggregated results.
 *
 * @param {string[]} filePaths — relative paths
 * @param {string} cwd — project root
 * @param {object} [options]
 * @param {(done: number, total: number, file: string) => void} [options.onProgress]
 * @returns {{ results: IndexResult[], stats: { indexed: number, skipped: number, warnings: number } }}
 */
export function batchIndex(filePaths, cwd, options = {}) {
  const results = [];
  let indexed = 0;
  let skipped = 0;
  let warningCount = 0;

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const result = indexFile(filePath, cwd);
    results.push(result);

    if (result.skipped) {
      skipped++;
    } else {
      indexed++;
    }
    warningCount += result.warnings.length;

    if (options.onProgress) {
      options.onProgress(i + 1, filePaths.length, filePath);
    }
  }

  return {
    results,
    stats: { indexed, skipped, warnings: warningCount },
  };
}
