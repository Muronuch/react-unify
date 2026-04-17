// src/utils/exec.ts
import { spawn } from "node:child_process";

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Escape a single argument for cmd.exe (Windows shell).
 * Only wraps in double-quotes when the arg contains characters that cmd.exe would
 * re-interpret (spaces, tabs, shell metacharacters, or empty string).
 * Embedded `"` are doubled, `^` and `%` are escaped per cmd.exe rules.
 */
export function quoteForCmd(arg: string): string {
  if (!/[ \t&^|<>()@!"%]/.test(arg) && arg !== "") {
    return arg; // safe as-is
  }
  const escaped = arg
    .replace(/\^/g, "^^")
    .replace(/%/g, "^%")
    .replace(/"/g, '""');
  return `"${escaped}"`;
}

export function runCommand(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}
): Promise<CommandResult> {
  // On Windows, .cmd batch files (npx.cmd, tsc.cmd, etc.) cannot be spawned via execFile
  // without shell:true. We use spawn with shell:true on Windows only so that cmd.exe
  // can resolve and run the batch wrapper.
  const useShell = process.platform === "win32";
  // When shell is active on Windows, quote the command and each arg individually so
  // special characters (spaces, &, ^, %, etc.) are not re-interpreted by cmd.exe.
  const spawnCmd = useShell ? quoteForCmd(cmd) : cmd;
  const spawnArgs = useShell ? args.map(quoteForCmd) : args;
  const timeout = opts.timeout ?? 180_000;

  return new Promise((resolve) => {
    const proc = spawn(spawnCmd, spawnArgs, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      shell: useShell,
      stdio: "pipe",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    proc.stdout?.on("data", (chunk: Buffer) => { stdout += String(chunk); });
    proc.stderr?.on("data", (chunk: Buffer) => { stderr += String(chunk); });

    // Kill the process if it runs longer than the timeout.
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
      resolve({ ok: false, stdout, stderr: stderr + "\n[timeout]", code: 124 });
    }, timeout);

    proc.on("close", (code) => {
      if (timedOut) return; // timeout already resolved
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr, code: code ?? 1 });
    });

    proc.on("error", (err) => {
      if (timedOut) return;
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: stderr + "\n" + String(err), code: 1 });
    });
  });
}
