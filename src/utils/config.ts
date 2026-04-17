export type LLMProvider = "anthropic" | "openai" | "deepseek";

export interface Config {
  llm_provider: LLMProvider;
  llm_model: string;
  api_key: string | null;
  max_retries: number;
  target_dir: string;
  output_path: string;
  output_format: "markdown" | "json";
  similarity_threshold: number;
  verify: boolean;
  run_tests: boolean;
  propose: boolean;
  verbose: boolean;
  max_clusters: number;
  min_cluster_size: number;
  max_cluster_size: number;
}

export interface ConfigOverrides {
  target_dir: string;
  output?: string;
  json?: boolean;
  noVerify?: boolean;
  noTests?: boolean;
  provider?: LLMProvider;
  model?: string;
  propose?: boolean;
  verbose?: boolean;
  threshold?: number;
  maxClusters?: number;
  minClusterSize?: number;
  maxClusterSize?: number;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";

export function loadConfig(overrides: ConfigOverrides, env: NodeJS.ProcessEnv = process.env): Config {
  const provider: LLMProvider = overrides.provider ?? "anthropic";
  const apiKeyVar =
    provider === "anthropic" ? "ANTHROPIC_API_KEY" :
    provider === "openai" ? "OPENAI_API_KEY" :
    "DEEPSEEK_API_KEY";
  const api_key = env[apiKeyVar] ?? null;
  const json = !!overrides.json;
  return {
    llm_provider: provider,
    llm_model: overrides.model ?? env["REACT_UNIFY_MODEL"] ?? DEFAULT_MODEL,
    api_key,
    max_retries: 3,
    target_dir: overrides.target_dir,
    output_path: overrides.output ?? (json ? "./react-unify-report.json" : "./react-unify-report.md"),
    output_format: json ? "json" : "markdown",
    similarity_threshold: overrides.threshold ?? 0.75,
    verify: overrides.noVerify !== true,
    run_tests: overrides.noTests !== true,
    propose: overrides.propose === true,
    verbose: overrides.verbose === true,
    max_clusters: overrides.maxClusters ?? 20,
    min_cluster_size: overrides.minClusterSize ?? 2,
    max_cluster_size: overrides.maxClusterSize ?? 8,
  };
}
