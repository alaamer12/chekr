import { describe, expect, it } from "vitest";
import { deriveFixExport } from "../../src/lib/helpers/naming/derive-fix-export.js";

describe("deriveFixExport", () => {
  it("derives fix export names from filenames", () => {
    expect(deriveFixExport("fix_raw_sizes.js")).toBe("fixRawSizes");
  });
});
