# react-unify

A CLI tool that scans a React/TypeScript codebase, finds structurally similar components, and uses an LLM to propose a single generic component that replaces them. Verifies the proposal compiles and reports proposed line savings.

## Install

```bash
npm install -g react-unify
# or run without installing:
npx react-unify scan ./src
```

## Usage

```bash
react-unify scan <directory> [options]
```

### Options

| Flag | Default | Description |
| --- | --- | --- |
| `-t, --threshold <0..1>` | `0.6` | Similarity threshold for clustering |
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

### Environment

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

If no key is set, react-unify automatically runs in `--dry-run` mode.

## Examples

```bash
# Quick scan, no LLM
react-unify scan ./apps/web/src --dry-run

# Full run, JSON output
react-unify scan ./src --json -o ./unify-report.json
```

## How it works

Pipeline: parser (ts-morph) → analyzer (fingerprint) → clusterer (Jaccard-weighted similarity + agglomerative clustering) → proposer (LLM) → verifier (tsc) → reporter.

Each cluster's proposal is a generic component plus thin wrappers that preserve original component names and file paths — so the rest of your codebase needs no import changes.
