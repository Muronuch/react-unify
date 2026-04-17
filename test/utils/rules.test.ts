import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  loadRules,
  filterDescriptors,
  computeBlockedPairs,
  RULES_FILENAME,
} from "../../src/utils/rules.js";
import type { ComponentDescriptor } from "../../src/parser/types.js";
import type { ComponentFingerprint } from "../../src/analyzer/fingerprint.js";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `react-unify-rules-${crypto.randomBytes(4).toString("hex")}-`));
}

function desc(name: string, file: string): ComponentDescriptor {
  return {
    file_path: file,
    component_name: name,
    export_type: "named",
    props: [], hooks: [], jsx_tree: [], jsx_depth: 0, jsx_element_count: 0,
    has_state: false, has_effects: false, has_context: false, has_refs: false,
    imports: [], line_start: 1, line_end: 10, line_count: 10, source_code: "",
  };
}

function fp(name: string): ComponentFingerprint {
  return {
    component_name: name, file_path: `/${name}.tsx`,
    prop_count: 0, prop_types_sorted: [], hook_names_sorted: [], jsx_tag_bag: [],
    jsx_depth: 0, jsx_element_count: 0,
    has_list_rendering: false, has_conditional_rendering: false,
    has_state: false, has_effects: false, has_data_fetching: false, has_form: false,
    category: "card",
  };
}

describe("loadRules", () => {
  it("returns null when no rules file exists", () => {
    const dir = tempDir();
    expect(loadRules(dir)).toBeNull();
  });

  it("reads .react-unify.json from the project dir", () => {
    const dir = tempDir();
    const file = path.join(dir, RULES_FILENAME);
    fs.writeFileSync(file, JSON.stringify({
      exclude: { paths: ["**/*.test.tsx"] },
      neverClusterTogether: [{ description: "x", patterns: ["Create.*", "Update.*"] }],
    }));
    const loaded = loadRules(dir);
    expect(loaded).not.toBeNull();
    expect(loaded!.filePath).toBe(file);
    expect(loaded!.rules.exclude?.paths).toEqual(["**/*.test.tsx"]);
    expect(loaded!.rules.neverClusterTogether).toHaveLength(1);
  });

  it("walks up to find a rules file in a parent dir", () => {
    const dir = tempDir();
    const nested = path.join(dir, "deep", "nested", "src");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(dir, RULES_FILENAME), JSON.stringify({ exclude: { paths: ["x"] } }));
    const loaded = loadRules(nested);
    expect(loaded).not.toBeNull();
    expect(loaded!.rules.exclude?.paths).toEqual(["x"]);
  });

  it("throws if the explicit override path does not exist", () => {
    const dir = tempDir();
    expect(() => loadRules(dir, path.join(dir, "missing.json"))).toThrow(/not found/);
  });

  it("rejects neverClusterTogether rules with fewer than 2 patterns", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, RULES_FILENAME), JSON.stringify({
      neverClusterTogether: [{ patterns: ["OnlyOne.*"] }],
    }));
    expect(() => loadRules(dir)).toThrow(/at least 2 patterns/);
  });
});

describe("filterDescriptors", () => {
  it("returns all descriptors when rules is null", () => {
    const all = [desc("A", "/a.tsx"), desc("B", "/b.tsx")];
    expect(filterDescriptors(all, null)).toHaveLength(2);
  });

  it("excludes by component name", () => {
    const all = [desc("Keep", "/k.tsx"), desc("Drop", "/d.tsx")];
    const filtered = filterDescriptors(all, { exclude: { components: ["Drop"] } });
    expect(filtered.map((d) => d.component_name)).toEqual(["Keep"]);
  });

  it("excludes by path glob", () => {
    const all = [desc("Keep", "/src/Keep.tsx"), desc("Gen", "/src/generated/Gen.tsx")];
    const filtered = filterDescriptors(all, { exclude: { paths: ["**/generated/**"] } });
    expect(filtered.map((d) => d.component_name)).toEqual(["Keep"]);
  });
});

describe("computeBlockedPairs", () => {
  it("returns empty set when rules is null", () => {
    const fps = [fp("A"), fp("B")];
    expect(computeBlockedPairs(fps, null).size).toBe(0);
  });

  it("blocks pairs across disjoint families", () => {
    const fps = [fp("CreateUserDrawer"), fp("UpdateUserDrawer"), fp("CreatePostDrawer")];
    const rules = { neverClusterTogether: [{ patterns: ["Create.*", "Update.*"] }] };
    const blocked = computeBlockedPairs(fps, rules);
    expect(blocked.has("0|1")).toBe(true);
    expect(blocked.has("1|2")).toBe(true);
    expect(blocked.has("0|2")).toBe(false);
  });

  it("does not block pairs where only one side matches the rule", () => {
    const fps = [fp("CreateUserDrawer"), fp("NoOpComponent")];
    const rules = { neverClusterTogether: [{ patterns: ["Create.*", "Update.*"] }] };
    const blocked = computeBlockedPairs(fps, rules);
    expect(blocked.size).toBe(0);
  });

  it("strips inline (?i) prefix and matches case-insensitively", () => {
    const fps = [fp("createuser"), fp("UPDATEuser")];
    const rules = { neverClusterTogether: [{ patterns: ["(?i)create.*", "(?i)update.*"] }] };
    const blocked = computeBlockedPairs(fps, rules);
    expect(blocked.has("0|1")).toBe(true);
  });
});
