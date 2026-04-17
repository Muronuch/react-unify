// src/reporter/report.ts
import type { ComponentCluster } from "../clusterer/cluster.js";
import type { ComponentDescriptor } from "../parser/types.js";

export interface ReportSummary {
  total_components_scanned: number;
  clusters_found: number;
  mergeable_clusters: number;
  total_lines_saveable: number;
  components_affected: number;
}

export interface ProposalRewriteSlim {
  original: string;
  rewrite: string;
}

export interface ProposalSlim {
  generic_name: string;
  generic_source: string;
  rewrites: ProposalRewriteSlim[];
  lines_saved: number;
}

export interface ClusterReport {
  cluster_id: number;
  confidence: "high" | "medium" | "low";
  components: { name: string; file: string; lines: number }[];
  similarity_score: number;
  proposal: ProposalSlim | null;
  verified: boolean;
  verification_errors: string[];
}

export interface Report {
  summary: ReportSummary;
  clusters: ClusterReport[];
}

export interface BuildReportInput {
  scanned_count: number;
  clusters: ComponentCluster[];
  descriptors: ComponentDescriptor[];
  proposals: Map<number, { proposal: ProposalSlim | null; verified: boolean; verification_errors: string[] }>;
}

export function buildReport(input: BuildReportInput): Report {
  const descByName = new Map<string, ComponentDescriptor>();
  for (const d of input.descriptors) descByName.set(d.component_name + "|" + d.file_path, d);

  const clusterReports: ClusterReport[] = input.clusters.map((cluster) => {
    const components = cluster.components.map((c) => {
      const d = descByName.get(c.component_name + "|" + c.file_path);
      return { name: c.component_name, file: c.file_path, lines: d?.line_count ?? 0 };
    });
    const proposal = input.proposals.get(cluster.id) ?? { proposal: null, verified: false, verification_errors: [] };
    return {
      cluster_id: cluster.id,
      confidence: cluster.merge_confidence,
      components,
      similarity_score: cluster.similarity_score,
      proposal: proposal.proposal,
      verified: proposal.verified,
      verification_errors: proposal.verification_errors,
    };
  });

  let total_lines_saveable = 0;
  let mergeable = 0;
  let affected = 0;
  for (const cr of clusterReports) {
    if (cr.proposal && cr.verified) {
      mergeable++;
      total_lines_saveable += cr.proposal.lines_saved;
      affected += cr.components.length;
    }
  }

  return {
    summary: {
      total_components_scanned: input.scanned_count,
      clusters_found: input.clusters.length,
      mergeable_clusters: mergeable,
      total_lines_saveable,
      components_affected: affected,
    },
    clusters: clusterReports,
  };
}

export function renderMarkdown(r: Report): string {
  const lines: string[] = [];
  lines.push("# react-unify Report");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Scanned: ${r.summary.total_components_scanned} components`);
  lines.push(`- Clusters found: ${r.summary.clusters_found}`);
  lines.push(`- Mergeable (verified): ${r.summary.mergeable_clusters}`);
  lines.push(`- Potential savings: ${r.summary.total_lines_saveable} lines`);
  lines.push(`- Components affected: ${r.summary.components_affected}`);
  lines.push("");
  for (const c of r.clusters) {
    lines.push(`## Cluster ${c.cluster_id} — confidence: ${c.confidence} (similarity ${c.similarity_score.toFixed(2)})`);
    lines.push("");
    lines.push("**Components:**");
    for (const comp of c.components) {
      lines.push(`- \`${comp.name}\` — \`${comp.file}\` (${comp.lines} lines)`);
    }
    lines.push("");
    if (c.proposal) {
      lines.push(`**Proposed generic component:** \`${c.proposal.generic_name}\``);
      lines.push("");
      lines.push("```tsx");
      lines.push(c.proposal.generic_source);
      lines.push("```");
      lines.push("");
      lines.push("**Rewrites:**");
      lines.push("");
      for (const rw of c.proposal.rewrites) {
        lines.push(`*${rw.original}*:`);
        lines.push("");
        lines.push("```tsx");
        lines.push(rw.rewrite);
        lines.push("```");
        lines.push("");
      }
      lines.push(`**Savings:** ${c.proposal.lines_saved} lines`);
      lines.push("");
      if (c.verified) lines.push("✅ Verified (compiles)");
      else lines.push(`⚠️ Not verified${c.verification_errors.length ? ": " + c.verification_errors[0] : ""}`);
    } else {
      lines.push("_No proposal generated for this cluster._");
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}

export function renderJson(r: Report): string {
  return JSON.stringify(r, null, 2);
}

export function renderConsoleSummary(r: Report): string {
  return [
    `Scanned ${r.summary.total_components_scanned} components`,
    `Found ${r.summary.clusters_found} cluster(s) — ${r.summary.mergeable_clusters} mergeable`,
    `Potential savings: ${r.summary.total_lines_saveable} lines across ${r.summary.components_affected} components`,
  ].join("\n");
}
