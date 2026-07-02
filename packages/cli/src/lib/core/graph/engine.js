/**
 * Code Graph Context (CGC) — Engine wrapper.
 *
 * Manages the LadybugDB (or KuzuDB) connection lifecycle.
 * Handles graceful fallback when the native addon is unavailable.
 *
 * @module graph/engine
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_DDL, DROP_ALL, SCHEMA_VERSION } from "./schema.js";

/**
 * @typedef {object} GraphManifest
 * @property {number} schemaVersion
 * @property {string} engine
 * @property {string} lastIndexedCommit
 * @property {string} lastIndexedAt
 * @property {number} fileCount
 * @property {number} symbolCount
 * @property {number} edgeCount
 */

/**
 * @typedef {object} GraphEngine
 * @property {(cypher: string, params?: Record<string, unknown>) => Promise<unknown[]>} query
 * @property {() => Promise<void>} close
 * @property {() => Promise<void>} resetSchema
 * @property {() => boolean} isAvailable
 * @property {() => GraphManifest | null} getManifest
 * @property {(updates: Partial<GraphManifest>) => void} updateManifest
 */

const MANIFEST_FILE = "manifest.json";

/**
 * Try to import LadybugDB. Returns null if not available.
 *
 * Pre-checks for the native binary to avoid process.dlopen crashes
 * when the platform-specific .node file is missing.
 *
 * @returns {Promise<{ Database: any, Connection: any } | null>}
 */
async function loadDriver() {
  // Try LadybugDB
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const corePath = require.resolve("@ladybugdb/core");
    // Check if the native binary exists before importing
    const coreDir = corePath.substring(0, corePath.lastIndexOf("/"));
    const nativePath = join(coreDir, "lbugjs.node");
    if (!existsSync(nativePath)) {
      throw new Error("Native binary not found");
    }
    const mod = await import("@ladybugdb/core");
    return mod;
  } catch {
    // Fallback: try kuzu (original) as alternative
    try {
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      const corePath = require.resolve("kuzu");
      const coreDir = corePath.substring(0, corePath.lastIndexOf("/"));
      const nativePath = join(coreDir, "kuzu_native.node");
      if (!existsSync(nativePath)) {
        throw new Error("Native binary not found");
      }
      const mod = await import("kuzu");
      return mod;
    } catch {
      return null;
    }
  }
}

/**
 * Read the manifest from disk.
 * @param {string} graphDir
 * @returns {GraphManifest | null}
 */
function readManifest(graphDir) {
  const manifestPath = join(graphDir, MANIFEST_FILE);
  try {
    const raw = readFileSync(manifestPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write the manifest to disk.
 * @param {string} graphDir
 * @param {GraphManifest} manifest
 */
function writeManifest(graphDir, manifest) {
  const manifestPath = join(graphDir, MANIFEST_FILE);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/**
 * Create and initialize the graph engine.
 *
 * @param {string} graphDir — absolute path to graph database directory
 * @param {object} [options]
 * @param {boolean} [options.readOnly=false] — open in read-only mode
 * @returns {Promise<GraphEngine>}
 */
export async function createGraphEngine(graphDir, _options = {}) {
  const driver = await loadDriver();

  if (!driver) {
    return createUnavailableEngine();
  }

  mkdirSync(graphDir, { recursive: true });

  const dbPath = join(graphDir, "graph.db");
  /** @type {any} */
  let db;
  /** @type {any} */
  let conn;

  try {
    db = new driver.Database(dbPath);
    await db.init();
    conn = new driver.Connection(db);
    await conn.init();
  } catch (err) {
    console.error(`[CGC] Failed to open graph database: ${err.message}`);
    return createUnavailableEngine();
  }

  /**
   * Execute a Cypher query using the prepare+execute pattern.
   * @param {string} cypher
   * @param {Record<string, unknown>} [params]
   * @returns {Promise<any[]>}
   */
  async function execQuery(cypher, params = {}) {
    const ps = await conn.prepare(cypher);
    const result = await conn.execute(ps, params);
    if (result && typeof result.getAll === "function") {
      return await result.getAll();
    }
    return [];
  }

  // Check schema version — rebuild if mismatched
  const manifest = readManifest(graphDir);
  if (manifest && manifest.schemaVersion !== SCHEMA_VERSION) {
    // Schema changed — drop and rebuild
    for (const ddl of DROP_ALL) {
      try {
        await execQuery(ddl);
      } catch {
        // Ignore drop errors for non-existent tables
      }
    }
  }

  // Ensure schema exists
  for (const ddl of ALL_DDL) {
    try {
      await execQuery(ddl);
    } catch (err) {
      // Table might already exist — only throw on real errors
      if (!err.message?.includes("already exists")) {
        console.error(`[CGC] Schema DDL failed: ${err.message}`);
      }
    }
  }

  return {
    async query(cypher, params = {}) {
      try {
        return await execQuery(cypher, params);
      } catch (err) {
        throw new Error(`[CGC] Query failed: ${err.message}\nQuery: ${cypher}`);
      }
    },

    async close() {
      try {
        if (conn && typeof conn.close === "function") conn.close();
        if (db && typeof db.close === "function") db.close();
      } catch {
        // Best-effort cleanup
      }
      conn = null;
      db = null;
    },

    async resetSchema() {
      for (const ddl of DROP_ALL) {
        try {
          await execQuery(ddl);
        } catch {
          // Ignore
        }
      }
      for (const ddl of ALL_DDL) {
        await execQuery(ddl);
      }
      writeManifest(graphDir, {
        schemaVersion: SCHEMA_VERSION,
        engine: "ladybugdb",
        lastIndexedCommit: "",
        lastIndexedAt: "",
        fileCount: 0,
        symbolCount: 0,
        edgeCount: 0,
      });
    },

    isAvailable() {
      return true;
    },

    getManifest() {
      return readManifest(graphDir);
    },

    updateManifest(updates) {
      const existing = readManifest(graphDir) || {
        schemaVersion: SCHEMA_VERSION,
        engine: "ladybugdb",
        lastIndexedCommit: "",
        lastIndexedAt: "",
        fileCount: 0,
        symbolCount: 0,
        edgeCount: 0,
      };
      writeManifest(graphDir, { ...existing, ...updates });
    },
  };
}

/**
 * Returns a no-op engine when the graph DB native addon is unavailable.
 * All operations gracefully degrade to no-ops.
 * @returns {GraphEngine}
 */
function createUnavailableEngine() {
  return {
    async query() {
      return [];
    },
    async close() {},
    async resetSchema() {},
    isAvailable() {
      return false;
    },
    getManifest() {
      return null;
    },
    updateManifest() {},
  };
}
