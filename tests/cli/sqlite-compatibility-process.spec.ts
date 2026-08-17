import { describe, expect, it } from "vitest";

import {
  createSqliteCompatibilityArguments,
  requiresSqliteCompatibilityProcess,
} from "../../src/runtime/sqlite-compatibility-process.js";

describe("SQLite compatibility process", () => {
  it("restarts Node 22 when SQLite or warning suppression is unavailable", () => {
    expect(requiresSqliteCompatibilityProcess({
      nodeVersion: "22.12.0",
      execArguments: [],
      sqliteAvailable: false,
    })).toBe(true);
    expect(requiresSqliteCompatibilityProcess({
      nodeVersion: "22.12.0",
      execArguments: ["--experimental-sqlite", "--disable-warning=ExperimentalWarning"],
      sqliteAvailable: true,
    })).toBe(false);
  });

  it("restarts Node 24 only when SQLite is unavailable", () => {
    expect(requiresSqliteCompatibilityProcess({
      nodeVersion: "24.18.0",
      execArguments: [],
      sqliteAvailable: true,
    })).toBe(false);
    expect(requiresSqliteCompatibilityProcess({
      nodeVersion: "24.18.0",
      execArguments: [],
      sqliteAvailable: false,
    })).toBe(true);
  });

  it("preserves TypeScript loader arguments while overriding a disabled SQLite runtime", () => {
    expect(createSqliteCompatibilityArguments(
      "/project/scripts/verify-package.ts",
      [],
      ["--no-experimental-sqlite", "--import", "tsx"],
    )).toEqual([
      "--experimental-sqlite",
      "--disable-warning=ExperimentalWarning",
      "--import",
      "tsx",
      "/project/scripts/verify-package.ts",
    ]);
  });
});
