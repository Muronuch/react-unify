import { describe, it, expect } from "vitest";
import { buildReport, renderMarkdown, renderJson } from "../../src/reporter/report.js";
import type { ComponentCluster } from "../../src/clusterer/cluster.js";
import type { ComponentDescriptor } from "../../src/parser/types.js";
import type { ComponentFingerprint } from "../../src/analyzer/fingerprint.js";

function fp(name: string, file: string): ComponentFingerprint {
  return {
    component_name: name, file_path: file,
    prop_count: 0, prop_types_sorted: [], hook_names_sorted: [], jsx_tag_bag: [],
    jsx_depth: 0, jsx_element_count: 0,
    has_list_rendering: false, has_conditional_rendering: false,
    has_state: false, has_effects: false, has_data_fetching: false, has_form: false,
    category: "card",
  };
}
function desc(name: string, file: string, lines: number): ComponentDescriptor {
  return {
    file_path: file, component_name: name, export_type: "named",
    props: [], hooks: [], jsx_tree: [], jsx_depth: 0, jsx_element_count: 0,
    has_state: false, has_effects: false, has_context: false, has_refs: false,
    imports: [], line_start: 1, line_end: lines, line_count: lines, source_code: "",
  };
}

describe("buildReport — no proposals", () => {
  it("aggregates summary and per-cluster info", () => {
    const cluster: ComponentCluster = {
      id: 1, components: [fp("A", "/a.tsx"), fp("B", "/b.tsx")],
      similarity_score: 0.85, merge_confidence: "high",
    };
    const report = buildReport({
      scanned_count: 5,
      clusters: [cluster],
      descriptors: [desc("A", "/a.tsx", 30), desc("B", "/b.tsx", 40)],
      proposals: new Map(),
    });
    expect(report.summary.total_components_scanned).toBe(5);
    expect(report.summary.clusters_found).toBe(1);
    expect(report.summary.mergeable_clusters).toBe(0);
    expect(report.clusters[0]!.components).toEqual([
      { name: "A", file: "/a.tsx", line_start: 1, line_end: 30, lines: 30 },
      { name: "B", file: "/b.tsx", line_start: 1, line_end: 40, lines: 40 },
    ]);
    expect(report.clusters[0]!.proposal).toBeNull();
  });
});

describe("renderMarkdown / renderJson", () => {
  it("renders a markdown header and a cluster section", () => {
    const cluster: ComponentCluster = {
      id: 1, components: [fp("A", "/a.tsx"), fp("B", "/b.tsx")],
      similarity_score: 0.85, merge_confidence: "high",
    };
    const report = buildReport({
      scanned_count: 5,
      clusters: [cluster],
      descriptors: [desc("A", "/a.tsx", 30), desc("B", "/b.tsx", 40)],
      proposals: new Map(),
    });
    const md = renderMarkdown(report);
    expect(md).toContain("# react-unify Report");
    expect(md).toContain("Cluster 1");
    expect(md).toContain("[`A`](file:///a.tsx#L1-L30)");
    expect(md).toContain("[`B`](file:///b.tsx#L1-L40)");
    const json = renderJson(report);
    expect(JSON.parse(json).summary.total_components_scanned).toBe(5);
  });
});
