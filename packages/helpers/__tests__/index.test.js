import { describe, expect, it } from "vitest";
import * as helpers from "../src/index.js";

describe("index exports", () => {
  const expectedExports = [
    "parseArgsString",
    "parseArgsArrayString",
    "parseBooleanFlag",
    "parsePositiveInt",
    "parseKeyValue",
    "pickDefined",
    "mergeConfig",
    "resolveStepConfig",
    "validateConfig",
    "ConfigError",
    "normalizePosixPath",
    "toAbsolute",
    "isInsideDir",
    "snakeToCamel",
    "deriveCheckExport",
    "deriveFixExport",
    "chunk",
    "unique",
    "filterDefined",
    "assertNonEmptyString",
    "assertOneOf",
  ];

  it("exports all public APIs", () => {
    for (const name of expectedExports) {
      if (name === "ConfigError") {
        expect(typeof helpers.ConfigError).toBe("function");
        expect(helpers.ConfigError.prototype).toBeInstanceOf(Error);
        continue;
      }
      expect(helpers[name]).toBeTypeOf("function");
    }
  });
});
