# react-unify

A CLI that scans a React/TypeScript codebase, finds structurally similar components, and uses an LLM to propose a single generic component that replaces them. Verifies the proposal compiles and reports proposed line savings.

## Install

This package is not yet published to npm. To use it today, clone and link locally:

```bash
git clone <this-repo> react-unify
cd react-unify
npm install
npm run build
npm link
```

`npm link` registers the `react-unify` command globally against your local build. To upgrade later: `git pull && npm run build`. To uninstall: `npm unlink -g react-unify`.

Alternatively, run directly from the repo without linking:

```bash
node /path/to/react-unify/dist/index.js scan ./src
```

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
| `--no-verify` | off | Skip TypeScript compilation verification |
| `--no-tests` | off | Skip test verification |
| `--provider <name>` | `anthropic` | `anthropic` (only one implemented in v1) |
| `--model <name>` | `claude-sonnet-4-6` | LLM model |
| `--dry-run` | off | Scan and cluster only, no LLM |
| `--verbose` | off | Verbose output |
| `--max-clusters <n>` | `20` | Max clusters to process |
| `--min-cluster-size <n>` | `2` | Min components per cluster |
| `--max-cluster-size <n>` | `8` | Max components per cluster (prevents runaway merges) |

### Environment

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

If no key is set, `react-unify` automatically runs in `--dry-run` mode (clustering only, no LLM proposals or verification).

## Recommended first run

```bash
react-unify scan ./src --dry-run
```

This surfaces clusters in ~seconds with no API cost. Inspect `react-unify-report.md` and decide which clusters look worth unifying. Then rerun without `--dry-run` (with an API key set) to get actual generic-component proposals + `tsc` verification.

Add `react-unify-report.*` to your project's `.gitignore` so scan artefacts don't get committed.

## Interpreting the report

The report is grouped by cluster. Each cluster entry includes:

- **Confidence** (`high` / `medium` / `low`) — from the `similarity_score` (≥0.8 with same category = high; ≥0.65 = medium; else low)
- **Similarity** — weighted average of Jaccard overlaps on hooks, JSX tags, prop types, structural flags, and JSX depth closeness
- **Components** — clickable `file:///`-URI links (Ctrl+click in VSCode jumps to the component's line range in the source file)
- **Proposal** (non-dry-run only) — a generic component + per-original thin-wrapper rewrites preserving the original names and file paths, so callers don't need to change imports
- **Verification** — ✅ if the proposal compiles in a temp copy of the target project via `tsc --noEmit`

A "good" candidate cluster typically looks like:
- 2–8 members in the same category (cards, forms, drawers, list pages, entity pickers, etc.)
- High confidence / ≥0.85 similarity
- Components differ primarily in entity type, API endpoint, i18n keys, or styling, not in structure

A "probably not worth merging" cluster:
- Low confidence / <0.7 similarity
- Members span different categories
- Structural differences large enough that a generic component would need heavy conditional logic

## Tuning the threshold

- **Small codebase (<50 components)**: default `0.75` usually fine.
- **Large codebase (500+ components)**: start at `0.85`. Lower thresholds over-merge on large projects because many CRUD shells look alike to the fingerprinter.
- If clusters feel too noisy: raise the threshold.
- If obvious duplicates are being split: lower it by 0.05 and re-run.

The `--max-cluster-size` cap (default 8) is the second lever. Raise it if your codebase has genuinely large families of near-duplicates; lower it to force finer-grained groupings.

## Troubleshooting

**"No .tsx/.jsx components found"** — The target path may be wrong, or all components live in excluded directories (`node_modules`, `dist`, `build`, `.next`, `coverage`, `__tests__`, `.git`). Point the scanner at `./src` explicitly, not the repo root.

**"No API key found — running in --dry-run mode"** — Expected if `ANTHROPIC_API_KEY` isn't set. Either set it, or pass `--dry-run` explicitly to suppress the warning.

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

## Development

```bash
npm test          # run vitest
npm run typecheck # tsc --noEmit
npm run build     # compile to dist/
npm run dev       # run src/index.ts via tsx
```

The sample fixture project at [test/fixtures/sample-project/](test/fixtures/sample-project/) has 8 components in 3 expected clusters (cards, lists, forms) — useful for smoke-testing changes end-to-end.

## License

MIT.
