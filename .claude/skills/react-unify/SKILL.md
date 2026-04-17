---
name: react-unify
description: Use when the user asks to find duplicate, similar, or copy-pasted React components; identify refactoring targets; reduce component count; or merge structurally similar UI components into a single generic component. Runs the react-unify CLI to produce a cluster report and helps the user manage exclusion rules conversationally.
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

Also trigger when the user reacts to a previous scan result with a rule-management intent: *"always keep X separate"*, *"ignore Y"*, *"don't flag Z anymore"* — route those to the "managing exclusion rules" section below.

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

Always write the report to a predictable location you can read afterward. `/tmp/react-unify-report.md` works on Unix/Windows-bash.

**Pick the scan path carefully.** Prefer `./src`; fall back to `./app`, `./apps/*/src`, or the closest equivalent. Don't scan the repo root.

The tool auto-discovers `.react-unify.json` by walking up from the scan directory. When it's found, you'll see `Using rules from <path>` in the output — mention this to the user so they know rules were applied.

### Threshold selection

The default threshold (0.75) is calibrated for small-to-medium codebases. Adjust on the fly:

- If the scan finds **more than ~25 clusters** or any **very large clusters** (8-sized at the cap): raise to `--threshold 0.85`. Large codebases over-merge.
- If it finds **fewer than ~5 clusters** on a visibly large codebase: lower to `--threshold 0.65` and retry.
- One rerun at a different threshold is fine. Don't iterate more than twice.

### With an API key (full pipeline)

If `ANTHROPIC_API_KEY` is set and the user wants actual proposals (not just clusters), drop `--dry-run`:

```bash
react-unify scan <path> -o /tmp/react-unify-report.md
```

This takes minutes. Set expectations before running.

## Reading and summarizing the report

Read `/tmp/react-unify-report.md`. For the user, summarize in this order:

1. **Headline**: "Scanned N components, found M cluster(s) of near-duplicates." Mention if rules filtered anything: "(X components excluded, Y pairs blocked per `.react-unify.json` rules)".
2. **Top 3–5 clusters** (highest similarity, ideally high confidence). For each:
   - Cluster theme if obvious (e.g. "Delete drawers across 7 entity types", "3 dashboard layouts", "Desktop/Mobile variants of the same dropdown")
   - Number of members and total line count
   - One-line recommendation: "Strong merge candidate" / "Worth reviewing" / "Borderline"
3. **Total potential savings** if proposals were generated.
4. **Mention the report path** so the user can open it — `file:///` links in it are clickable in VSCode.

Do NOT dump the raw cluster list into chat. Summarize.

## Managing exclusion rules (conversational)

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

Rules apply in two places:
- `exclude.paths` and `exclude.components` filter components during the scan.
- `neverClusterTogether` blocks pairs of components whose names match different patterns in the same rule from ever ending up in the same cluster.

### When the user rejects a cluster

Route based on their phrasing:

| User says | Action |
|---|---|
| "yes" / "merge these" / accepts | No rule change |
| "ignore cluster N" / "skip this one" | Stay in session memory only, don't touch `.react-unify.json` |
| "keep separate" / "no, these are different" (ambiguous) | Ask: "One-off for this scan, or a permanent repo rule?" and proceed accordingly |
| "always separate" / "team standard" / "by design" / "never merge X and Y" | Propose a `neverClusterTogether` rule; see below |
| "I never want to merge X in any project" / "remember this across projects" | Save as Claude memory (feedback type); see below |

### Writing a repo rule

When a repo rule is warranted, propose the exact JSON you'd add and show the user before writing:

> "I'll add this to `.react-unify.json`:
> ```json
> {
>   "description": "Create/Update drawers kept separate per team standard (2026-04-17)",
>   "patterns": ["Create.*Drawer", "Update.*Drawer"]
> }
> ```
> Add and stage for commit? (y/n)"

If `.react-unify.json` doesn't exist yet, create it at the project root with just this rule inside `neverClusterTogether`. If it exists, append.

After writing, **stage with `git add` but do NOT commit automatically**. Show the user the diff (`git diff --cached .react-unify.json`) and ask if they want to commit. Let them name the commit or accept a suggested message like `chore: react-unify rule — keep Create/Update drawers separate`.

### Proactive rule suggestions

If a cluster's members cleanly fit one of these well-known families, proactively propose a rule instead of waiting for the user to object:

- **Create / Update / Delete drawers or dialogs** — almost always intentionally separate in CRUD apps
- **Desktop / Mobile variants** (`*Desktop` vs `*Mobile`) — usually intentional viewport branches
- **Component + Component\*Test** — tests shouldn't cluster with their implementations (usually filtered by `exclude.paths` instead)

When the user confirms, write the rule. When they reject, respect that and drop it.

### Regex rules

Patterns compile to case-insensitive JavaScript regex. `(?i)` prefix is stripped automatically so Python/Go-style patterns work. Always show the patterns to the user before writing — regex errors are on the author.

### Writing a Claude memory (cross-project preference)

ONLY when the user explicitly says "remember this across projects", "always, everywhere", "I personally never...", or a similar global scope marker. Never save to memory for one-off or per-repo preferences.

Save as a `feedback` memory under the user's Claude memory directory with a clear name (e.g. `feedback_react_unify_never_merge_dropdowns.md`). Include **Why** (user stated reason) and **How to apply** (when react-unify runs in any project, check if the pattern applies and proactively propose a repo rule for that project).

Confirm the memory was written.

## Verifying a cluster is real

When a cluster looks interesting but you're unsure, spot-check by reading 2-3 of its members and diffing them. A genuine duplication cluster will differ mostly in:
- Entity/domain name in identifiers (UserCard vs ProductCard)
- API endpoints
- i18n keys
- Tailwind/CSS class strings

…not in JSX structure, hook usage, or control flow. If JSX structure differs meaningfully, flag the cluster as borderline.

## Common follow-up work

After summarizing, offer next steps based on what was found:

- **"Want me to write a unified component for cluster N?"** — manually implement a generic for one specific high-value cluster, with the originals rewritten as thin wrappers.
- **"Want to rerun with the LLM proposer?"** — requires `ANTHROPIC_API_KEY`.
- **"Want to rerun at a different threshold?"** — if initial results were too broad or too narrow.
- **"Want to add a repo rule for this pattern?"** — when user dismisses clusters that match a well-known family.

## Known limitations to mention if relevant

- Only the `anthropic` LLM provider is implemented.
- The verifier uses `react-unify`'s own TypeScript install, not the target project's. Use `--no-verify` for projects with unusual type dependencies.
- The tool is read-only against the target project — it never modifies source files. Applying a merge is manual.
