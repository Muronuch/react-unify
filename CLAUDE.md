# Claude Code context for react-unify

This file gives AI coding assistants the minimum context to work effectively on this repo.

## What this is

A CLI that scans React/TypeScript codebases for structurally similar components and proposes LLM-generated unified generic components. Full overview in [README.md](README.md).

## Pipeline architecture

Six modules, each in its own directory under `src/`:

1. `parser/` — `extractComponents(dir)` uses ts-morph to build `ComponentDescriptor[]` from `.tsx`/`.jsx` files. Only exported components with capital-letter names are extracted.
2. `analyzer/` — `generateFingerprint(desc)` derives a `ComponentFingerprint` (prop/hook/tag bags, structural flags, heuristic category).
3. `clusterer/` — `clusterComponents(fps, threshold, maxSize)` uses weighted Jaccard similarity + average-linkage agglomerative clustering with a cluster-size cap.
4. `proposer/` — `proposeUnification(cluster, descriptors, llmClient)` calls the LLM and parses its structured response into a `ProposalResult`.
5. `verifier/` — `verifyProposal(proposal, projectDir)` copies the project to a temp dir, applies the rewrite, runs `tsc --noEmit`, optionally runs the detected test runner.
6. `reporter/` — `buildReport + renderMarkdown/renderJson/renderConsoleSummary`.

Orchestrated by `src/index.ts` (commander-based CLI).

## Key conventions

- **NodeNext ESM**. All relative imports in `src/` end in `.js` (even though the files are `.ts`). This trips people up.
- **Strict TDD in tests**. Per-module tests live in `test/<module>/<name>.test.ts`. Fixtures in `test/fixtures/`. Two integration tests: `test/integration/pipeline.test.ts` (mocked LLM) and `test/integration/live.test.ts` (real API, skipped without `ANTHROPIC_API_KEY`).
- **LLMClient abstraction** ([src/proposer/llm-client.ts](src/proposer/llm-client.ts)) exists so tests inject a `MockLLMClient`. Real implementation is `AnthropicClient`. `OpenAIClient` / `DeepSeekClient` are interface-only stubs that throw `not implemented`.
- **Windows compatibility matters**. [src/utils/exec.ts](src/utils/exec.ts) uses `spawn + shell:true` on Windows to run `.cmd` wrappers (e.g. `npx.cmd`). [src/verifier/verify.ts](src/verifier/verify.ts) runs `npx tsc` from `TOOL_ROOT` (not the temp copy) because the copy strips `node_modules`.
- **Absolute file paths in reports use `file:///` URIs** so VSCode's markdown preview can follow them. See `toFileHref` in [src/reporter/report.ts](src/reporter/report.ts).

## Commands

```bash
npm test          # full vitest suite (50 passing, 1 skipped without API key)
npm run typecheck # tsc --noEmit
npm run build     # emit dist/
npm run dev       # run src/index.ts via tsx (no build step)
```

All tests should pass green. If they don't, do not merge; debug first.

## When making changes

- Edit `src/`. Tests in `test/` follow the same structure.
- Run `npm test && npm run typecheck` before committing.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
- Comments: only explain WHY (non-obvious constraints, workarounds, invariants). Do NOT add filename-header comments (`// src/foo/bar.ts`) or task-reference comments (`// Fix N: ...`) — both were previously scrubbed from the codebase.
- The tool is explicitly read-only against target projects; the verifier writes only to a temp dir. Don't break that invariant.

## Known v1 scope limits

- OpenAI / DeepSeek providers are stub-only.
- LLM "cluster refinement pass" (spec §3) is deliberately omitted.
- No auto-apply mode (tool never writes to target project).
- Verifier uses `react-unify`'s own TypeScript install, not the target's — type fidelity is approximate for projects with unusual type dependencies.

Ship incremental improvements over rewrites.
