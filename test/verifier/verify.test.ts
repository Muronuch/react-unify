import { describe, it, expect } from "vitest";
import path from "node:path";
import { verifyProposal, resolveGenericPath } from "../../src/verifier/verify.js";
import type { ProposalResult } from "../../src/proposer/propose.js";

const PROJECT = path.join(process.cwd(), "test", "fixtures", "verifier-project");
const ALT_PROJECT = path.join(process.cwd(), "test", "fixtures", "verifier-project-alt");

const IDENTITY_PROPOSAL: ProposalResult = {
  cluster_id: 1,
  generic_component: {
    name: "GenericHello",
    file_name: "GenericHello.tsx",
    source: `export const GenericHello = ({ name }: { name: string }): string => "Hi " + name;`,
  },
  rewrites: [
    {
      original_name: "Hello",
      original_path: path.join(PROJECT, "src", "components", "Hello.tsx"),
      rewrite_source: `import { GenericHello } from "./unified/GenericHello.js";
export const Hello = ({ name }: { name: string }): string => GenericHello({ name });`,
    },
  ],
  lines_before: 2,
  lines_after: 2,
  savings: 0,
};

describe("verifyProposal", () => {
  it("compiles a valid identity rewrite", async () => {
    const result = await verifyProposal(IDENTITY_PROPOSAL, PROJECT);
    expect(result.compiles).toBe(true);
    expect(result.type_errors).toEqual([]);
  });

  it("flags type errors when rewrite is broken", async () => {
    const broken: ProposalResult = {
      ...IDENTITY_PROPOSAL,
      rewrites: [{
        ...IDENTITY_PROPOSAL.rewrites[0]!,
        rewrite_source: `import { GenericHello } from "./unified/GenericHello.js";
export const Hello = (props: { name: number }): string => GenericHello({ name: props.name });`,
      }],
    };
    const result = await verifyProposal(broken, PROJECT);
    expect(result.compiles).toBe(false);
    expect(result.type_errors.length).toBeGreaterThan(0);
  });
}, { timeout: 60000 });

const ALT_PROPOSAL: ProposalResult = {
  cluster_id: 2,
  generic_component: {
    name: "GenericHello",
    file_name: "GenericHello.tsx",
    source: `export const GenericHello = ({ name }: { name: string }): string => "Hi " + name;`,
  },
  rewrites: [
    {
      original_name: "Hello",
      original_path: path.join(ALT_PROJECT, "lib", "components", "Hello.tsx"),
      rewrite_source: `import { GenericHello } from "./shared/GenericHello.js";
export const Hello = ({ name }: { name: string }): string => GenericHello({ name });`,
    },
  ],
  lines_before: 2,
  lines_after: 2,
  savings: 0,
};

describe("resolveGenericPath", () => {
  it("resolves a relative import from a non-standard layout", () => {
    const resolved = resolveGenericPath(ALT_PROPOSAL, "/tmp/work", ALT_PROJECT);
    expect(resolved.replace(/\\/g, "/")).toContain("lib/components/shared/GenericHello.tsx");
  });
});

describe("verifyProposal — non-standard layout", () => {
  it("compiles a rewrite where the generic lives at a non-standard import path", async () => {
    const result = await verifyProposal(ALT_PROPOSAL, ALT_PROJECT);
    expect(result.compiles).toBe(true);
    expect(result.type_errors).toEqual([]);
  });
}, { timeout: 60000 });
