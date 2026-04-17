import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/utils/config.js";

describe("loadConfig", () => {
  it("forces dry_run when no api key is present", () => {
    const c = loadConfig({ target_dir: "./x" }, {});
    expect(c.dry_run).toBe(true);
  });
  it("uses ANTHROPIC_API_KEY for anthropic provider", () => {
    const c = loadConfig({ target_dir: "./x" }, { ANTHROPIC_API_KEY: "k" });
    expect(c.api_key).toBe("k");
    expect(c.dry_run).toBe(false);
  });
  it("respects --json by switching output_format and default path", () => {
    const c = loadConfig({ target_dir: "./x", json: true }, {});
    expect(c.output_format).toBe("json");
    expect(c.output_path.endsWith(".json")).toBe(true);
  });
  it("default model is claude-sonnet-4-6", () => {
    const c = loadConfig({ target_dir: "./x" }, {});
    expect(c.llm_model).toBe("claude-sonnet-4-6");
  });
});
