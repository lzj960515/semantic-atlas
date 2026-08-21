import { describe, expect, it } from "vitest";

import { parseWebArguments } from "../../src/cli/web-cli.js";

describe("semantic-atlas web arguments", () => {
  it("parses the desktop viewer options independently from project JSON commands", () => {
    expect(parseWebArguments([
      "web",
      "--repo",
      "/workspace/atlas",
      "--port",
      "4400",
      "--no-open",
    ], "/workspace")).toEqual({
      initialRepositoryPath: "/workspace/atlas",
      port: 4400,
      openBrowser: false,
    });
    expect(parseWebArguments(["web"], "/workspace")).toEqual({
      initialRepositoryPath: undefined,
      port: 4310,
      openBrowser: true,
    });
    expect(parseWebArguments(["status"], "/workspace")).toBeUndefined();
  });

  it("rejects duplicate, unknown, and out-of-range options", () => {
    expect(() => parseWebArguments(["web", "--port", "0"], "/workspace"))
      .toThrow(/1 through 65535/iu);
    expect(() => parseWebArguments(["web", "--port", "4310", "--port", "4311"], "/workspace"))
      .toThrow(/once/iu);
    expect(() => parseWebArguments(["web", "--pretty"], "/workspace"))
      .toThrow(/accepts only/iu);
  });
});
