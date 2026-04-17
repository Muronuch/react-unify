// src/clusterer/cluster.ts
import type { ComponentFingerprint } from "../analyzer/fingerprint.js";

export type MergeConfidence = "high" | "medium" | "low";

export interface ComponentCluster {
  id: number;
  components: ComponentFingerprint[];
  similarity_score: number;
  merge_confidence: MergeConfidence;
}

export function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

export function similarity(_a: ComponentFingerprint, _b: ComponentFingerprint): number {
  throw new Error("not implemented");
}

export function clusterComponents(
  _fps: ComponentFingerprint[],
  _threshold = 0.6
): ComponentCluster[] {
  throw new Error("not implemented");
}
