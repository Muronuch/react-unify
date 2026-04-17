---
name: react-unify
description: Use when the user asks to find duplicate, similar, or copy-pasted React components; identify refactoring targets; reduce component count; or merge structurally similar UI components into a single generic component. Runs the react-unify CLI to produce a markdown cluster report.
---

# react-unify

Finds structurally similar React/TypeScript components in a codebase, clusters them by shape, and (with an Anthropic API key) proposes LLM-generated unified components that compile via `tsc`.

## When to invoke this skill

Trigger on requests like:
- "find duplicate components"
- "which components are similar?"
- "what can I deduplicate in this React app?"
- "scan for components that could be merged"
- "refactoring opportunities in the frontend"
- "reduce component count"

Skip if: the codebase is not React/TypeScript, or the user is asking about a single specific component rather than repo-wide patterns.

## Preflight

Before running, check the CLI is installed:

```bash
command -v react-unify
```

If not found, tell the user:
> "`react-unify` isn't installed on this machine. To install it: clone the repo, then `cd react-unify && npm install && npm run build && npm link`. Point me at the repo if you have it locally, or I can help you set it up."

Then stop. Don't try to run the tool.

## Running the scan

Default invocation (dry-run first — no API cost, no LLM calls, finishes in seconds):

```bash
react-unify scan <path-to-src> --dry-run -o /tmp/react-unify-report.md
```

Always write the report to a predictable location you can read afterward. `/tmp/react-unify-report.md` on Unix/Windows-bash, or a project-root file if the user prefers.

**Pick the scan path carefully.** If the user says "this project", use `./src` unless `./src` doesn't exist — then try `./app`, `./apps/web/src`, or whatever layout the repo has. Don't scan the repo root (will hit `node_modules` via a misconfiguration otherwise).

### Threshold selection

The default threshold (0.75) is calibrated for small-to-medium codebases. Adjust on the fly:

- If the scan finds **more than ~25 clusters** or any **very large clusters** (8-sized at the cap): raise to `--threshold 0.85`. Large codebases over-merge.
- If it finds **fewer than ~5 clusters** on a visibly large codebase: lower to `--threshold 0.65` and retry.
- One rerun at a different threshold is fine. Don't iterate more than twice — if the tool isn't finding good clusters at a reasonable threshold, the codebase may just not have much duplication, and that's the answer.

### With an API key (full pipeline)

If `ANTHROPIC_API_KEY` is set and the user wants actual proposals (not just clusters), drop `--dry-run`:

```bash
react-unify scan <path> -o /tmp/react-unify-report.md
```

This takes minutes (one LLM call per cluster + `tsc` verification per proposal). Set expectations before running.

## Reading and summarizing the report

Read `/tmp/react-unify-report.md`. The report is structured as:
- Summary block (component/cluster counts, savings estimate)
- One section per cluster: confidence + similarity + component list with `file:///` links + optional proposal + verification status

For the user, summarize in this order:

1. **Headline**: "Scanned N components, found M cluster(s) of near-duplicates."
2. **Top 3–5 clusters** (highest similarity, ideally high confidence). For each:
   - Cluster theme if obvious (e.g. "Delete drawers across 7 entity types", "3 dashboard layouts", "Desktop/Mobile variants of the same dropdown")
   - Number of members and total line count
   - One-line recommendation: "Strong merge candidate" / "Worth reviewing" / "Borderline"
3. **Total potential savings** if proposals were generated (`Potential savings: X lines`).
4. **Mention the full report path** so the user can open it: clickable `file:///` links in VSCode's markdown preview jump to the exact component lines.

Do NOT dump the raw cluster list into chat. Summarize.

## Verifying a cluster is real

When a cluster looks interesting but you're unsure, spot-check by reading 2-3 of its members and diffing them. A genuine duplication cluster will differ mostly in:
- Entity/domain name in identifiers (UserCard vs ProductCard)
- API endpoints
- i18n keys
- Tailwind/CSS class strings

…not in JSX structure, hook usage, or control flow.

If JSX structure differs meaningfully, flag the cluster as borderline, not a clean merge target.

## Common follow-up work

After summarizing, offer next steps based on what was found:

- **"Want me to write a unified component for cluster N?"** — manually implement a generic for one specific high-value cluster, with the originals rewritten as thin wrappers.
- **"Want to rerun with the LLM proposer?"** — requires `ANTHROPIC_API_KEY`; produces proposals + `tsc` verification.
- **"Want to rerun at a different threshold?"** — if initial results were too broad or too narrow.

## Known limitations to mention if relevant

- Only the `anthropic` LLM provider is implemented. `--provider openai|deepseek` flags exist but throw.
- The verifier uses `react-unify`'s own TypeScript install, not the target project's. Occasional type-error false positives in projects with unusual type packages or path aliases. Use `--no-verify` to skip if needed.
- The tool is read-only against the target project — it never modifies files in-place. The user manually applies any merges.
