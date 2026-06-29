import { describe, expect, it } from "vitest";
import { filterDefined } from "../../src/lib/helpers/collection/filter-defined.js";

describe("filterDefined", () => {
  it("removes null and undefined entries", () => {
    expect(filterDefined([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
  });
});
