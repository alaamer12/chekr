import { describe, expect, it } from "vitest";
import { unique } from "../src/collection/unique.js";

describe("unique", () => {
  it("removes duplicate values", () => {
    expect(unique([1, 1, 2, 3, 2])).toEqual([1, 2, 3]);
  });
});
