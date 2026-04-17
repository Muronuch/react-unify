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
  fps: ComponentFingerprint[],
  threshold = 0.6
): ComponentCluster[] {
  if (fps.length < 2) return [];

  // Pairwise similarity matrix
  const n = fps.length;
  const sim: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = similarity(fps[i]!, fps[j]!);
      sim[i]![j] = s;
      sim[j]![i] = s;
    }
  }

  // Each cluster starts as a singleton index list
  let clusters: number[][] = fps.map((_, i) => [i]);

  function avgLink(a: number[], b: number[]): number {
    let sum = 0;
    let count = 0;
    for (const i of a) for (const j of b) { sum += sim[i]![j]!; count++; }
    return count === 0 ? 0 : sum / count;
  }

  while (true) {
    let bestI = -1;
    let bestJ = -1;
    let bestS = -1;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const s = avgLink(clusters[i]!, clusters[j]!);
        if (s > bestS) { bestS = s; bestI = i; bestJ = j; }
      }
    }
    if (bestS < threshold || bestI === -1) break;
    const merged = [...clusters[bestI]!, ...clusters[bestJ]!];
    clusters = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ);
    clusters.push(merged);
  }

  // Drop singletons, score, sort
  const out: ComponentCluster[] = [];
  for (const cl of clusters) {
    if (cl.length < 2) continue;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < cl.length; i++) {
      for (let j = i + 1; j < cl.length; j++) {
        sum += sim[cl[i]!]![cl[j]!]!;
        count++;
      }
    }
    const avg = count === 0 ? 0 : sum / count;
    const components = cl.map((i) => fps[i]!);
    const sameCategory = components.every((c) => c.category === components[0]!.category);
    let confidence: MergeConfidence;
    if (avg >= 0.8 && sameCategory) confidence = "high";
    else if (avg >= 0.65) confidence = "medium";
    else confidence = "low";
    out.push({ id: 0, components, similarity_score: avg, merge_confidence: confidence });
  }

  out.sort((a, b) => b.components.length - a.components.length || b.similarity_score - a.similarity_score);
  out.forEach((c, idx) => { c.id = idx + 1; });
  return out;
}
