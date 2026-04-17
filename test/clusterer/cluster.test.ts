// test/clusterer/cluster.test.ts
import { describe, it, expect } from "vitest";
import { jaccard, similarity, clusterComponents } from "../../src/clusterer/cluster.js";
import type { ComponentFingerprint } from "../../src/analyzer/fingerprint.js";

describe("jaccard", () => {
  it("returns 1 for identical sets", () => {
    expect(jaccard(["a", "b"], ["a", "b"])).toBe(1);
  });
  it("returns 0 for disjoint sets", () => {
    expect(jaccard(["a"], ["b"])).toBe(0);
  });
  it("handles partial overlap", () => {
    expect(jaccard(["a", "b", "c"], ["a", "b", "d"])).toBeCloseTo(2 / 4, 5);
  });
  it("handles empty sets", () => {
    expect(jaccard([], [])).toBe(0);
  });
});
