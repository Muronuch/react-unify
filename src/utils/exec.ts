import { spawn } from "node:child_process";

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

// Escapes a single arg for cmd.exe per its quoting rules. Only wraps in quotes when the
// arg contains characters cmd.exe would re-interpret; bare flags like `--noEmit` stay
// unquoted because some tools (e.g. node -e) reject quoted flag names.
export function quoteForCmd(arg: string): string {
  if (!/[ \t&^|<>()@!"%]/.test(arg) && arg !== "") {
    return arg;
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
  // execFile cannot spawn .cmd batch wrappers (npx.cmd, tsc.cmd) on Windows under
  // bash/MSYS2; spawn+shell:true lets cmd.exe resolve them.
  const useShell = process.platform === "win32";
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

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
      resolve({ ok: false, stdout, stderr: stderr + "\n[timeout]", code: 124 });
    }, timeout);

    proc.on("close", (code) => {
      if (timedOut) return;
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
