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

/**
 * Resolve the path inside tempDir where the generic component should be written.
 *
 * Strategy:
 * 1. Scan each rewrite_source for an import statement that references the generic
 *    component name. If found and the import path is relative, resolve it relative
 *    to the rewrite's directory in the temp copy.
 * 2. If no relative import is found in any rewrite, fall back to
 *    <dirname-of-first-rewrite>/unified/<file_name>.
 */
export function resolveGenericPath(proposal: ProposalResult, tempDir: string, projectDir: string): string {
  const genericName = proposal.generic_component.name;
  const fileName = proposal.generic_component.file_name;
  const ext = path.extname(fileName);

  for (const rw of proposal.rewrites) {
    // Match: import { ... } from "./some/path" or import X from "./some/path"
    // The import path just needs to contain the genericName as the last segment (without ext).
    const importRe = /from\s+["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(rw.rewrite_source)) !== null) {
      const importPath = m[1]!;
      if (!importPath.startsWith(".")) continue;
      // Check last segment (without extension) matches generic name
      const baseName = path.basename(importPath, path.extname(importPath));
      if (baseName !== genericName) continue;

      // Found a relative import for the generic component.
      // Resolve it relative to the rewrite's directory in the temp copy.
      const relPath = path.relative(projectDir, rw.original_path);
      const rewriteDirInTemp = path.dirname(path.join(tempDir, relPath));
      // Strip extension from importPath and add the actual file extension
      const importPathNoExt = importPath.replace(/\.(tsx?|jsx?)$/, "");
      const resolved = path.resolve(rewriteDirInTemp, importPathNoExt + ext);
      return resolved;
    }
  }

  // Fallback: place next to the first rewrite's directory under unified/
  if (proposal.rewrites.length > 0) {
    const firstRel = path.relative(projectDir, proposal.rewrites[0]!.original_path);
    const firstDirInTemp = path.dirname(path.join(tempDir, firstRel));
    return path.join(firstDirInTemp, "unified", fileName);
  }

  // Last resort: original hardcoded location
  return path.join(tempDir, "src", "components", "unified", fileName);
}

export async function verifyProposal(
  proposal: ProposalResult,
  projectDir: string,
  opts: { runTests?: boolean } = {}
): Promise<VerificationResult> {
  return withTempDir("react-unify-verify", async (tempDir) => {
    copyProjectExcludingHeavy(projectDir, tempDir);

    // Write the generic component to the path derived from the rewrite imports.
    const genericDestPath = resolveGenericPath(proposal, tempDir, projectDir);
    fs.mkdirSync(path.dirname(genericDestPath), { recursive: true });
    writeText(genericDestPath, proposal.generic_component.source);

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
    let tsconfigArgs: string[];
    if (fs.existsSync(tsconfig)) {
      tsconfigArgs = ["--noEmit", "--project", tsconfig];
    } else {
      // No tsconfig — write a minimal one so tsc knows which files to compile.
      const minimalTsconfig = {
        compilerOptions: {
          noEmit: true,
          jsx: "preserve",
          esModuleInterop: true,
          skipLibCheck: true,
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
          strict: true,
          allowJs: true,
        },
        include: ["**/*.{ts,tsx,js,jsx}"],
      };
      const tsconfigPath = path.join(tempDir, "tsconfig.json");
      fs.writeFileSync(tsconfigPath, JSON.stringify(minimalTsconfig, null, 2));
      tsconfigArgs = ["--noEmit", "--project", tsconfigPath];
    }
    const tscResult = await runCommand("npx", ["tsc", ...tsconfigArgs], { cwd: TOOL_ROOT, timeout: 180_000 });
    const compiles = tscResult.ok;
    const type_errors = compiles ? [] : parseTscErrors(tscResult.stdout + "\n" + tscResult.stderr);

    let tests_pass: boolean | null = null;
    let test_errors: string[] = [];
    if (compiles && opts.runTests) {
      const runner = detectTestRunner(tempDir);
      if (runner === "vitest") {
        const r = await runCommand("npx", ["vitest", "run", "--bail", "1"], { cwd: tempDir, timeout: 180_000 });
        tests_pass = r.ok;
        if (!r.ok) test_errors = [truncate(r.stdout + r.stderr, 2000)];
      } else if (runner === "jest") {
        const r = await runCommand("npx", ["jest", "--passWithNoTests", "--bail"], { cwd: tempDir, timeout: 180_000 });
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
