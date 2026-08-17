import { describe, expect, it } from "vitest";

import {
  resolveConsumerInstallArguments,
  resolveInstalledCliInvocation,
  resolvePackageManagerInvocation,
} from "../../scripts/package-manager-command.js";

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

  it("allows a temporary pnpm consumer to fetch dependencies missing from its local store", () => {
    expect(resolveConsumerInstallArguments("pnpm")).toEqual([
      "install",
      "--frozen-lockfile=false",
      "--prefer-offline",
    ]);
  });

  it("runs the installed CLI entry directly through Node on Windows", () => {
    expect(resolveInstalledCliInvocation(
      "C:\\consumer\\node_modules\\semantic-atlas\\dist\\cli\\bin.js",
      ["--repo", "C:\\fixture", "status"],
      {
        platform: "win32",
        nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
        packageManagerEntry: "C:\\pnpm\\pnpm.cjs",
      },
    )).toEqual({
      executable: "C:\\Program Files\\nodejs\\node.exe",
      arguments: [
        "C:\\consumer\\node_modules\\semantic-atlas\\dist\\cli\\bin.js",
        "--repo",
        "C:\\fixture",
        "status",
      ],
    });
  });
});
