// src/proposer/propose.ts
import type { ComponentCluster } from "../clusterer/cluster.js";
import type { ComponentDescriptor } from "../parser/types.js";
import type { LLMClient } from "./llm-client.js";
import type { ProposalSlim } from "../reporter/report.js";
import { buildProposalPrompt, buildRetryPrompt } from "./prompts.js";
import { parseLlmResponse } from "./parse-response.js";

export interface ProposalRewrite {
  original_path: string;
  original_name: string;
  rewrite_source: string;
}

export interface ProposalResult {
  cluster_id: number;
  generic_component: { name: string; source: string; file_name: string };
  rewrites: ProposalRewrite[];
  lines_before: number;
  lines_after: number;
  savings: number;
}

export interface ProposeOptions {
  maxRetries?: number;
  model?: string;
}

const NAME_RE = /(?:export\s+(?:default\s+)?(?:const|function)\s+)([A-Z][A-Za-z0-9_]*)/;

export async function proposeUnification(
  cluster: ComponentCluster,
  descriptors: ComponentDescriptor[],
  client: LLMClient,
  opts: ProposeOptions = {}
): Promise<ProposalResult | null> {
  const maxRetries = opts.maxRetries ?? 3;
  const sources: string[] = [];
  for (const c of cluster.components) {
    const d = descriptors.find((x) => x.component_name === c.component_name && x.file_path === c.file_path);
    if (!d) return null;
    sources.push(d.source_code);
  }

  let prompt = buildProposalPrompt(cluster, sources);
  let lastErr = "";
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let raw: string;
    try {
      raw = await client.complete({ prompt, model: opts.model });
    } catch (e) {
      lastErr = (e as Error).message;
      await delay(1000 * Math.pow(3, attempt));
      continue;
    }
    const parsed = parseLlmResponse(raw, sources.length);
    if (parsed.ok) {
      return assembleProposal(cluster, descriptors, parsed.generic_source, parsed.rewrites);
    }
    lastErr = parsed.error;
    prompt = buildRetryPrompt(buildProposalPrompt(cluster, sources), lastErr);
    // Backoff before next parse-failure retry (1s, 2s, 3s, …)
    await delay(1000 * (attempt + 1));
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function assembleProposal(
  cluster: ComponentCluster,
  descriptors: ComponentDescriptor[],
  genericSource: string,
  rewriteSources: string[]
): ProposalResult {
  const nameMatch = genericSource.match(NAME_RE);
  const genericName = nameMatch?.[1] ?? "GenericComponent";
  const file_name = `${genericName}.tsx`;
  const rewrites: ProposalRewrite[] = cluster.components.map((c, i) => ({
    original_path: c.file_path,
    original_name: c.component_name,
    rewrite_source: rewriteSources[i] ?? "",
  }));
  let lines_before = 0;
  for (const c of cluster.components) {
    const d = descriptors.find((x) => x.component_name === c.component_name && x.file_path === c.file_path);
    lines_before += d?.line_count ?? 0;
  }
  const lines_after =
    countLines(genericSource) +
    rewrites.reduce((sum, r) => sum + countLines(r.rewrite_source), 0);
  return {
    cluster_id: cluster.id,
    generic_component: { name: genericName, source: genericSource, file_name },
    rewrites,
    lines_before,
    lines_after,
    savings: lines_before - lines_after,
  };
}

function countLines(s: string): number {
  return s.split("\n").length;
}

/** Convert a full ProposalResult to the slim shape used by the reporter. */
export function toSlim(r: ProposalResult): ProposalSlim {
  return {
    generic_name: r.generic_component.name,
    generic_source: r.generic_component.source,
    rewrites: r.rewrites.map((rw) => ({ original: rw.original_path, rewrite: rw.rewrite_source })),
    lines_saved: r.savings,
  };
}
