import { describe, it, expect } from "vitest";
import { hello } from "../src/index.js";

describe("toolchain sanity", () => {
  it("imports a TS source file with .js extension", () => {
    expect(hello()).toBe("react-unify");
  });
});
