// src/verifier/verify.ts
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProposalResult } from "../proposer/propose.js";
import { withTempDir, copyProjectExcludingHeavy, writeText } from "../utils/fs.js";
import { runCommand } from "../utils/exec.js";

// The directory where react-unify's own node_modules lives (contains typescript).
// We run npx tsc from here so that npx can resolve the installed tsc binary,
// while pointing --project at the temp copy of the target project.
const TOOL_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");

export interface VerificationResult {
  compiles: boolean;
  type_errors: string[];
  tests_pass: boolean | null;
  test_errors: string[];
}

export async function verifyProposal(
  proposal: ProposalResult,
  projectDir: string,
  opts: { runTests?: boolean } = {}
): Promise<VerificationResult> {
  return withTempDir("react-unify-verify", async (tempDir) => {
    copyProjectExcludingHeavy(projectDir, tempDir);

    // Write the generic component to src/components/unified/
    const unifiedDir = path.join(tempDir, "src", "components", "unified");
    fs.mkdirSync(unifiedDir, { recursive: true });
    writeText(path.join(unifiedDir, proposal.generic_component.file_name), proposal.generic_component.source);

    // Replace each original file with the rewrite
    for (const rw of proposal.rewrites) {
      const relPath = path.relative(projectDir, rw.original_path);
      const targetPath = path.join(tempDir, relPath);
      writeText(targetPath, rw.rewrite_source);
    }

    // tsc --noEmit
    // Run from TOOL_ROOT so npx can find the installed typescript package.
    // Pass --project with the absolute path to the temp copy's tsconfig.
    const tsconfig = path.join(tempDir, "tsconfig.json");
    const tsconfigArgs = fs.existsSync(tsconfig) ? ["--noEmit", "--project", tsconfig] : ["--noEmit", "--rootDir", tempDir];
    const tscResult = await runCommand("npx", ["tsc", ...tsconfigArgs], { cwd: TOOL_ROOT });
    const compiles = tscResult.ok;
    const type_errors = compiles ? [] : parseTscErrors(tscResult.stdout + "\n" + tscResult.stderr);

    let tests_pass: boolean | null = null;
    let test_errors: string[] = [];
    if (compiles && opts.runTests) {
      const runner = detectTestRunner(tempDir);
      if (runner === "vitest") {
        const r = await runCommand("npx", ["vitest", "run", "--bail", "1"], { cwd: tempDir });
        tests_pass = r.ok;
        if (!r.ok) test_errors = [truncate(r.stdout + r.stderr, 2000)];
      } else if (runner === "jest") {
        const r = await runCommand("npx", ["jest", "--passWithNoTests", "--bail"], { cwd: tempDir });
        tests_pass = r.ok;
        if (!r.ok) test_errors = [truncate(r.stdout + r.stderr, 2000)];
      }
    }

    return { compiles, type_errors, tests_pass, test_errors };
  });
}

function parseTscErrors(output: string): string[] {
  return output.split(/\r?\n/).filter((l) => / error TS\d+:/.test(l)).slice(0, 25);
}

function detectTestRunner(dir: string): "vitest" | "jest" | null {
  if (fs.existsSync(path.join(dir, "vitest.config.ts")) || fs.existsSync(path.join(dir, "vitest.config.js"))) return "vitest";
  if (fs.existsSync(path.join(dir, "jest.config.ts")) || fs.existsSync(path.join(dir, "jest.config.js")) || fs.existsSync(path.join(dir, "jest.config.cjs"))) return "jest";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    if (pkg.devDependencies?.vitest) return "vitest";
    if (pkg.devDependencies?.jest) return "jest";
  } catch { /* ignore */ }
  return null;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
