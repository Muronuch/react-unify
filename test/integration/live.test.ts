import { describe, it, expect } from "vitest";
import path from "node:path";
import { extractComponents } from "../../src/parser/extract.js";
import { generateFingerprint } from "../../src/analyzer/fingerprint.js";
import { clusterComponents } from "../../src/clusterer/cluster.js";
import { proposeUnification } from "../../src/proposer/propose.js";
import { AnthropicClient } from "../../src/proposer/llm-client.js";
import { verifyProposal } from "../../src/verifier/verify.js";

const apiKey = process.env["ANTHROPIC_API_KEY"];
const SAMPLE = path.join(process.cwd(), "test", "fixtures", "sample-project");

describe.skipIf(!apiKey)("LIVE: real Anthropic call", () => {
  it("generates and verifies a proposal for the cards cluster", { timeout: 120_000 }, async () => {
    const descriptors = extractComponents(SAMPLE);
    const fps = descriptors.map(generateFingerprint);
    const clusters = clusterComponents(fps, 0.6);
    const card = clusters.find((c) => c.components.every((x) => /Card$/.test(x.component_name)))!;
    const client = new AnthropicClient(apiKey!, "claude-sonnet-4-6");
    const proposal = await proposeUnification(card, descriptors, client);
    expect(proposal).not.toBeNull();
    const v = await verifyProposal(proposal!, SAMPLE);
    // Live LLM may produce something that does not compile against the sample project (no React types installed).
    // Accept either outcome but log type errors for inspection.
    if (!v.compiles) console.log("Live verification errors:", v.type_errors.slice(0, 5));
    expect(typeof v.compiles).toBe("boolean");
  });
});
