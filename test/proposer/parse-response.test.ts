import { describe, it, expect } from "vitest";
import { parseLlmResponse } from "../../src/proposer/parse-response.js";

const SAMPLE = `### GENERIC_COMPONENT_START
\`\`\`tsx
export const ItemCard = (props: ItemCardProps) => <div>{props.title}</div>;
\`\`\`
### GENERIC_COMPONENT_END

### REWRITE_1_START
\`\`\`tsx
import { ItemCard } from "./unified/ItemCard";
export const UserCard = (p: { userName: string }) => <ItemCard title={p.userName} />;
\`\`\`
### REWRITE_1_END

### REWRITE_2_START
\`\`\`tsx
import { ItemCard } from "./unified/ItemCard";
export const ProductCard = (p: { productName: string }) => <ItemCard title={p.productName} />;
\`\`\`
### REWRITE_2_END
`;

describe("parseLlmResponse", () => {
  it("extracts the generic component and N rewrites", () => {
    const parsed = parseLlmResponse(SAMPLE, 2);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.generic_source).toContain("ItemCard");
    expect(parsed.rewrites).toHaveLength(2);
    expect(parsed.rewrites[0]).toContain("UserCard");
    expect(parsed.rewrites[1]).toContain("ProductCard");
  });

  it("returns ok:false when GENERIC block is missing", () => {
    const parsed = parseLlmResponse("nothing here", 2);
    expect(parsed.ok).toBe(false);
  });

  it("returns ok:false when expected rewrite count is not met", () => {
    const partial = SAMPLE.replace(/### REWRITE_2_START[\s\S]*### REWRITE_2_END\s*/m, "");
    const parsed = parseLlmResponse(partial, 2);
    expect(parsed.ok).toBe(false);
  });
});
