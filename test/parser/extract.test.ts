// test/parser/extract.test.ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { extractComponents } from "../../src/parser/extract.js";

const FIXTURES = path.join(process.cwd(), "test", "fixtures", "parser");

describe("extractComponents — simple functional", () => {
  it("extracts name, export type, and a string prop", () => {
    const components = extractComponents(FIXTURES, ["simple-functional.tsx"]);
    const greeting = components.find((c) => c.component_name === "Greeting");
    expect(greeting).toBeDefined();
    expect(greeting!.export_type).toBe("named");
    expect(greeting!.props).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "name", type: "string", optional: false }),
        expect.objectContaining({ name: "greeting", type: "string", optional: true }),
      ])
    );
    expect(greeting!.jsx_element_count).toBeGreaterThanOrEqual(1);
    expect(greeting!.line_count).toBeGreaterThan(0);
  });
});

describe("extractComponents — hooks", () => {
  it("records useState and useEffect, sets has_state and has_effects", () => {
    const components = extractComponents(FIXTURES, ["with-hooks.tsx"]);
    const counter = components.find((c) => c.component_name === "Counter");
    expect(counter).toBeDefined();
    const hookNames = counter!.hooks.map((h) => h.hook).sort();
    expect(hookNames).toEqual(["useEffect", "useState"]);
    expect(counter!.has_state).toBe(true);
    expect(counter!.has_effects).toBe(true);
  });
});

describe("extractComponents — list and conditional rendering", () => {
  it("flags has_map and has_conditional in JSX tree nodes", () => {
    const components = extractComponents(FIXTURES, ["with-map-and-conditional.tsx"]);
    const list = components.find((c) => c.component_name === "ItemList");
    expect(list).toBeDefined();
    expect(list!.jsx_tree.some((n) => n.has_map)).toBe(true);
    expect(list!.jsx_tree.some((n) => n.has_conditional)).toBe(true);
  });
});

describe("extractComponents — multiple components per file", () => {
  it("extracts all three components with correct export types", () => {
    const components = extractComponents(FIXTURES, ["multiple-components.tsx"]);
    const names = components.map((c) => c.component_name).sort();
    expect(names).toEqual(["Footer", "Header", "Page"]);
    const page = components.find((c) => c.component_name === "Page")!;
    expect(page.export_type).toBe("default");
  });
});

describe("extractComponents — no props", () => {
  it("returns an empty props array", () => {
    const components = extractComponents(FIXTURES, ["no-props.tsx"]);
    const loader = components.find((c) => c.component_name === "Loader");
    expect(loader).toBeDefined();
    expect(loader!.props).toEqual([]);
  });
});
