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

export function buildReport(_in: BuildReportInput): Report {
  throw new Error("not implemented");
}
export function renderMarkdown(_r: Report): string {
  throw new Error("not implemented");
}
export function renderJson(_r: Report): string {
  throw new Error("not implemented");
}
export function renderConsoleSummary(_r: Report): string {
  throw new Error("not implemented");
}
