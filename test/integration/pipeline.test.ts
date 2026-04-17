// test/integration/pipeline.test.ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { extractComponents } from "../../src/parser/extract.js";
import { generateFingerprint } from "../../src/analyzer/fingerprint.js";
import { clusterComponents } from "../../src/clusterer/cluster.js";
import { proposeUnification } from "../../src/proposer/propose.js";
import { MockLLMClient } from "../../src/proposer/llm-client.js";
import { buildReport, renderMarkdown } from "../../src/reporter/report.js";

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

describe("integration: pipeline with mocked LLM", () => {
  it("produces a report with a proposal for the cards cluster", async () => {
    const descriptors = extractComponents(SAMPLE);
    const fps = descriptors.map(generateFingerprint);
    const clusters = clusterComponents(fps, 0.6);
    const cardCluster = clusters.find((c) => c.components.every((x) => /Card$/.test(x.component_name)))!;

    const canned = `### GENERIC_COMPONENT_START
\`\`\`tsx
export const ItemCard = ({ title }: { title: string }) => <div>{title}</div>;
\`\`\`
### GENERIC_COMPONENT_END

${cardCluster.components.map((_, i) => `### REWRITE_${i + 1}_START
\`\`\`tsx
export const X${i} = () => <ItemCard title="x" />;
\`\`\`
### REWRITE_${i + 1}_END`).join("\n\n")}
`;
    const client = new MockLLMClient([canned]);
    const proposal = await proposeUnification(cardCluster, descriptors, client);
    expect(proposal).not.toBeNull();

    const proposals = new Map();
    proposals.set(cardCluster.id, {
      proposal: {
        generic_name: proposal!.generic_component.name,
        generic_source: proposal!.generic_component.source,
        rewrites: proposal!.rewrites.map((r) => ({ original: r.original_path, rewrite: r.rewrite_source })),
        lines_saved: proposal!.savings,
      },
      verified: false,
      verification_errors: [],
    });
    const report = buildReport({ scanned_count: descriptors.length, clusters, descriptors, proposals });
    const md = renderMarkdown(report);
    expect(md).toContain("ItemCard");
    expect(md).toContain("Cluster ");
  });
});
