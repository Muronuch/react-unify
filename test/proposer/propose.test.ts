import { describe, it, expect } from "vitest";
import path from "node:path";
import { proposeUnification } from "../../src/proposer/propose.js";
import { MockLLMClient } from "../../src/proposer/llm-client.js";
import { extractComponents } from "../../src/parser/extract.js";
import { generateFingerprint } from "../../src/analyzer/fingerprint.js";
import { clusterComponents } from "../../src/clusterer/cluster.js";

const SAMPLE = path.join(process.cwd(), "test", "fixtures", "sample-project");

const CANNED_CARDS = `### GENERIC_COMPONENT_START
\`\`\`tsx
export interface ItemCardProps {
  title: string;
  subtitle: string;
  imageUrl?: string;
  onClick?: () => void;
  hint?: string;
}
export const ItemCard = ({ title, subtitle, imageUrl, onClick, hint }: ItemCardProps) => (
  <div className="card" onClick={onClick}>
    {imageUrl && <img src={imageUrl} alt={title} />}
    <div><h3>{title}</h3><p>{subtitle}</p></div>
    {hint && <span className="hint">{hint}</span>}
  </div>
);
\`\`\`
### GENERIC_COMPONENT_END

### REWRITE_1_START
\`\`\`tsx
export const UserCard = (p: { userName: string; email: string; avatarUrl?: string; onSelect?: () => void }) =>
  <ItemCard title={p.userName} subtitle={p.email} imageUrl={p.avatarUrl} onClick={p.onSelect} hint="Click to select" />;
\`\`\`
### REWRITE_1_END

### REWRITE_2_START
\`\`\`tsx
export const ProductCard = (p: { productName: string; priceLabel: string; thumbnailUrl?: string; onAdd?: () => void }) =>
  <ItemCard title={p.productName} subtitle={p.priceLabel} imageUrl={p.thumbnailUrl} onClick={p.onAdd} hint="Click to add" />;
\`\`\`
### REWRITE_2_END

### REWRITE_3_START
\`\`\`tsx
export const TeamCard = (p: { teamName: string; memberCount: string; bannerUrl?: string; onJoin?: () => void }) =>
  <ItemCard title={p.teamName} subtitle={p.memberCount} imageUrl={p.bannerUrl} onClick={p.onJoin} hint="Click to join" />;
\`\`\`
### REWRITE_3_END
`;

describe("proposeUnification", () => {
  it("returns a ProposalResult with rewrites for each original", async () => {
    const descriptors = extractComponents(SAMPLE);
    const fps = descriptors.map(generateFingerprint);
    const clusters = clusterComponents(fps, 0.6);
    const cardCluster = clusters.find((c) => c.components.every((x) => /Card$/.test(x.component_name)))!;
    expect(cardCluster.components).toHaveLength(3);

    const client = new MockLLMClient([CANNED_CARDS]);
    const proposal = await proposeUnification(cardCluster, descriptors, client, { maxRetries: 1 });
    expect(proposal).not.toBeNull();
    expect(proposal!.generic_component.name).toMatch(/ItemCard|GenericCard/);
    expect(proposal!.rewrites).toHaveLength(3);
    expect(proposal!.lines_before).toBeGreaterThan(proposal!.lines_after);
  });

  it("returns null and a parse-error path when LLM output is unparseable", async () => {
    const descriptors = extractComponents(SAMPLE);
    const fps = descriptors.map(generateFingerprint);
    const clusters = clusterComponents(fps, 0.6);
    const cluster = clusters[0]!;
    const client = new MockLLMClient(["garbage", "garbage", "garbage"]);
    const proposal = await proposeUnification(cluster, descriptors, client, { maxRetries: 3 });
    expect(proposal).toBeNull();
  });
});
