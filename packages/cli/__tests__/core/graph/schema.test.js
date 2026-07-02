import { describe, expect, test } from "vitest";
import {
  ALL_DDL,
  DROP_ALL,
  EXTENSION_LANGUAGE_MAP,
  INDEXABLE_EXTENSIONS,
  NODE_TABLES,
  REL_TABLES,
  SCHEMA_VERSION,
} from "../../../src/lib/core/graph/schema.js";

describe("schema", () => {
  test("SCHEMA_VERSION is a positive integer", () => {
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
  });

  test("NODE_TABLES contains File, Symbol, Token", () => {
    const combined = NODE_TABLES.join(" ");
    expect(combined).toContain("File");
    expect(combined).toContain("Symbol");
    expect(combined).toContain("Token");
  });

  test("REL_TABLES contains IMPORTS, EXPORTS, USES_TOKEN, DEPENDS_ON", () => {
    const combined = REL_TABLES.join(" ");
    expect(combined).toContain("IMPORTS");
    expect(combined).toContain("EXPORTS");
    expect(combined).toContain("USES_TOKEN");
    expect(combined).toContain("DEPENDS_ON");
  });

  test("ALL_DDL is nodes + rels in order", () => {
    expect(ALL_DDL.length).toBe(NODE_TABLES.length + REL_TABLES.length);
    expect(ALL_DDL.slice(0, NODE_TABLES.length)).toEqual(NODE_TABLES);
  });

  test("DROP_ALL drops in reverse dependency order (rels before nodes)", () => {
    // First items should be relationship drops
    expect(DROP_ALL[0]).toContain("DEPENDS_ON");
    // Last items should be node drops
    expect(DROP_ALL[DROP_ALL.length - 1]).toContain("File");
  });

  test("EXTENSION_LANGUAGE_MAP covers common JS/TS extensions", () => {
    expect(EXTENSION_LANGUAGE_MAP[".js"]).toBe("javascript");
    expect(EXTENSION_LANGUAGE_MAP[".ts"]).toBe("typescript");
    expect(EXTENSION_LANGUAGE_MAP[".tsx"]).toBe("typescript");
    expect(EXTENSION_LANGUAGE_MAP[".vue"]).toBe("vue");
  });

  test("INDEXABLE_EXTENSIONS is a subset of EXTENSION_LANGUAGE_MAP", () => {
    for (const ext of INDEXABLE_EXTENSIONS) {
      expect(EXTENSION_LANGUAGE_MAP[ext]).toBeDefined();
    }
  });

  test("non-code extensions are not in INDEXABLE_EXTENSIONS", () => {
    expect(INDEXABLE_EXTENSIONS.has(".css")).toBe(false);
    expect(INDEXABLE_EXTENSIONS.has(".json")).toBe(false);
    expect(INDEXABLE_EXTENSIONS.has(".md")).toBe(false);
  });
});
