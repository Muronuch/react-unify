import { describe, it, expect } from "vitest";
import path from "node:path";
import { extractComponents } from "../../src/parser/extract.js";
import { generateFingerprint } from "../../src/analyzer/fingerprint.js";

const FIXTURES = path.join(process.cwd(), "test", "fixtures", "parser");

describe("generateFingerprint — basic shape", () => {
  it("converts a ComponentDescriptor into a ComponentFingerprint", () => {
    const [counter] = extractComponents(FIXTURES, ["with-hooks.tsx"]);
    const fp = generateFingerprint(counter);
    expect(fp.component_name).toBe("Counter");
    expect(fp.prop_count).toBe(1);
    expect(fp.hook_names_sorted).toEqual(["useEffect", "useState"]);
    expect(fp.jsx_tag_bag).toContain("button");
    expect(fp.has_state).toBe(true);
    expect(fp.has_effects).toBe(true);
  });
});

describe("generateFingerprint — category heuristics", () => {
  function fpFor(file: string, name: string) {
    const d = extractComponents(FIXTURES, [file]).find((c) => c.component_name === name)!;
    return generateFingerprint(d);
  }

  it("detects 'list' from .map() rendering", () => {
    expect(fpFor("with-map-and-conditional.tsx", "ItemList").category).toBe("list");
  });
  it("detects 'form' from <form> + multiple inputs", () => {
    expect(fpFor("form-fixture.tsx", "ContactForm").category).toBe("form");
  });
  it("detects 'modal' from dialog/modal markers", () => {
    expect(fpFor("modal-fixture.tsx", "ConfirmDialog").category).toBe("modal");
  });
  it("detects 'navigation' from <nav>", () => {
    expect(fpFor("nav-fixture.tsx", "TopNav").category).toBe("navigation");
  });
});
