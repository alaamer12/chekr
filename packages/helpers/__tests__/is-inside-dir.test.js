import path from "node:path";
import { describe, expect, it } from "vitest";
import { isInsideDir } from "../src/path/is-inside-dir.js";

describe("isInsideDir", () => {
  const root = path.resolve("/project");

  it("returns true for files inside dir", () => {
    expect(isInsideDir(path.join(root, "src/app.tsx"), root)).toBe(true);
  });

  it("returns true when file equals dir", () => {
    expect(isInsideDir(root, root)).toBe(true);
  });

  it("returns false for files outside dir", () => {
    expect(isInsideDir("/other/file.js", root)).toBe(false);
  });
});
