// src/utils/fs.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export function readText(p: string): string {
  return fs.readFileSync(p, "utf8");
}

export function writeText(p: string, contents: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contents, "utf8");
}

export async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-${crypto.randomBytes(4).toString("hex")}-`));
  try {
    return await fn(dir);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

export function copyProjectExcludingHeavy(src: string, dest: string): void {
  fs.cpSync(src, dest, {
    recursive: true,
    dereference: false,
    filter: (s) => {
      const base = path.basename(s);
      if (base === "node_modules" || base === ".git" || base === "dist" || base === ".next" || base === "build" || base === "coverage") return false;
      return true;
    },
  });
}
