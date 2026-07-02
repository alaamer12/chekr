import { describe, expect, test } from "vitest";
import {
  detectBinary,
  detectLanguage,
  detectSemiStructured,
  extractExports,
  extractImports,
  hashContent,
  indexFile,
  isIndexableFile,
} from "../../../src/lib/core/graph/indexer.js";

describe("detectBinary", () => {
  test("returns false for normal text", () => {
    const buffer = Buffer.from("Hello, world!\nThis is a normal text file.\n");
    expect(detectBinary(buffer).isBinary).toBe(false);
  });

  test("returns false for empty buffer", () => {
    expect(detectBinary(Buffer.alloc(0)).isBinary).toBe(false);
  });

  test("returns true for buffer with many null bytes", () => {
    const buffer = Buffer.alloc(100);
    // Fill with nulls
    expect(detectBinary(buffer).isBinary).toBe(true);
    expect(detectBinary(buffer).reason).toContain("null byte ratio");
  });

  test("returns true for buffer with high control character ratio", () => {
    const buffer = Buffer.alloc(100);
    for (let i = 0; i < 100; i++) {
      buffer[i] = i % 3 === 0 ? 0x01 : 0x41; // mix of control chars and 'A'
    }
    const result = detectBinary(buffer);
    // ~33% control characters
    expect(result.isBinary).toBe(true);
  });

  test("returns false for source code with special chars", () => {
    const code = `import { foo } from './bar';\nconst x = "hello \\n world";\n`;
    expect(detectBinary(Buffer.from(code)).isBinary).toBe(false);
  });
});

describe("detectSemiStructured", () => {
  test("returns false for normal code", () => {
    const code = Array(50).fill('const x = "hello";').join("\n");
    expect(detectSemiStructured(code).isSemiStructured).toBe(false);
  });

  test("detects minified code (very long lines)", () => {
    const code = `${"a".repeat(10000)}\n${"b".repeat(10000)}`;
    const result = detectSemiStructured(code);
    expect(result.isSemiStructured).toBe(true);
    expect(result.reason).toContain("minified");
  });

  test("detects large file with very few lines", () => {
    // 60K chars but only 2 lines
    const code = `${"x".repeat(55000)}\n${"y".repeat(5000)}`;
    const result = detectSemiStructured(code);
    expect(result.isSemiStructured).toBe(true);
  });

  test("detects generated file markers", () => {
    const code = "// @generated\nconst x = 1;\n";
    expect(detectSemiStructured(code).isSemiStructured).toBe(true);
  });

  test("detects DO NOT EDIT marker", () => {
    const code = "/* DO NOT EDIT */\nconst x = 1;\n";
    expect(detectSemiStructured(code).isSemiStructured).toBe(true);
  });
});

describe("hashContent", () => {
  test("returns consistent sha256 hex", () => {
    const hash = hashContent("hello world");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashContent("hello world")).toBe(hash);
  });

  test("different content produces different hash", () => {
    expect(hashContent("a")).not.toBe(hashContent("b"));
  });
});

describe("detectLanguage", () => {
  test("detects JavaScript", () => {
    expect(detectLanguage("src/app.js")).toBe("javascript");
    expect(detectLanguage("src/app.mjs")).toBe("javascript");
    expect(detectLanguage("src/app.jsx")).toBe("javascript");
  });

  test("detects TypeScript", () => {
    expect(detectLanguage("src/app.ts")).toBe("typescript");
    expect(detectLanguage("src/app.tsx")).toBe("typescript");
  });

  test("detects CSS", () => {
    expect(detectLanguage("styles/app.css")).toBe("css");
    expect(detectLanguage("styles/app.scss")).toBe("scss");
  });

  test("returns unknown for unrecognized extensions", () => {
    expect(detectLanguage("file.xyz")).toBe("unknown");
  });
});

describe("isIndexableFile", () => {
  test("returns true for JS/TS files", () => {
    expect(isIndexableFile("app.js")).toBe(true);
    expect(isIndexableFile("app.ts")).toBe(true);
    expect(isIndexableFile("app.tsx")).toBe(true);
  });

  test("returns true for Vue/Svelte", () => {
    expect(isIndexableFile("Component.vue")).toBe(true);
    expect(isIndexableFile("Component.svelte")).toBe(true);
  });

  test("returns false for non-code files", () => {
    expect(isIndexableFile("readme.md")).toBe(false);
    expect(isIndexableFile("style.css")).toBe(false);
    expect(isIndexableFile("data.json")).toBe(false);
    expect(isIndexableFile("image.png")).toBe(false);
  });
});

describe("extractImports", () => {
  test("extracts ESM imports", () => {
    const source = `
      import { foo } from './foo';
      import bar from '../bar';
      import './side-effect';
    `;
    const imports = extractImports(source);
    expect(imports).toHaveLength(3);
    expect(imports[0].toSpecifier).toBe("./foo");
    expect(imports[1].toSpecifier).toBe("../bar");
    expect(imports[2].toSpecifier).toBe("./side-effect");
    expect(imports[0].isDynamic).toBe(false);
  });

  test("extracts CommonJS require", () => {
    const source = `
      const fs = require('fs');
      const bar = require('./bar');
    `;
    const imports = extractImports(source);
    expect(imports.some((i) => i.toSpecifier === "fs")).toBe(true);
    expect(imports.some((i) => i.toSpecifier === "./bar")).toBe(true);
  });

  test("extracts dynamic imports", () => {
    const source = `const mod = await import('./lazy');`;
    const imports = extractImports(source);
    expect(imports).toHaveLength(1);
    expect(imports[0].toSpecifier).toBe("./lazy");
    expect(imports[0].isDynamic).toBe(true);
  });

  test("deduplicates specifiers", () => {
    const source = `
      import { a } from './foo';
      import { b } from './foo';
    `;
    const imports = extractImports(source);
    expect(imports.filter((i) => i.toSpecifier === "./foo")).toHaveLength(1);
  });
});

describe("extractExports", () => {
  test("extracts named function exports", () => {
    const source = `export function processData(x) { return x; }`;
    const symbols = extractExports(source, "test.js");
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe("processData");
    expect(symbols[0].kind).toBe("function");
    expect(symbols[0].isDefault).toBe(false);
  });

  test("extracts class exports", () => {
    const source = `export class MyComponent {}`;
    const symbols = extractExports(source, "test.js");
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe("MyComponent");
    expect(symbols[0].kind).toBe("class");
  });

  test("extracts const/let/var exports", () => {
    const source = `
      export const FOO = 1;
      export let bar = 2;
      export var baz = 3;
    `;
    const symbols = extractExports(source, "test.js");
    expect(symbols).toHaveLength(3);
    expect(symbols.map((s) => s.name).sort()).toEqual(["FOO", "bar", "baz"]);
  });

  test("extracts default exports with name", () => {
    const source = `export default function main() {}`;
    const symbols = extractExports(source, "test.js");
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe("main");
    expect(symbols[0].isDefault).toBe(true);
  });

  test("extracts async function exports", () => {
    const source = `export async function fetchData() {}`;
    const symbols = extractExports(source, "test.js");
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe("fetchData");
    expect(symbols[0].kind).toBe("function");
  });

  test("generates correct symbol IDs", () => {
    const source = `export function foo() {}`;
    const symbols = extractExports(source, "src/utils.js");
    expect(symbols[0].id).toBe("src/utils.js::foo");
  });
});

describe("indexFile", () => {
  test("skips non-existent files", () => {
    const result = indexFile("nonexistent.js", "/tmp");
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("unreadable");
  });
});
