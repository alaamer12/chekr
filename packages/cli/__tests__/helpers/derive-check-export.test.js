import { describe, expect, it } from "vitest";
import { deriveCheckExport } from "../../src/lib/helpers/naming/derive-check-export.js";

describe("deriveCheckExport", () => {
  it("derives check export names from filenames", () => {
    expect(deriveCheckExport("check_raw_colors.js")).toBe("checkRawColors");
    expect(deriveCheckExport("check_box_as_primitive.js")).toBe("checkBoxAsPrimitive");
  });
});
