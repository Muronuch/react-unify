import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProposalResult } from "../proposer/propose.js";
import { withTempDir, copyProjectExcludingHeavy, writeText } from "../utils/fs.js";
import { runCommand } from "../utils/exec.js";

// copyProjectExcludingHeavy strips the target's node_modules, so the temp copy has no
// local typescript binary. Run tsc from the react-unify install (where typescript IS
// installed) and point --project at the temp copy's tsconfig.
const TOOL_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");

export interface VerificationResult {
  compiles: boolean;
  type_errors: string[];
  tests_pass: boolean | null;
  test_errors: string[];
}

// Place the generic component where the rewrites' relative imports actually resolve to,
// so projects with non-standard layouts (monorepos, app/ instead of src/components/) verify
// correctly. Falls back to <first-rewrite-dir>/unified/ when no matching import is found.
export function resolveGenericPath(proposal: ProposalResult, tempDir: string, projectDir: string): string {
  const genericName = proposal.generic_component.name;
  const fileName = proposal.generic_component.file_name;
  const ext = path.extname(fileName);

  for (const rw of proposal.rewrites) {
    const importRe = /from\s+["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(rw.rewrite_source)) !== null) {
      const importPath = m[1]!;
      if (!importPath.startsWith(".")) continue;
      const baseName = path.basename(importPath, path.extname(importPath));
      if (baseName !== genericName) continue;

      const relPath = path.relative(projectDir, rw.original_path);
      const rewriteDirInTemp = path.dirname(path.join(tempDir, relPath));
      const importPathNoExt = importPath.replace(/\.(tsx?|jsx?)$/, "");
      return path.resolve(rewriteDirInTemp, importPathNoExt + ext);
    }
  }

  if (proposal.rewrites.length > 0) {
    const firstRel = path.relative(projectDir, proposal.rewrites[0]!.original_path);
    const firstDirInTemp = path.dirname(path.join(tempDir, firstRel));
    return path.join(firstDirInTemp, "unified", fileName);
  }

  return path.join(tempDir, "src", "components", "unified", fileName);
}

export async function verifyProposal(
  proposal: ProposalResult,
  projectDir: string,
  opts: { runTests?: boolean } = {}
): Promise<VerificationResult> {
  return withTempDir("react-unify-verify", async (tempDir) => {
    copyProjectExcludingHeavy(projectDir, tempDir);

    const genericDestPath = resolveGenericPath(proposal, tempDir, projectDir);
    fs.mkdirSync(path.dirname(genericDestPath), { recursive: true });
    writeText(genericDestPath, proposal.generic_component.source);

    for (const rw of proposal.rewrites) {
      const relPath = path.relative(projectDir, rw.original_path);
      const targetPath = path.join(tempDir, relPath);
      writeText(targetPath, rw.rewrite_source);
    }

    const tsconfig = path.join(tempDir, "tsconfig.json");
    let tsconfigArgs: string[];
    if (fs.existsSync(tsconfig)) {
      tsconfigArgs = ["--noEmit", "--project", tsconfig];
    } else {
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
