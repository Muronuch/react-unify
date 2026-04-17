---
name: react-unify
description: Use when the user asks to find duplicate, similar, or copy-pasted React components; identify refactoring targets; reduce component count; or merge structurally similar UI components into a single generic component. Runs the react-unify CLI to produce a cluster report; helps the user manage exclusion rules and merge clusters either using Claude Code natively or via the optional --propose LLM step.
---

# react-unify

A CLI that scans React/TypeScript codebases for structurally similar components and writes a markdown cluster report with clickable source links. The tool's primary job is **scan + cluster + report** — fast, no API key, no LLM. There is also an opt-in `--propose` mode that calls an LLM to draft a unified component, but for most workflows the better merge path is to let Claude Code (you) write the unified component using the project's full context.

## When to invoke this skill

Trigger on:
- "find duplicate components"
- "what can I deduplicate?"
- "scan for refactoring opportunities"
- "merge similar components"
- "reduce component count"
- Plus rule-management follow-ups: "always keep X separate", "ignore Y", "don't flag Z"

Skip if: the codebase is not React/TypeScript, or the user is asking about a single component (not repo-wide patterns).

## Preflight

```bash
command -v react-unify
```

If not found:
> "`react-unify` isn't installed. Clone the repo, then `cd react-unify && npm install && npm run build && npm link`."

Then stop.

## Default flow: scan-only

```bash
react-unify scan <path-to-src> -o /tmp/react-unify-report.md
```

Pick the path: prefer `./src`; fall back to `./app`, `./apps/*/src`, etc. Don't scan repo root.

The tool auto-discovers `.react-unify.json` walking up from the scan dir; if found, it'll log `Using rules from <path>`. Mention it.

### Threshold tuning

Default 0.75 fits most projects. Adjust:
- 25+ clusters or several at the 8-cap → `--threshold 0.85`
- <5 clusters on a visibly large codebase → `--threshold 0.65`

One rerun max. If the tool isn't finding clusters at sane thresholds, the codebase doesn't have much duplication and that's the answer.

## Reading the report

Read `/tmp/react-unify-report.md`. Summarize for the user:

1. **Headline**: "Scanned N components, found M cluster(s)." Mention rule-filtering if any: "(X excluded, Y pairs blocked per `.react-unify.json`)".
2. **Top 3–5 clusters** by similarity. For each:
   - Cluster theme if obvious ("Delete drawers across 7 entity types", "Desktop/Mobile dropdown variants")
   - Member count and total lines
   - Recommendation: "Strong merge candidate" / "Worth reviewing" / "Borderline"
3. **Mention the report path** — `file:///` links are clickable in VSCode.

Don't dump the raw cluster list into chat. Summarize.

## Merging a cluster: two paths

When the user picks a cluster and wants to merge it, **offer both paths and let them choose**:

**Path A — Claude Code writes the merge (recommended for most cases)**
- You read the cluster's component sources (line ranges in the report make this easy)
- You design the unified component using the project's actual conventions, sibling files, type aliases, etc.
- You write `src/components/unified/<Name>.tsx` (or whatever path makes sense for the layout)
- You rewrite each original file as a thin wrapper that re-exports the same name
- You run `tsc --noEmit` and any test suite the project has
- You iterate on errors
- You show the diff and commit on user confirmation

This uses your full context, can ask clarifying questions, and iterates on type errors.

**Path B — `react-unify --propose` (optional)**
```bash
react-unify scan <path> --propose -o /tmp/react-unify-report.md
```

Calls the configured LLM (Anthropic by default), generates a unified component + thin-wrapper rewrites for each cluster, optionally runs `tsc --noEmit` against a temp copy. Requires `ANTHROPIC_API_KEY`.

When this is useful:
- The user wants a reproducible artifact in the report (the proposal lives in the markdown)
- The user prefers a one-shot LLM call without running a longer Claude Code session
- The user wants the verifier's pass/fail signal as part of the report

When to skip Path B: if you (Claude Code) have full context on this codebase, Path A produces better results because it iterates and uses real project setup.

Say something like:
> "Want me to write the unified component myself (uses my session context, iterates on errors), or run `react-unify --propose` to get an LLM-generated proposal embedded in the report?"

## Managing exclusion rules

`.react-unify.json` at the project root holds per-repo rules. Format:

```json
{
  "exclude": {
    "paths": ["**/*.test.tsx", "**/generated/**"],
    "components": ["LegacyButton"]
  },
  "neverClusterTogether": [
    {
      "description": "Create/Update drawers follow distinct validation paths (team standard)",
      "patterns": ["Create.*Drawer", "Update.*Drawer"]
    }
  ]
}
```

### Routing rejections

| User says | Action |
|---|---|
| "yes" / "merge these" / accepts | No rule change |
| "ignore cluster N" / "skip this one" | Session-only, no file change |
| "keep separate" (ambiguous) | Ask: "One-off, or permanent repo rule?" |
| "always separate" / "team standard" / "by design" / "never merge X and Y" | Propose `neverClusterTogether` rule, show JSON, stage with `git add`, ask before commit |
| "I never want to merge X in any project" / "remember across projects" | Save as Claude `feedback` memory; confirm |

### Proactive suggestions

If a cluster cleanly fits one of these well-known families, propose a rule **before** the user objects:

- **Create / Update / Delete drawers or dialogs** — almost always intentionally separate in CRUD apps
- **Desktop / Mobile variants** (`*Desktop` vs `*Mobile`) — usually intentional viewport branches

Show the JSON, ask, write on confirm.

### Writing rules

Show the proposed JSON before writing. Use a `description` field that captures the user's stated reason and includes today's date. After writing:
```bash
git add .react-unify.json
git diff --cached .react-unify.json
```
Show the diff. Ask before committing. Suggest a commit message like `chore: react-unify rule — keep Create/Update drawers separate` but let the user override.

### Cross-project memory

ONLY when the user explicitly says "remember across projects", "in any project", "everywhere". Save as a Claude `feedback` memory with **Why** (their reason) and **How to apply** (when react-unify runs in any project, suggest the matching repo rule).

## Verifying a cluster is real

Spot-check by reading 2–3 members and diffing. A genuine duplication cluster differs in:
- Entity/domain name in identifiers
- API endpoints
- i18n keys
- CSS classes

…not in JSX structure, hook usage, or control flow. If structure differs, flag as borderline.

## Known limitations

- Only the `anthropic` LLM provider is implemented for `--propose`.
- The `--propose` verifier uses `react-unify`'s own TypeScript install, not the target project's. For projects with unusual type packages, use `--no-verify` or just go with Path A (Claude Code merges).
- The tool is read-only against the target project — never modifies source files. All merges (Path A or Path B) require manual application.
