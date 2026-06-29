import { describe, expect, it } from "vitest";
import { chunk } from "../src/collection/chunk.js";

describe("chunk", () => {
  it("splits arrays into chunks", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("throws for invalid chunk size", () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
  });
});
