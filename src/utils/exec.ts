// src/utils/exec.ts
import { spawn } from "node:child_process";

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

export function runCommand(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<CommandResult> {
  // On Windows, .cmd batch files (npx.cmd, tsc.cmd, etc.) cannot be spawned via execFile
  // without shell:true. We use spawn with shell:true on Windows only so that cmd.exe
  // can resolve and run the batch wrapper.
  const useShell = process.platform === "win32";
  // When using shell on Windows, we pass the bare name (without .cmd) and let cmd.exe resolve it.
  // When NOT on Windows, use the name as-is.
  const resolved = cmd;

  return new Promise((resolve) => {
    const proc = spawn(resolved, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      shell: useShell,
      stdio: "pipe",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => { stdout += String(chunk); });
    proc.stderr?.on("data", (chunk: Buffer) => { stderr += String(chunk); });

    proc.on("close", (code) => {
      resolve({ ok: code === 0, stdout, stderr, code: code ?? 1 });
    });

    proc.on("error", (err) => {
      resolve({ ok: false, stdout, stderr: stderr + "\n" + String(err), code: 1 });
    });
  });
}
