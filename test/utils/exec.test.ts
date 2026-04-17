import { describe, it, expect } from "vitest";
import path from "node:path";
import process from "node:process";
import { runCommand, quoteForCmd } from "../../src/utils/exec.js";

describe("quoteForCmd", () => {
  it("leaves a plain arg without special chars unchanged", () => {
    expect(quoteForCmd("hello")).toBe("hello");
  });

  it("wraps an arg with spaces in double-quotes", () => {
    expect(quoteForCmd("hello world")).toBe('"hello world"');
  });

  it("escapes embedded double-quotes as double-double-quotes and wraps", () => {
    expect(quoteForCmd('say "hi"')).toBe('"say ""hi"""');
  });

  it("escapes ^ as ^^ and wraps", () => {
    expect(quoteForCmd("a^b")).toBe('"a^^b"');
  });

  it("escapes % as ^% and wraps", () => {
    expect(quoteForCmd("%PATH%")).toBe('"^%PATH^%"');
  });
});

describe("runCommand", () => {
  it("runs node -e with a path containing a space", async () => {
    const nodeBin = process.execPath;
    const result = await runCommand(nodeBin, ["-e", "process.stdout.write('ok')"]);
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe("ok");
  }, 15_000);

  it("returns code 124 and [timeout] marker when command exceeds timeout", async () => {
    const nodeBin = process.execPath;
    const result = await runCommand(nodeBin, ["-e", "setTimeout(()=>{},5000)"], { timeout: 500 });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(124);
    expect(result.stderr).toContain("[timeout]");
  }, 10_000);
});
