#!/usr/bin/env node
// src/index.ts
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import path from "node:path";
import fs from "node:fs";
import { extractComponents } from "./parser/extract.js";
import { generateFingerprint } from "./analyzer/fingerprint.js";
import { clusterComponents } from "./clusterer/cluster.js";
import { buildReport, renderMarkdown, renderJson, renderConsoleSummary } from "./reporter/report.js";
import type { ProposalSlim } from "./reporter/report.js";
import { loadConfig } from "./utils/config.js";
import { writeText } from "./utils/fs.js";

export function hello(): string {
  return "react-unify";
}

const program = new Command();
program
  .name("react-unify")
  .description("Find and merge duplicate React components using AI")
  .version("0.1.0");

program
  .command("scan <directory>")
  .description("Scan a React project for mergeable components")
  .option("-t, --threshold <number>", "similarity threshold 0-1", (v) => parseFloat(v), 0.6)
  .option("-o, --output <path>", "output report path")
  .option("--json", "emit JSON instead of markdown")
  .option("--no-verify", "skip TypeScript compilation verification")
  .option("--no-tests", "skip test verification")
  .option("--provider <name>", "anthropic|openai|deepseek", "anthropic")
  .option("--model <name>", "LLM model name")
  .option("--dry-run", "scan and cluster only, no LLM proposals")
  .option("--verbose", "verbose progress output")
  .option("--max-clusters <number>", "max clusters to process", (v) => parseInt(v, 10), 20)
  .option("--min-cluster-size <number>", "min cluster size", (v) => parseInt(v, 10), 2)
  .action(async (directory: string, options: Record<string, unknown>) => {
    const config = loadConfig({
      target_dir: path.resolve(directory),
      output: options["output"] as string | undefined,
      json: options["json"] as boolean | undefined,
      noVerify: options["verify"] === false,
      noTests: options["tests"] === false,
      provider: options["provider"] as never,
      model: options["model"] as string | undefined,
      dryRun: options["dryRun"] as boolean | undefined,
      verbose: options["verbose"] as boolean | undefined,
      threshold: options["threshold"] as number | undefined,
      maxClusters: options["maxClusters"] as number | undefined,
      minClusterSize: options["minClusterSize"] as number | undefined,
    });

    if (!fs.existsSync(config.target_dir)) {
      console.error(chalk.red(`Target directory does not exist: ${config.target_dir}`));
      process.exit(1);
    }

    const scanSpinner = ora("Scanning components…").start();
    const descriptors = extractComponents(config.target_dir);
    scanSpinner.succeed(chalk.green(`Found ${descriptors.length} components`));

    const fpSpinner = ora("Analyzing component structure…").start();
    const fingerprints = descriptors.map(generateFingerprint);
    fpSpinner.succeed(chalk.green("Fingerprinted"));

    const clSpinner = ora("Finding similar components…").start();
    const clusters = clusterComponents(fingerprints, config.similarity_threshold)
      .filter((c) => c.components.length >= config.min_cluster_size)
      .slice(0, config.max_clusters);
    clSpinner.succeed(chalk.green(`Found ${clusters.length} cluster(s)`));

    if (config.dry_run) {
      const report = buildReport({ scanned_count: descriptors.length, clusters, descriptors, proposals: new Map() });
      const out = config.output_format === "json" ? renderJson(report) : renderMarkdown(report);
      writeText(config.output_path, out);
      console.log(chalk.cyan(renderConsoleSummary(report)));
      console.log(chalk.gray(`Report written to ${config.output_path}`));
      return;
    }

    if (!config.api_key) {
      console.error(chalk.red("No API key found. Set ANTHROPIC_API_KEY (or pass --dry-run)."));
      process.exit(1);
    }
    const { createClient } = await import("./proposer/llm-client.js");
    const { proposeUnification } = await import("./proposer/propose.js");
    const llm = createClient(config.llm_provider, config.api_key, config.llm_model);

    const proposals = new Map<number, { proposal: ProposalSlim | null; verified: boolean; verification_errors: string[] }>();
    for (const cluster of clusters) {
      const sp = ora(`Proposing unified component for cluster ${cluster.id}…`).start();
      const proposal = await proposeUnification(cluster, descriptors, llm, { maxRetries: config.max_retries, model: config.llm_model });
      if (!proposal) {
        sp.warn(chalk.yellow(`Cluster ${cluster.id}: LLM did not return a usable proposal`));
        proposals.set(cluster.id, { proposal: null, verified: false, verification_errors: ["LLM proposal failed"] });
        continue;
      }
      sp.succeed(chalk.green(`Cluster ${cluster.id}: ${proposal.generic_component.name} (saves ${proposal.savings} lines)`));
      proposals.set(cluster.id, {
        proposal: {
          generic_name: proposal.generic_component.name,
          generic_source: proposal.generic_component.source,
          rewrites: proposal.rewrites.map((r) => ({ original: r.original_path, rewrite: r.rewrite_source })),
          lines_saved: proposal.savings,
        },
        verified: false,
        verification_errors: [],
      });
    }

    const report = buildReport({ scanned_count: descriptors.length, clusters, descriptors, proposals });
    const out = config.output_format === "json" ? renderJson(report) : renderMarkdown(report);
    writeText(config.output_path, out);
    console.log(chalk.cyan(renderConsoleSummary(report)));
    console.log(chalk.gray(`Report written to ${config.output_path}`));
  });

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
               import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") ?? "");
if (isMain) program.parseAsync(process.argv);
