import { describe, expect, it } from "vitest";
import { normalizePosixPath } from "../src/path/normalize-posix-path.js";

describe("normalizePosixPath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizePosixPath("src\\components\\App.tsx")).toBe("src/components/App.tsx");
  });
});
