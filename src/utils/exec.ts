// src/utils/exec.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

export async function runCommand(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<CommandResult> {
  const resolved = (cmd === "npx" || cmd === "node" || cmd === "tsc") && process.platform === "win32" ? `${cmd}.cmd` : cmd;
  try {
    const { stdout, stderr } = await exec(resolved, args, { cwd: opts.cwd, env: opts.env, maxBuffer: 50 * 1024 * 1024 });
    return { ok: true, stdout: String(stdout), stderr: String(stderr), code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number };
    return { ok: false, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? ""), code: typeof err.code === "number" ? err.code : 1 };
  }
}
