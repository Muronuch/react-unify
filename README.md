# react-unify

A CLI that scans a React/TypeScript codebase, finds structurally similar components by AST shape, and writes a markdown cluster report with clickable `file:///` source links. Designed to pair with Claude Code (or any human reviewer) — the tool surfaces the duplication; you (or Claude Code) decide what to merge.

Optional `--propose` flag adds an LLM step that drafts a unified component per cluster and verifies it compiles via `tsc`. Off by default; you don't need an API key for the core workflow.

## How it's different

Most "duplicate code" detectors compare tokens or line hashes (jscpd, SonarQube's CPD). They're language-agnostic but blind to *what the code does* — they miss two components that have the same shape but different identifiers, and they flag two functions that happen to share a few lines but solve unrelated problems.

`react-unify` is built around a few choices that make it useful specifically for React refactoring:

- **AST-aware fingerprinting, not token diff.** Uses `ts-morph` to extract each component's props, hooks, JSX tag bag, structural flags (list rendering, conditional, data-fetching, forms), and depth — then clusters by Jaccard-weighted similarity of those fingerprints. Result: it groups three Card components that differ only in `userName` vs `productName` vs `teamName`, and ignores two unrelated functions that happen to share a `useEffect`.
- **React-specific category heuristics.** Knows what looks like a form, list, card, modal, or navigation — uses that to keep the clusterer from merging a `<form>` with a `<table>` even when their hook profiles overlap.
- **Repo-level rules for team standards.** A `.react-unify.json` lets you encode policies like *"Create / Update / Delete drawers stay separate by design"* — the scanner won't propose merging across them. Most duplication detectors have no way to express this.
- **Optional LLM, deterministic core.** The clusterer + report run in seconds with no API key. Drafting the unified component via LLM is opt-in (`--propose`); skip it and let Claude Code (or you) write the merge with full project context.
- **Built for Claude Code workflows.** Ships a skill so *"find duplicate components"* in Claude Code triggers the scan, summarizes top clusters in chat with clickable source links, and offers two merge paths (Claude Code writes it, or run `--propose`).
- **Read-only.** Never modifies your source. The markdown report is the artifact; you stay in control of every diff.

If you're already using jscpd / SonarQube / CodeClimate for general duplication metrics, this is complementary — they tell you the codebase has 3% duplication; react-unify tells you *which 11 Delete drawers* to look at and points you straight to the line ranges.

## Install

```bash
npm install -g @muronuch/react-unify
# or run without installing:
npx @muronuch/react-unify scan ./src
```

The CLI binary is `react-unify` (the npm package is scoped because the bare name was taken).

### Claude Code integration (recommended)

`react-unify` ships with a Claude Code skill. Install it once and Claude Code will invoke the tool whenever you ask *"find duplicate components"*, *"what can I deduplicate?"*, or *"scan for refactoring opportunities"*.

After `npm install -g @muronuch/react-unify`:

```bash
# Linux / macOS
mkdir -p ~/.claude/skills
cp -r "$(npm root -g)/@muronuch/react-unify/.claude/skills/react-unify" ~/.claude/skills/

# Windows (bash)
mkdir -p "$HOME/.claude/skills"
cp -r "$(npm root -g)/@muronuch/react-unify/.claude/skills/react-unify" "$HOME/.claude/skills/"
```

Or install per-project: copy the `.claude/skills/react-unify` folder into your project's root. Claude Code picks it up from either location.

With the skill installed, open Claude Code in any React project and say *"find duplicate components"*. Claude Code runs the scan, summarizes the top clusters, and offers to write the unified component using your project's full context. No need to remember CLI flags.

## Demo

Run against the bundled sample fixture (8 components in 3 deliberate clusters):

```
$ react-unify scan ./test/fixtures/sample-project
✔ Found 8 components
✔ Fingerprinted
✔ Found 3 cluster(s)
Scanned 8 components
Found 3 cluster(s) — 0 mergeable
Report written to ./react-unify-report.md
(re-run with --propose for LLM-generated unified-component proposals)
```

A snippet from the report:

```markdown
## Cluster 1 — confidence: high (similarity 1.00)

**Components:**
- [`UserCard`](src/components/UserCard.tsx#L9-L21) — 21 lines L9-21
- [`ProductCard`](src/components/ProductCard.tsx#L9-L21) — 21 lines L9-21
- [`TeamCard`](src/components/TeamCard.tsx#L9-L21) — 21 lines L9-21

## Cluster 2 — confidence: high (similarity 0.90)

**Components:**
- [`UserList`](src/components/UserList.tsx#L7-L20) — 14 lines L7-20
- [`ProductList`](src/components/ProductList.tsx#L7-L20) — 14 lines L7-20
```

Links are clickable in VSCode's markdown preview — Ctrl+click jumps to the component's line range. Scaling this up to a real codebase is the same command pointed at your `./src`.

## Usage

```bash
react-unify scan <directory> [options]
```

### Options

| Flag | Default | Description |
| --- | --- | --- |
| `-t, --threshold <0..1>` | `0.75` | Similarity threshold for clustering |
| `-o, --output <path>` | `react-unify-report.md` | Report output path |
| `--json` | off | Emit JSON instead of markdown |
| `--verbose` | off | Verbose output |
| `--max-clusters <n>` | `20` | Max clusters to process |
| `--min-cluster-size <n>` | `2` | Min components per cluster |
| `--max-cluster-size <n>` | `8` | Max components per cluster (prevents runaway merges) |
| `--config <path>` | auto-discover | Path to a `.react-unify.json` rules file |
| `--no-config` | off | Skip auto-discovery of `.react-unify.json` |
| **Opt-in LLM proposer** | | |
| `--propose` | off | Generate LLM-drafted unified components + tsc verification per cluster |
| `--no-verify` | off | With `--propose`: skip TypeScript compilation verification |
| `--no-tests` | off | With `--propose`: skip test verification |
| `--provider <name>` | `anthropic` | With `--propose`: only `anthropic` implemented in v1 |
| `--model <name>` | `claude-sonnet-4-6` | With `--propose`: LLM model |

### Environment (only needed for `--propose`)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

The default scan-only mode never calls an LLM — no key required. Set the variable only if you plan to use `--propose`.

## Recommended first run

```bash
react-unify scan ./src
```

Surfaces clusters in seconds. No API key, no cost. Inspect `react-unify-report.md` and decide what to merge — either by hand, by pairing with Claude Code (recommended; see the skill below), or by re-running with `--propose` to get LLM-drafted starting points embedded in the report.

Add `react-unify-report.*` to your project's `.gitignore` so scan artefacts don't get committed.

## Interpreting the report

The report is grouped by cluster. Each cluster entry includes:

- **Confidence** (`high` / `medium` / `low`) — from the `similarity_score` (≥0.8 with same category = high; ≥0.65 = medium; else low)
- **Similarity** — weighted average of Jaccard overlaps on hooks, JSX tags, prop types, structural flags, and JSX depth closeness
- **Components** — clickable `file:///`-URI links (Ctrl+click in VSCode jumps to the component's line range in the source file)
- **Proposal** (only with `--propose`) — a generic component the LLM drafted to replace the cluster; the line-range links above tell you which originals it would replace
- **Verification** (only with `--propose`) — ✅ if the proposal compiles in a temp copy of the target project via `tsc --noEmit`

A "good" candidate cluster typically looks like:
- 2–8 members in the same category (cards, forms, drawers, list pages, entity pickers, etc.)
- High confidence / ≥0.85 similarity
- Components differ primarily in entity type, API endpoint, i18n keys, or styling, not in structure

A "probably not worth merging" cluster:
- Low confidence / <0.7 similarity
- Members span different categories
- Structural differences large enough that a generic component would need heavy conditional logic

## Rules: `.react-unify.json`

Drop a `.react-unify.json` at your project root to tell `react-unify` which components or patterns to skip. The tool walks up from the scan directory to find it; override with `--config <path>`, disable with `--no-config`.

```json
{
  "exclude": {
    "paths": ["**/*.test.tsx", "**/generated/**"],
    "components": ["LegacyButton", "DeprecatedModal"]
  },
  "neverClusterTogether": [
    {
      "description": "Create/Update drawers follow distinct validation paths (team standard)",
      "patterns": ["Create.*Drawer", "Update.*Drawer"]
    },
    {
      "description": "Desktop and Mobile variants are intentional viewport branches",
      "patterns": [".*Desktop$", ".*Mobile$"]
    }
  ]
}
```

**`exclude.paths`** — glob patterns (supports `*`, `**`, `?`). Components whose file paths match any pattern are dropped before clustering.

**`exclude.components`** — exact component names to drop (simple allowlist-by-name).

**`neverClusterTogether`** — each rule has a `description` (free text, for your future self) and a `patterns` array of 2+ JavaScript regexes. Patterns partition components into families; any pair whose families are disjoint within the rule can never end up in the same cluster. Patterns are case-insensitive; `(?i)` prefix is stripped.

### Editing rules via Claude Code

If you installed the Claude Code skill ([see Install section](#claude-code-integration-recommended)), you can manage rules conversationally:

- *"Cluster 2 should always be separate — team standard"* → Claude Code proposes a `neverClusterTogether` rule, shows the JSON, stages the change, and asks before committing.
- *"Ignore cluster 5 for now"* → Claude Code drops it from this session's summary only; no file change.
- *"Never flag these in any project"* → Claude Code saves a personal preference to its memory, applies it next time you run the skill in any repo.

You never have to remember the JSON schema.

## Tuning the threshold

- **Small codebase (<50 components)**: default `0.75` usually fine.
- **Large codebase (500+ components)**: start at `0.85`. Lower thresholds over-merge on large projects because many CRUD shells look alike to the fingerprinter.
- If clusters feel too noisy: raise the threshold.
- If obvious duplicates are being split: lower it by 0.05 and re-run.

The `--max-cluster-size` cap (default 8) is the second lever. Raise it if your codebase has genuinely large families of near-duplicates; lower it to force finer-grained groupings.

## Troubleshooting

**"No .tsx/.jsx components found"** — The target path may be wrong, or all components live in excluded directories (`node_modules`, `dist`, `build`, `.next`, `coverage`, `__tests__`, `.git`). Point the scanner at `./src` explicitly, not the repo root.

**`--propose requires an API key`** — Set `ANTHROPIC_API_KEY` (or your provider's variable) in your shell. The default scan-only mode never needs a key; this error only fires when `--propose` is passed without one.

**Verifier fails on every cluster** — The verifier runs `npx tsc --noEmit --project <temp-copy>/tsconfig.json`. It uses `react-unify`'s own TypeScript install (the target's `node_modules` is intentionally skipped during copy). If your project relies on non-standard type packages or path aliases, the verifier may report phantom errors. Use `--no-verify` to skip this step if needed.

**Clusters over-merge into one giant cluster** — Raise `--threshold` and/or lower `--max-cluster-size`. See "Tuning the threshold" above.

**Links in the report don't open** — They use `file:///` URIs with `#L<start>-L<end>` anchors. Ctrl+click works in VSCode's markdown preview. Some other Markdown renderers don't follow `file://` links for security reasons; in that case open the path manually.

## How it works

```
parser (ts-morph) → analyzer (structural fingerprint) → clusterer
    (Jaccard-weighted similarity + capped agglomerative clustering)
    → proposer (LLM) → verifier (tsc) → reporter (markdown/JSON)
```

Each cluster's proposal is a generic component plus thin wrappers that keep the original component names and file paths intact, so nothing else in the codebase needs to change.

## Develop locally

To work on `react-unify` itself:

```bash
git clone https://github.com/Muronuch/react-unify.git
cd react-unify
npm install
npm run build
npm link            # registers `react-unify` against your local build
```

To upgrade later: `git pull && npm run build`. To unlink: `npm unlink -g react-unify`.

Run directly without linking:

```bash
node /path/to/react-unify/dist/index.js scan ./src
```

Common scripts:

```bash
npm test          # run vitest
npm run typecheck # tsc --noEmit
npm run build     # compile to dist/
npm run dev       # run src/index.ts via tsx (no build step)
```

The sample fixture project at [test/fixtures/sample-project/](test/fixtures/sample-project/) has 8 components in 3 expected clusters (cards, lists, forms) — useful for smoke-testing changes end-to-end.

## License

[MIT](LICENSE).
