#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { extractComponents } from "./parser/extract.js";
import { generateFingerprint } from "./analyzer/fingerprint.js";
import { clusterComponents } from "./clusterer/cluster.js";
import { buildReport, renderMarkdown, renderJson, renderConsoleSummary } from "./reporter/report.js";
import { loadConfig } from "./utils/config.js";
import { writeText } from "./utils/fs.js";
import { loadRules, filterDescriptors, computeBlockedPairs } from "./utils/rules.js";

export function hello(): string {
  return "react-unify";
}

const program = new Command();
program
  .name("react-unify")
  .description("Find structurally similar React components and write a clickable cluster report")
  .version("0.1.0");

program
  .command("scan <directory>")
  .description("Scan a React project for clusters of similar components")
  .option("-t, --threshold <number>", "similarity threshold 0-1", (v) => parseFloat(v), 0.75)
  .option("-o, --output <path>", "output report path")
  .option("--json", "emit JSON instead of markdown")
  .option("--propose", "(opt-in) generate LLM-based unified-component proposals + tsc verification")
  .option("--no-verify", "with --propose: skip TypeScript compilation verification")
  .option("--no-tests", "with --propose: skip test verification")
  .option("--provider <name>", "with --propose: anthropic|openai|deepseek", "anthropic")
  .option("--model <name>", "with --propose: LLM model name")
  .option("--verbose", "verbose progress output")
  .option("--max-clusters <number>", "max clusters to process", (v) => parseInt(v, 10), 20)
  .option("--min-cluster-size <number>", "min cluster size", (v) => parseInt(v, 10), 2)
  .option("--max-cluster-size <number>", "max cluster size (prevents runaway merges)", (v) => parseInt(v, 10), 8)
  .option("--config <path>", "path to .react-unify.json (auto-discovered by default)")
  .option("--no-config", "skip auto-discovery of .react-unify.json rules")
  .action(async (directory: string, options: Record<string, unknown>) => {
    const config = loadConfig({
      target_dir: path.resolve(directory),
      output: options["output"] as string | undefined,
      json: options["json"] as boolean | undefined,
      noVerify: options["verify"] === false,
      noTests: options["tests"] === false,
      provider: options["provider"] as never,
      model: options["model"] as string | undefined,
      propose: options["propose"] as boolean | undefined,
      verbose: options["verbose"] as boolean | undefined,
      threshold: options["threshold"] as number | undefined,
      maxClusters: options["maxClusters"] as number | undefined,
      minClusterSize: options["minClusterSize"] as number | undefined,
      maxClusterSize: options["maxClusterSize"] as number | undefined,
    });

    if (!fs.existsSync(config.target_dir)) {
      console.error(chalk.red(`Target directory does not exist: ${config.target_dir}`));
      process.exit(1);
    }

    const useConfig = options["config"] !== false;
    const configPath = typeof options["config"] === "string" ? (options["config"] as string) : undefined;
    let loadedRules: ReturnType<typeof loadRules> = null;
    if (useConfig) {
      try {
        loadedRules = loadRules(config.target_dir, configPath);
      } catch (e) {
        console.error(chalk.red((e as Error).message));
        process.exit(1);
      }
    }
    if (loadedRules) {
      console.log(chalk.gray(`Using rules from ${loadedRules.filePath}`));
    }

    const scanSpinner = ora("Scanning components…").start();
    const rawDescriptors = extractComponents(config.target_dir);
    const descriptors = filterDescriptors(rawDescriptors, loadedRules?.rules ?? null);
    const filteredOutCount = rawDescriptors.length - descriptors.length;
    const filteredSuffix = filteredOutCount > 0 ? ` (${filteredOutCount} excluded by rules)` : "";
    scanSpinner.succeed(chalk.green(`Found ${descriptors.length} components${filteredSuffix}`));

    if (descriptors.length === 0) {
      console.error(chalk.yellow("Warning: no .tsx/.jsx components found in the target directory. Is the path correct?"));
      const report = buildReport({ scanned_count: 0, clusters: [], descriptors: [], proposals: new Map() });
      const out = config.output_format === "json" ? renderJson(report) : renderMarkdown(report);
      writeText(config.output_path, out);
      console.log(chalk.gray(`Empty report written to ${config.output_path}`));
      return;
    }

    const fpSpinner = ora("Analyzing component structure…").start();
    const fingerprints = descriptors.map(generateFingerprint);
    fpSpinner.succeed(chalk.green("Fingerprinted"));

    const clSpinner = ora("Finding similar components…").start();
    const blockedPairs = computeBlockedPairs(fingerprints, loadedRules?.rules ?? null);
    const clusters = clusterComponents(
      fingerprints,
      config.similarity_threshold,
      config.max_cluster_size,
      blockedPairs
    )
      .filter((c) => c.components.length >= config.min_cluster_size)
      .slice(0, config.max_clusters);
    const blockSuffix = blockedPairs.size > 0 ? ` (${blockedPairs.size} pair(s) blocked by rules)` : "";
    clSpinner.succeed(chalk.green(`Found ${clusters.length} cluster(s)${blockSuffix}`));

    if (!config.propose) {
      const report = buildReport({ scanned_count: descriptors.length, clusters, descriptors, proposals: new Map() });
      const out = config.output_format === "json" ? renderJson(report) : renderMarkdown(report);
      writeText(config.output_path, out);
      console.log(chalk.cyan(renderConsoleSummary(report)));
      console.log(chalk.gray(`Report written to ${config.output_path}`));
      console.log(chalk.gray(`(re-run with --propose for LLM-generated unified-component proposals)`));
      return;
    }

    if (!config.api_key) {
      console.error(chalk.red(`--propose requires an API key. Set ANTHROPIC_API_KEY (or use the provider's env var).`));
      process.exit(1);
    }

    const { createClient } = await import("./proposer/llm-client.js");
    const { proposeUnification, toSlim } = await import("./proposer/propose.js");
    const llm = createClient(config.llm_provider, config.api_key, config.llm_model);

    const proposals = new Map<number, { proposal: ReturnType<typeof toSlim> | null; verified: boolean; verification_errors: string[] }>();
    for (const cluster of clusters) {
      const sp = ora(`Proposing unified component for cluster ${cluster.id}…`).start();
      let lastError = "";
      const proposal = await proposeUnification(cluster, descriptors, llm, {
        maxRetries: config.max_retries,
        model: config.llm_model,
        onAttemptError: (_attempt, error) => { lastError = error; },
      });
      if (!proposal) {
        const short = lastError.length > 200 ? lastError.slice(0, 200) + "…" : lastError;
        const detail = short ? `: ${short}` : "";
        sp.warn(chalk.yellow(`Cluster ${cluster.id}: LLM did not return a usable proposal${detail}`));
        proposals.set(cluster.id, { proposal: null, verified: false, verification_errors: [lastError || "LLM proposal failed"] });
        continue;
      }
      sp.succeed(chalk.green(`Cluster ${cluster.id}: ${proposal.generic_component.name} (saves ${proposal.savings} lines)`));
      const verifySpinner = config.verify ? ora(`Verifying cluster ${cluster.id}…`).start() : null;
      let verified = false;
      let verification_errors: string[] = [];
      if (config.verify) {
        const { verifyProposal } = await import("./verifier/verify.js");
        const v = await verifyProposal(proposal, config.target_dir, { runTests: config.run_tests });
        verified = v.compiles && v.tests_pass !== false;
        verification_errors = [...v.type_errors, ...v.test_errors];
        if (verified) verifySpinner!.succeed(chalk.green(`Cluster ${cluster.id}: verified`));
        else verifySpinner!.warn(chalk.yellow(`Cluster ${cluster.id}: ${verification_errors[0] ?? "verification failed"}`));
      }
      proposals.set(cluster.id, { proposal: toSlim(proposal), verified, verification_errors });
    }

    const report = buildReport({ scanned_count: descriptors.length, clusters, descriptors, proposals });
    const out = config.output_format === "json" ? renderJson(report) : renderMarkdown(report);
    writeText(config.output_path, out);
    console.log(chalk.cyan(renderConsoleSummary(report)));
    console.log(chalk.gray(`Report written to ${config.output_path}`));
  });

const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "");
if (isMain) program.parseAsync(process.argv);
