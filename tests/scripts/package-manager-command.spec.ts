import { describe, expect, it } from "vitest";

import { resolvePackageManagerInvocation } from "../../scripts/package-manager-command.js";

describe("package manager command", () => {
  it("runs the package manager JavaScript entry through Node on Windows", () => {
    const arguments_ = ["pack", "path with spaces", "value&with-special-characters"];

    expect(resolvePackageManagerInvocation("pnpm", arguments_, {
      platform: "win32",
      nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
      packageManagerEntry: "C:\\pnpm\\pnpm.cjs",
    })).toEqual({
      executable: "C:\\Program Files\\nodejs\\node.exe",
      arguments: ["C:\\pnpm\\pnpm.cjs", ...arguments_],
    });
  });

  it("runs the package manager executable directly on POSIX systems", () => {
    expect(resolvePackageManagerInvocation("npm", ["install"], {
      platform: "linux",
      nodeExecutable: "/usr/bin/node",
      packageManagerEntry: undefined,
    })).toEqual({
      executable: "npm",
      arguments: ["install"],
    });
  });

  it("requires a package-manager script entry on Windows", () => {
    expect(() => resolvePackageManagerInvocation("npm", ["install"], {
      platform: "win32",
      nodeExecutable: "node.exe",
      packageManagerEntry: undefined,
    })).toThrow("Run package verification through npm on Windows");
  });
});
