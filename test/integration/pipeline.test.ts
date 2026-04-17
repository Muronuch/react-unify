// test/integration/pipeline.test.ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { extractComponents } from "../../src/parser/extract.js";
import { generateFingerprint } from "../../src/analyzer/fingerprint.js";
import { clusterComponents } from "../../src/clusterer/cluster.js";

const SAMPLE = path.join(process.cwd(), "test", "fixtures", "sample-project");

describe("integration: dry-run pipeline on sample-project", () => {
  it("finds at least 2 clusters covering cards, lists, and forms", () => {
    const descriptors = extractComponents(SAMPLE);
    expect(descriptors.length).toBeGreaterThanOrEqual(8);
    const fps = descriptors.map(generateFingerprint);
    const clusters = clusterComponents(fps, 0.6);

    const names = (cl: typeof clusters[0]) => cl.components.map((c) => c.component_name).sort();
    const allClustered = clusters.flatMap(names);

    expect(allClustered).toEqual(expect.arrayContaining(["UserCard", "ProductCard", "TeamCard"]));
    expect(allClustered).toEqual(expect.arrayContaining(["UserList", "ProductList"]));
    expect(allClustered).toEqual(expect.arrayContaining(["LoginForm", "SignupForm", "ContactForm"]));

    expect(clusters.length).toBeGreaterThanOrEqual(2);
  });
});
