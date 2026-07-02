/**
 * Code Graph Context (CGC) — Schema definitions.
 *
 * Defines node tables and relationship tables for the code graph.
 * Uses Cypher DDL compatible with LadybugDB / KuzuDB.
 *
 * @module graph/schema
 */

/** Current schema version — bump on breaking changes to force re-index. */
export const SCHEMA_VERSION = 1;

/**
 * Node table DDL statements.
 * Order matters — create nodes before relationships that reference them.
 */
export const NODE_TABLES = [
  `CREATE NODE TABLE IF NOT EXISTS File (
    path STRING,
    contentHash STRING,
    lastModified INT64,
    loc INT32,
    language STRING,
    isEntryPoint BOOL,
    PRIMARY KEY(path)
  )`,
  `CREATE NODE TABLE IF NOT EXISTS Symbol (
    id STRING,
    name STRING,
    kind STRING,
    filePath STRING,
    line INT32,
    isDefault BOOL,
    PRIMARY KEY(id)
  )`,
  `CREATE NODE TABLE IF NOT EXISTS Token (
    id STRING,
    name STRING,
    value STRING,
    filePath STRING,
    line INT32,
    PRIMARY KEY(id)
  )`,
];

/**
 * Relationship table DDL statements.
 */
export const REL_TABLES = [
  `CREATE REL TABLE IF NOT EXISTS IMPORTS (
    FROM File TO File,
    specifier STRING,
    isDynamic BOOL
  )`,
  `CREATE REL TABLE IF NOT EXISTS EXPORTS (
    FROM File TO Symbol
  )`,
  `CREATE REL TABLE IF NOT EXISTS USES_TOKEN (
    FROM File TO Token
  )`,
  `CREATE REL TABLE IF NOT EXISTS DEPENDS_ON (
    FROM File TO File,
    depth INT32
  )`,
];

/**
 * All DDL statements in execution order.
 */
export const ALL_DDL = [...NODE_TABLES, ...REL_TABLES];

/**
 * Drop all tables (for reset/rebuild).
 */
export const DROP_ALL = [
  "DROP TABLE IF EXISTS DEPENDS_ON",
  "DROP TABLE IF EXISTS USES_TOKEN",
  "DROP TABLE IF EXISTS EXPORTS",
  "DROP TABLE IF EXISTS IMPORTS",
  "DROP TABLE IF EXISTS Token",
  "DROP TABLE IF EXISTS Symbol",
  "DROP TABLE IF EXISTS File",
];

/**
 * Supported file languages derived from extension.
 * @type {Record<string, string>}
 */
export const EXTENSION_LANGUAGE_MAP = {
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "typescript",
  ".vue": "vue",
  ".svelte": "svelte",
  ".astro": "astro",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".md": "markdown",
  ".mdx": "markdown",
  ".html": "html",
};

/**
 * Extensions that are indexable (contain importable code structure).
 * @type {Set<string>}
 */
export const INDEXABLE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".vue",
  ".svelte",
  ".astro",
]);
