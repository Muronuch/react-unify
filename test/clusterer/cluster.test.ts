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

function fp(over: Partial<ComponentFingerprint> = {}): ComponentFingerprint {
  return {
    component_name: "X",
    file_path: "/x.tsx",
    prop_count: 0,
    prop_types_sorted: [],
    hook_names_sorted: [],
    jsx_tag_bag: [],
    jsx_depth: 0,
    jsx_element_count: 0,
    has_list_rendering: false,
    has_conditional_rendering: false,
    has_state: false,
    has_effects: false,
    has_data_fetching: false,
    has_form: false,
    category: "other",
    ...over,
  };
}

describe("similarity", () => {
  it("returns 1 for identical fingerprints", () => {
    const a = fp({ category: "card", hook_names_sorted: ["useState"], jsx_tag_bag: ["div"] });
    expect(similarity(a, a)).toBeCloseTo(1, 5);
  });
  it("rewards same category", () => {
    const a = fp({ category: "card" });
    const b = fp({ category: "card" });
    const c = fp({ category: "form" });
    expect(similarity(a, b)).toBeGreaterThan(similarity(a, c));
  });
  it("rewards JSX tag overlap", () => {
    const a = fp({ jsx_tag_bag: ["div", "button"] });
    const b = fp({ jsx_tag_bag: ["div", "button"] });
    const c = fp({ jsx_tag_bag: ["table", "tr"] });
    expect(similarity(a, b)).toBeGreaterThan(similarity(a, c));
  });
  it("returns a value between 0 and 1", () => {
    const a = fp({ category: "card", jsx_tag_bag: ["div"] });
    const b = fp({ category: "form", jsx_tag_bag: ["form"] });
    const s = similarity(a, b);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe("clusterComponents", () => {
  it("returns empty when no fingerprints are similar enough", () => {
    const a = fp({ component_name: "A", category: "card" });
    const b = fp({ component_name: "B", category: "form" });
    const c = fp({ component_name: "C", category: "list" });
    expect(clusterComponents([a, b, c], 0.9)).toEqual([]);
  });
  it("groups two highly similar fingerprints together", () => {
    const a = fp({ component_name: "UserCard", category: "card", jsx_tag_bag: ["div", "h3", "p"], hook_names_sorted: ["useState"] });
    const b = fp({ component_name: "ProductCard", category: "card", jsx_tag_bag: ["div", "h3", "p"], hook_names_sorted: ["useState"] });
    const clusters = clusterComponents([a, b], 0.6);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.components.map((c) => c.component_name).sort()).toEqual(["ProductCard", "UserCard"]);
    expect(clusters[0]!.merge_confidence).toBe("high");
  });
  it("excludes singleton clusters", () => {
    const a = fp({ component_name: "A", category: "card" });
    const b = fp({ component_name: "B", category: "card" });
    const c = fp({ component_name: "C", category: "form" });
    const clusters = clusterComponents([a, b, c], 0.6);
    expect(clusters.flatMap((cl) => cl.components.map((x) => x.component_name))).not.toContain("C");
  });
  it("assigns sequential ids and sorts by size desc", () => {
    const a1 = fp({ component_name: "A1", category: "card", jsx_tag_bag: ["div"] });
    const a2 = fp({ component_name: "A2", category: "card", jsx_tag_bag: ["div"] });
    const a3 = fp({ component_name: "A3", category: "card", jsx_tag_bag: ["div"] });
    const b1 = fp({ component_name: "B1", category: "form", jsx_tag_bag: ["form"] });
    const b2 = fp({ component_name: "B2", category: "form", jsx_tag_bag: ["form"] });
    const clusters = clusterComponents([a1, a2, a3, b1, b2], 0.6);
    expect(clusters[0]!.components).toHaveLength(3);
    expect(clusters[1]!.components).toHaveLength(2);
    expect(clusters[0]!.id).toBe(1);
    expect(clusters[1]!.id).toBe(2);
  });
});
