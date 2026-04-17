// test/analyzer/fingerprint.test.ts
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
