import { describe, expect, test } from "vitest";
import { buildIgnoredLines } from "../src/ignore-handler.js";

const MARKER = "@symphony-ignore";

describe("buildIgnoredLines", () => {
  test("returns empty set for source without blocks", () => {
    const lines = ['import { foo } from "bar"', "const x = 1", "export default x"];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.size).toBe(0);
  });

  test("suppresses lines inside block", () => {
    const lines = [
      'import { foo } from "bar"',
      "// ---------- @symphony-ignore-start",
      'import { invoke } from "@tauri-apps/api/core"',
      'const bad = invoke("command")',
      "// ---------- @symphony-ignore-end",
      "export default foo",
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(1)).toBe(false);
    expect(ignored.has(2)).toBe(false);
    expect(ignored.has(3)).toBe(true);
    expect(ignored.has(4)).toBe(true);
    expect(ignored.has(5)).toBe(false);
    expect(ignored.has(6)).toBe(false);
  });

  test("handles block without dashes", () => {
    const lines = [
      "const x = 1",
      "// @symphony-ignore-start",
      'const bad = "violation"',
      "// @symphony-ignore-end",
      "const y = 2",
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(3)).toBe(true);
  });

  test("handles unclosed block (suppresses to EOF)", () => {
    const lines = [
      "const x = 1",
      "// @symphony-ignore-start",
      'const bad1 = "violation"',
      'const bad2 = "violation"',
      'const bad3 = "violation"',
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(1)).toBe(false);
    expect(ignored.has(3)).toBe(true);
    expect(ignored.has(4)).toBe(true);
    expect(ignored.has(5)).toBe(true);
  });

  test("handles multiple blocks", () => {
    const lines = [
      "const x = 1",
      "// @symphony-ignore-start",
      'const bad1 = "violation"',
      "// @symphony-ignore-end",
      'const good = "clean"',
      "// @symphony-ignore-start",
      'const bad2 = "violation"',
      "// @symphony-ignore-end",
      "const y = 2",
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(3)).toBe(true);
    expect(ignored.has(5)).toBe(false);
    expect(ignored.has(7)).toBe(true);
    expect(ignored.has(9)).toBe(false);
  });

  test("nested start is ignored (no nesting support)", () => {
    const lines = [
      "// @symphony-ignore-start",
      'const bad1 = "violation"',
      "// @symphony-ignore-start",
      'const bad2 = "violation"',
      "// @symphony-ignore-end",
      'const good = "clean"',
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(2)).toBe(true);
    expect(ignored.has(4)).toBe(true);
    expect(ignored.has(6)).toBe(false);
  });

  test("handles JSX comment style blocks", () => {
    const lines = [
      "return (",
      "  <Box>",
      "    {/* @symphony-ignore-start */}",
      '    <div className="legacy">',
      "      <span>Old code</span>",
      "    </div>",
      "    {/* @symphony-ignore-end */}",
      "    <Text>New code</Text>",
      "  </Box>",
      ")",
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(3)).toBe(false);
    expect(ignored.has(4)).toBe(true);
    expect(ignored.has(5)).toBe(true);
    expect(ignored.has(6)).toBe(true);
    expect(ignored.has(7)).toBe(false);
    expect(ignored.has(8)).toBe(false);
  });

  test("handles JSX comment style with dashes", () => {
    const lines = [
      "return (",
      "  <Flex>",
      "    {/* ---------- @symphony-ignore-start */}",
      '    <div style={{ color: "red" }}>',
      "    {/* ---------- @symphony-ignore-end */}",
      "    <Box color='red'>",
      "  </Flex>",
      ")",
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(4)).toBe(true);
    expect(ignored.has(6)).toBe(false);
  });

  test("handles mixed comment styles in same file", () => {
    const lines = [
      'import { Box } from "@symphony/ui"',
      "// @symphony-ignore-start",
      'import { invoke } from "@tauri-apps/api/core"',
      "// @symphony-ignore-end",
      "",
      "export function Component() {",
      "  return (",
      "    <Box>",
      "      {/* @symphony-ignore-start */}",
      '      <div className="old">',
      "      {/* @symphony-ignore-end */}",
      "      <Text>New</Text>",
      "    </Box>",
      "  )",
      "}",
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(3)).toBe(true);
    expect(ignored.has(10)).toBe(true);
    expect(ignored.has(12)).toBe(false);
  });

  test("handles inline start directive (same line as code)", () => {
    const lines = [
      "const x = 1",
      '<div style={{color: "red"}}> {/* @symphony-ignore-start */}',
      '  <span className="old">content</span>',
      "{/* @symphony-ignore-end */}",
      "const y = 2",
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(2)).toBe(true);
    expect(ignored.has(3)).toBe(true);
    expect(ignored.has(4)).toBe(false);
    expect(ignored.has(5)).toBe(false);
  });

  test("handles inline end directive (same line as code)", () => {
    const lines = [
      "const x = 1",
      "{/* @symphony-ignore-start */}",
      '<div className="old">',
      "{/* @symphony-ignore-end */} </div>",
      "const y = 2",
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(2)).toBe(false);
    expect(ignored.has(3)).toBe(true);
    expect(ignored.has(4)).toBe(true);
    expect(ignored.has(5)).toBe(false);
  });

  test("handles both directives inline on same line", () => {
    const lines = [
      "const x = 1",
      '<div style={{color: "red"}}> {/* @symphony-ignore-start */} <span>bad</span> {/* @symphony-ignore-end */} </div>',
      "const y = 2",
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(2)).toBe(true);
    expect(ignored.has(3)).toBe(false);
  });

  test("handles directive with code before it", () => {
    const lines = [
      "const x = 1",
      'const bad = "violation" // @symphony-ignore-start',
      'const bad2 = "violation"',
      "// @symphony-ignore-end",
      "const y = 2",
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(2)).toBe(true);
    expect(ignored.has(3)).toBe(true);
    expect(ignored.has(4)).toBe(false);
  });

  test("handles directive with code after it (JSX only)", () => {
    const lines = [
      "const x = 1",
      "// @symphony-ignore-start",
      'const bad = "violation"',
      "{/* @symphony-ignore-end */} const y = 2",
      "const z = 3",
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(3)).toBe(true);
    expect(ignored.has(4)).toBe(true);
    expect(ignored.has(5)).toBe(false);
  });

  test("handles whitespace variations", () => {
    const lines = [
      "const x = 1",
      "   {/*@symphony-ignore-start*/}   ",
      '<div className="old">',
      "   {/*@symphony-ignore-end*/}   ",
      "const y = 2",
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(2)).toBe(false);
    expect(ignored.has(3)).toBe(true);
    expect(ignored.has(4)).toBe(false);
  });

  test("handles multiple inline blocks on consecutive lines", () => {
    const lines = [
      "const x = 1",
      '<div> {/* @symphony-ignore-start */} <span className="bad1">1</span> {/* @symphony-ignore-end */} </div>',
      '<div> {/* @symphony-ignore-start */} <span className="bad2">2</span> {/* @symphony-ignore-end */} </div>',
      "const y = 2",
    ];
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    expect(ignored.has(2)).toBe(true);
    expect(ignored.has(3)).toBe(true);
    expect(ignored.has(4)).toBe(false);
  });

  test("uses @chekr-ignore marker by default", () => {
    const lines = [
      "const x = 1",
      "// @chekr-ignore-start",
      'const bad = "violation"',
      "// @chekr-ignore-end",
      "const y = 2",
    ];
    const ignored = buildIgnoredLines(lines);
    expect(ignored.has(3)).toBe(true);
    expect(ignored.has(1)).toBe(false);
    expect(ignored.has(5)).toBe(false);
  });
});
