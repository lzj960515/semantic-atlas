import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const publicRepository = "https://github.com/lzj960515/semantic-atlas";

describe("public release candidate", () => {
  it("declares the stable npm and clean source repository identity", async () => {
    const packageDocument = JSON.parse(await read("package.json")) as Record<string, unknown>;

    expect(packageDocument).toMatchObject({
      name: "semantic-atlas",
      version: "1.0.0",
      license: "MIT",
      homepage: `${publicRepository}#readme`,
      bugs: { url: `${publicRepository}/issues` },
      repository: {
        type: "git",
        url: `git+${publicRepository}.git`,
      },
      engines: { node: ">=24 <25" },
      publishConfig: { access: "public", provenance: true },
    });
    expect(packageDocument).not.toHaveProperty("private");
    expect(packageDocument.files).not.toContain("docs");
    expect(packageDocument.files).toEqual(expect.arrayContaining([
      ".agents",
      "dist",
      "docs/map-format.md",
      "docs/observations.md",
      "examples",
      "LICENSE",
      "README.md",
    ]));
    await expect(read("LICENSE")).resolves.toContain("MIT License");
  });

  it("runs source and installed-product gates on pushes and pull requests", async () => {
    const workflow = parse(await read(".github/workflows/ci.yml")) as Workflow;

    expect(workflow.name).toBe("CI");
    expect(workflow.on).toMatchObject({ push: {}, pull_request: {} });
    expect(workflow.permissions).toEqual({ contents: "read" });
    const quality = workflow.jobs.quality;
    expect(quality).toBeDefined();
    if (!quality) throw new Error("CI quality job is missing");
    expect(quality["runs-on"]).toBe("ubuntu-latest");
    expect(quality.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ uses: "actions/checkout@v4" }),
      expect.objectContaining({ uses: "pnpm/action-setup@v4" }),
      expect.objectContaining({
        uses: "actions/setup-node@v4",
        with: expect.objectContaining({ "node-version": 24 }),
      }),
      expect.objectContaining({ run: "pnpm install --frozen-lockfile" }),
      expect.objectContaining({ run: "pnpm release:verify" }),
    ]));
  });

  it("publishes only a matching immutable GitHub Release tag through npm provenance", async () => {
    const workflow = parse(await read(".github/workflows/release.yml")) as Workflow;

    expect(workflow.on).toEqual({ release: { types: ["published"] } });
    expect(workflow.permissions).toEqual({ contents: "read", "id-token": "write" });
    const publish = workflow.jobs.publish;
    expect(publish).toBeDefined();
    if (!publish) throw new Error("Release publish job is missing");
    expect(publish.if).toContain("!github.event.release.prerelease");
    expect(publish.environment).toBe("npm");
    expect(publish.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uses: "actions/checkout@v4",
        with: expect.objectContaining({
          ref: "refs/tags/${{ github.event.release.tag_name }}",
        }),
      }),
      expect.objectContaining({
        name: "Verify release identity",
        run: "node scripts/verify-release-tag.mjs",
      }),
      expect.objectContaining({ run: "pnpm release:verify" }),
      expect.objectContaining({
        name: "Publish npm package",
        run: "pnpm publish --no-git-checks --access public --provenance",
        env: { NODE_AUTH_TOKEN: "${{ secrets.NPM_TOKEN }}" },
      }),
      expect.objectContaining({
        name: "Verify public package",
        run: "node scripts/verify-published-package.mjs",
      }),
    ]));
  });

  it("documents the complete public user and release-owner journeys", async () => {
    const [readme, agents, release] = await Promise.all([
      read("README.md"),
      read("AGENTS.md"),
      read(".claude/commands/release.md"),
    ]);

    for (const section of [
      "## Install",
      "## Upgrade",
      "## Add A Business Map",
      "## Evidence Order",
      "## Accuracy Observations",
      "## Reconciliation",
      "## Local Data And Privacy",
    ]) {
      expect(readme).toContain(section);
    }
    expect(readme).toContain("npm install --global semantic-atlas");
    expect(readme).toContain("semantic-atlas setup");
    expect(readme).toContain("docs/business-map/*.yaml");
    expect(readme).toContain("semantic-atlas observe task --stdin");
    expect(readme).toContain("semantic-atlas reconcile candidates");

    for (const evidence of [
      "pnpm release:verify",
      "GitHub Release",
      "npm provenance",
      "npm view",
    ]) {
      expect(agents).toContain(evidence);
      expect(release).toContain(evidence);
    }
    expect(release).toContain("gh release create");
    expect(release).toContain("gh run watch");
  });
});

interface WorkflowJob {
  readonly environment?: string;
  readonly if?: string;
  readonly "runs-on": string;
  readonly steps: readonly Record<string, unknown>[];
}

interface Workflow {
  readonly name: string;
  readonly on: Record<string, unknown>;
  readonly permissions: Record<string, string>;
  readonly jobs: Record<string, WorkflowJob>;
}

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}
