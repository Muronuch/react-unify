import fs from "node:fs";
import path from "node:path";
import type { ComponentDescriptor } from "../parser/types.js";
import type { ComponentFingerprint } from "../analyzer/fingerprint.js";

export interface RulesExclude {
  paths?: string[];
  components?: string[];
}

export interface NeverClusterRule {
  description?: string;
  patterns: string[];
}

export interface RulesConfig {
  exclude?: RulesExclude;
  neverClusterTogether?: NeverClusterRule[];
}

export const RULES_FILENAME = ".react-unify.json";

export interface LoadedRules {
  rules: RulesConfig;
  filePath: string;
}

export function loadRules(projectDir: string, overridePath?: string): LoadedRules | null {
  const file = overridePath ?? findRulesFile(projectDir);
  if (!file) return null;
  if (!fs.existsSync(file)) {
    if (overridePath) throw new Error(`Rules file not found: ${file}`);
    return null;
  }
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return { rules: validateRules(parsed), filePath: file };
  } catch (e) {
    throw new Error(`Failed to read rules from ${file}: ${(e as Error).message}`);
  }
}

// Walk up from startDir until .react-unify.json is found or root is reached.
function findRulesFile(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const rootDir = path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, RULES_FILENAME);
    if (fs.existsSync(candidate)) return candidate;
    if (dir === rootDir) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function validateRules(parsed: unknown): RulesConfig {
  if (!parsed || typeof parsed !== "object") throw new Error("rules file must be a JSON object");
  const obj = parsed as Record<string, unknown>;
  const out: RulesConfig = {};
  if (obj["exclude"]) {
    const ex = obj["exclude"] as Record<string, unknown>;
    out.exclude = {};
    if (Array.isArray(ex["paths"])) out.exclude.paths = ex["paths"].map(String);
    if (Array.isArray(ex["components"])) out.exclude.components = ex["components"].map(String);
  }
  if (Array.isArray(obj["neverClusterTogether"])) {
    out.neverClusterTogether = obj["neverClusterTogether"].map((r, i) => {
      const rule = r as Record<string, unknown>;
      if (!Array.isArray(rule["patterns"]) || rule["patterns"].length < 2) {
        throw new Error(`neverClusterTogether[${i}]: needs at least 2 patterns`);
      }
      return {
        description: typeof rule["description"] === "string" ? rule["description"] : undefined,
        patterns: rule["patterns"].map(String),
      };
    });
  }
  return out;
}

// Component names are PascalCase so matching is always case-insensitive. `(?i)` prefix
// is stripped for users coming from Python/Go regex dialects.
function compile(pattern: string): RegExp {
  const cleaned = pattern.replace(/^\(\?i\)/, "");
  return new RegExp(cleaned, "i");
}

function matchesAnyPath(filePath: string, globs: string[]): boolean {
  const norm = filePath.replace(/\\/g, "/");
  for (const g of globs) {
    if (globToRegex(g).test(norm)) return true;
  }
  return false;
}

// Minimal glob -> regex (supports **, *, ?). Good enough for path exclusions.
function globToRegex(glob: string): RegExp {
  const parts: string[] = [];
  let i = 0;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      parts.push(".*");
      i += 2;
      if (glob[i] === "/") i++;
      continue;
    }
    if (c === "*") { parts.push("[^/]*"); i++; continue; }
    if (c === "?") { parts.push("[^/]"); i++; continue; }
    if (/[.+^$|()[\]{}\\]/.test(c)) { parts.push("\\" + c); i++; continue; }
    parts.push(c);
    i++;
  }
  return new RegExp("^" + parts.join("") + "$");
}

export function filterDescriptors(
  descriptors: ComponentDescriptor[],
  rules: RulesConfig | null
): ComponentDescriptor[] {
  if (!rules) return descriptors;
  const paths = rules.exclude?.paths ?? [];
  const names = new Set(rules.exclude?.components ?? []);
  return descriptors.filter((d) => {
    if (paths.length > 0 && matchesAnyPath(d.file_path, paths)) return false;
    if (names.has(d.component_name)) return false;
    return true;
  });
}

// Returns canonical "min|max" index pairs that must never merge, based on
// rules.neverClusterTogether evaluated against component names.
//
// Within each rule, patterns form families. A pair (i, j) is blocked iff both
// components match at least one pattern AND the sets of patterns they match are
// disjoint. Components matching no pattern in a rule are untouched by that rule.
export function computeBlockedPairs(
  fingerprints: ComponentFingerprint[],
  rules: RulesConfig | null
): Set<string> {
  const blocked = new Set<string>();
  if (!rules?.neverClusterTogether?.length) return blocked;

  const rulesCompiled = rules.neverClusterTogether.map((r) => r.patterns.map(compile));

  for (const patterns of rulesCompiled) {
    const families: number[][] = fingerprints.map((fp) => {
      const matched: number[] = [];
      for (let p = 0; p < patterns.length; p++) {
        if (patterns[p]!.test(fp.component_name)) matched.push(p);
      }
      return matched;
    });

    for (let i = 0; i < fingerprints.length; i++) {
      const fi = families[i]!;
      if (fi.length === 0) continue;
      for (let j = i + 1; j < fingerprints.length; j++) {
        const fj = families[j]!;
        if (fj.length === 0) continue;
        const disjoint = !fi.some((p) => fj.includes(p));
        if (disjoint) blocked.add(`${i}|${j}`);
      }
    }
  }
  return blocked;
}
