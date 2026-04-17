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

export function similarity(a: ComponentFingerprint, b: ComponentFingerprint): number {
  let score = 0;
  let weights_total = 0;

  // 1. Same category (weight: 3)
  if (a.category === b.category) score += 3;
  weights_total += 3;

  // 2. Hook overlap (weight: 2)
  score += jaccard(a.hook_names_sorted, b.hook_names_sorted) * 2;
  weights_total += 2;

  // 3. JSX tag overlap (weight: 2)
  score += jaccard(a.jsx_tag_bag, b.jsx_tag_bag) * 2;
  weights_total += 2;

  // 4. Prop type Jaccard (weight: 1)
  // Treat both-empty as identical (jaccard returns 0 for empty sets by convention)
  const propSim =
    a.prop_types_sorted.length === 0 && b.prop_types_sorted.length === 0
      ? 1
      : jaccard(a.prop_types_sorted, b.prop_types_sorted);
  score += propSim * 1;
  weights_total += 1;

  // 5. Structural flag agreement (weight: 1)
  let flag_match = 0;
  if (a.has_list_rendering === b.has_list_rendering) flag_match++;
  if (a.has_conditional_rendering === b.has_conditional_rendering) flag_match++;
  if (a.has_data_fetching === b.has_data_fetching) flag_match++;
  if (a.has_form === b.has_form) flag_match++;
  score += (flag_match / 4) * 1;
  weights_total += 1;

  // 6. JSX depth closeness (weight: 1)
  const depth_diff = Math.abs(a.jsx_depth - b.jsx_depth);
  score += Math.max(0, 1 - depth_diff / 5) * 1;
  weights_total += 1;

  return score / weights_total;
}

export function clusterComponents(
  _fps: ComponentFingerprint[],
  _threshold = 0.6
): ComponentCluster[] {
  throw new Error("not implemented");
}
