/**
 * Code Graph Context (CGC) — Pre-built graph queries.
 *
 * Provides high-level query functions that checks can use via `context.graph`.
 * All queries are Cypher and run against the LadybugDB/KuzuDB instance.
 *
 * @module graph/query
 */

/**
 * @typedef {import('./engine.js').GraphEngine} GraphEngine
 */

/**
 * @typedef {object} GraphQueryContext
 * @property {(filePath: string) => Promise<string[]>} getImportsOf
 * @property {(filePath: string) => Promise<string[]>} getImportersOf
 * @property {(filePath: string, maxDepth?: number) => Promise<string[]>} getDependencyTree
 * @property {(filePath: string, maxDepth?: number) => Promise<string[]>} getImpactRadius
 * @property {(filePaths: string[]) => Promise<string[]>} getAffectedFiles
 * @property {() => Promise<Array<{ path: string, count: number }>>} getMostImported
 * @property {() => Promise<string[][]>} getCircularDeps
 * @property {(cypher: string, params?: Record<string, unknown>) => Promise<unknown[]>} raw
 * @property {() => boolean} isAvailable
 */

/**
 * Create a high-level query context from a graph engine.
 * This is what gets exposed as `context.graph` to check functions.
 *
 * @param {GraphEngine} engine
 * @returns {GraphQueryContext}
 */
export function createQueryContext(engine) {
  return {
    /**
     * Get all files that a given file imports.
     * @param {string} filePath
     * @returns {Promise<string[]>}
     */
    async getImportsOf(filePath) {
      if (!engine.isAvailable()) return [];
      const rows = await engine.query(
        `MATCH (f:File {path: $path})-[:IMPORTS]->(target:File)
         RETURN target.path AS path`,
        { path: filePath },
      );
      return rows.map((r) => r.path);
    },

    /**
     * Get all files that import the given file (reverse lookup).
     * @param {string} filePath
     * @returns {Promise<string[]>}
     */
    async getImportersOf(filePath) {
      if (!engine.isAvailable()) return [];
      const rows = await engine.query(
        `MATCH (source:File)-[:IMPORTS]->(f:File {path: $path})
         RETURN source.path AS path`,
        { path: filePath },
      );
      return rows.map((r) => r.path);
    },

    /**
     * Get the full dependency tree of a file (what it transitively depends on).
     * @param {string} filePath
     * @param {number} [maxDepth=5]
     * @returns {Promise<string[]>}
     */
    async getDependencyTree(filePath, maxDepth = 5) {
      if (!engine.isAvailable()) return [];
      const rows = await engine.query(
        `MATCH (f:File {path: $path})-[:IMPORTS*1..${maxDepth}]->(dep:File)
         RETURN DISTINCT dep.path AS path`,
        { path: filePath },
      );
      return rows.map((r) => r.path);
    },

    /**
     * Get the "impact radius" — all files that transitively depend on this file.
     * When this file changes, these files might be affected.
     * @param {string} filePath
     * @param {number} [maxDepth=5]
     * @returns {Promise<string[]>}
     */
    async getImpactRadius(filePath, maxDepth = 5) {
      if (!engine.isAvailable()) return [];
      const rows = await engine.query(
        `MATCH (source:File)-[:IMPORTS*1..${maxDepth}]->(f:File {path: $path})
         RETURN DISTINCT source.path AS path`,
        { path: filePath },
      );
      return rows.map((r) => r.path);
    },

    /**
     * Given a set of changed files, get all files potentially affected.
     * Combines direct importers and transitive dependents.
     * @param {string[]} filePaths
     * @returns {Promise<string[]>}
     */
    async getAffectedFiles(filePaths) {
      if (!engine.isAvailable()) return [];
      if (filePaths.length === 0) return [];

      const affected = new Set();
      for (const fp of filePaths) {
        const importers = await this.getImpactRadius(fp, 3);
        for (const imp of importers) {
          affected.add(imp);
        }
      }
      // Remove the changed files themselves from the affected set
      for (const fp of filePaths) {
        affected.delete(fp);
      }
      return [...affected];
    },

    /**
     * Get the most-imported files (hub nodes in the dependency graph).
     * Useful for identifying critical files.
     * @returns {Promise<Array<{ path: string, count: number }>>}
     */
    async getMostImported() {
      if (!engine.isAvailable()) return [];
      const rows = await engine.query(
        `MATCH (source:File)-[:IMPORTS]->(target:File)
         RETURN target.path AS path, COUNT(source) AS count
         ORDER BY count DESC
         LIMIT 20`,
      );
      return rows.map((r) => ({ path: r.path, count: Number(r.count) }));
    },

    /**
     * Detect circular dependencies in the graph.
     * Returns arrays of file paths forming cycles.
     * @returns {Promise<string[][]>}
     */
    async getCircularDeps() {
      if (!engine.isAvailable()) return [];
      // Simple 2-hop cycle detection (A→B→A)
      const rows = await engine.query(
        `MATCH (a:File)-[:IMPORTS]->(b:File)-[:IMPORTS]->(a)
         WHERE a.path < b.path
         RETURN a.path AS fileA, b.path AS fileB`,
      );
      return rows.map((r) => [r.fileA, r.fileB]);
    },

    /**
     * Execute a raw Cypher query (for advanced/custom checks).
     * @param {string} cypher
     * @param {Record<string, unknown>} [params]
     * @returns {Promise<unknown[]>}
     */
    async raw(cypher, params = {}) {
      if (!engine.isAvailable()) return [];
      return engine.query(cypher, params);
    },

    /**
     * Check if the graph engine is available and initialized.
     * @returns {boolean}
     */
    isAvailable() {
      return engine.isAvailable();
    },
  };
}
