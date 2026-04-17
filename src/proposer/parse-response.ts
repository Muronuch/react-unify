// src/proposer/parse-response.ts
export type ParseResult =
  | { ok: true; generic_source: string; rewrites: string[] }
  | { ok: false; error: string };

const FENCE = /^```(?:tsx|ts|jsx|js)?\s*\n([\s\S]*?)\n```$/m;

function extractBlock(text: string, startMarker: string, endMarker: string): string | null {
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker, startIdx + startMarker.length);
  if (startIdx < 0 || endIdx < 0) return null;
  const inner = text.slice(startIdx + startMarker.length, endIdx).trim();
  const m = inner.match(FENCE);
  if (m && m[1] !== undefined) return m[1].trim();
  return inner; // fall back to raw inner if no fence
}

export function parseLlmResponse(text: string, expectedRewrites: number): ParseResult {
  const generic = extractBlock(text, "### GENERIC_COMPONENT_START", "### GENERIC_COMPONENT_END");
  if (!generic) return { ok: false, error: "Missing GENERIC_COMPONENT block" };
  const rewrites: string[] = [];
  for (let i = 1; i <= expectedRewrites; i++) {
    const rw = extractBlock(text, `### REWRITE_${i}_START`, `### REWRITE_${i}_END`);
    if (!rw) return { ok: false, error: `Missing REWRITE_${i} block` };
    rewrites.push(rw);
  }
  return { ok: true, generic_source: generic, rewrites };
}
