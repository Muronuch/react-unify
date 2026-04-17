import type { ComponentCluster } from "../clusterer/cluster.js";

export function buildProposalPrompt(cluster: ComponentCluster, sources: string[]): string {
  const componentBlocks = sources.map((src, i) => {
    const c = cluster.components[i]!;
    return `### Component ${i + 1}: ${c.component_name}
File: ${c.file_path}

\`\`\`tsx
${src}
\`\`\``;
  }).join("\n\n");

  const rewriteBlocks = sources.map((_, i) => `### REWRITE_${i + 1}_START
\`\`\`tsx
// How to rewrite Component ${i + 1} as a thin wrapper around the generic component.
// Keep the original component name and file path unchanged.
\`\`\`
### REWRITE_${i + 1}_END`).join("\n\n");

  return `You are a senior React/TypeScript engineer. You are given ${sources.length} React components that are structurally similar. Your job is to create ONE generic component that replaces all of them.

## Requirements

1. The generic component must be a valid TypeScript React functional component.
2. It must have a well-designed props interface that covers ALL use cases of ALL original components.
3. Props that only some originals use must be optional.
4. Use discriminated unions or conditional props where behavior differs significantly.
5. The generic component should use the same hooks and patterns as the originals.
6. Name it descriptively (e.g. if merging UserCard, ProductCard, TeamCard → ItemCard).
7. Include JSDoc comments on the props interface explaining each prop.
8. Each REWRITE block must be a thin wrapper that keeps the original component's name and file location, so callers do not need to change imports.

## Original Components

${componentBlocks}

## Output Format

Respond with EXACTLY this structure, no other text:

### GENERIC_COMPONENT_START
\`\`\`tsx
// The unified generic component with full TypeScript types
\`\`\`
### GENERIC_COMPONENT_END

${rewriteBlocks}
`;
}

export function buildRetryPrompt(originalPrompt: string, errorMessage: string): string {
  return `${originalPrompt}

The previous attempt failed with this error:
${errorMessage}

Please fix the generic component and try again. Make sure it is valid TypeScript and that you respect the exact output format above.`;
}
