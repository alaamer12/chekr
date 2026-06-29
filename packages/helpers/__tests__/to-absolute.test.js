import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizePosixPath } from "../src/path/normalize-posix-path.js";
import { toAbsolute } from "../src/path/to-absolute.js";

describe("toAbsolute", () => {
  it("resolves relative paths against cwd", () => {
    const cwd = path.resolve("/project");
    expect(toAbsolute("./src", cwd)).toBe(normalizePosixPath(path.join(cwd, "src")));
  });
});
