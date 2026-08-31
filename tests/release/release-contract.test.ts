import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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
      version: "2.2.0",
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
      "README.zh-CN.md",
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
    expect(workflow.permissions).toEqual({ contents: "read" });
    const releaseGate = workflow.jobs.release_gate;
    expect(releaseGate).toBeDefined();
    if (!releaseGate) throw new Error("Trusted release gate job is missing");
    expect(releaseGate.if).toContain("!github.event.release.prerelease");
    expect(releaseGate.environment).toBeUndefined();
    expect(releaseGate.permissions).toEqual({ contents: "read" });
    expect(releaseGate.steps).toHaveLength(1);
    expect(releaseGate.steps).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ uses: "actions/checkout@v4" }),
    ]));
    expect(releaseGate.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "Verify immutable GitHub Release before checkout",
        run: expect.stringContaining("jq --exit-status"),
        env: {
          GH_TOKEN: "${{ github.token }}",
          RELEASE_TAG: "${{ github.event.release.tag_name }}",
        },
      }),
    ]));
    const gateCommand = String(
      releaseGate.steps.find((step) => step.name === "Verify immutable GitHub Release before checkout")?.run,
    );
    for (const immutableCondition of [
      ".tag_name == $release_tag",
      ".immutable == true",
      ".draft == false",
      ".prerelease == false",
    ]) {
      expect(gateCommand).toContain(immutableCondition);
    }

    const publish = workflow.jobs.publish;
    expect(publish).toBeDefined();
    if (!publish) throw new Error("Release publish job is missing");
    expect(publish.needs).toBe("release_gate");
    expect(publish.if).toContain("!github.event.release.prerelease");
    expect(publish.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(publish.environment).toBe("npm");
    const immutableReleaseStepIndex = publish.steps.findIndex(
      (step) => step.name === "Verify immutable GitHub Release",
    );
    const publishStepIndex = publish.steps.findIndex(
      (step) => step.name === "Publish npm package",
    );
    expect(immutableReleaseStepIndex).toBeGreaterThan(-1);
    expect(immutableReleaseStepIndex).toBeLessThan(publishStepIndex);
    expect(publish.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uses: "actions/checkout@v4",
        with: expect.objectContaining({
          ref: "refs/tags/${{ github.event.release.tag_name }}",
        }),
      }),
      expect.objectContaining({
        name: "Verify immutable GitHub Release",
        run: "gh api \"repos/${GITHUB_REPOSITORY}/releases/tags/${RELEASE_TAG}\" | node scripts/verify-github-release.mjs",
        env: {
          GH_TOKEN: "${{ github.token }}",
          RELEASE_TAG: "${{ github.event.release.tag_name }}",
        },
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

  it("rejects a mutable or mismatched GitHub Release", () => {
    const release = {
      tag_name: "v1.0.0",
      immutable: true,
      draft: false,
      prerelease: false,
    };

    expect(verifyGitHubRelease(release, "v1.0.0").status).toBe(0);

    for (const invalidRelease of [
      { ...release, immutable: false },
      { ...release, tag_name: "v1.0.1" },
      { ...release, draft: true },
      { ...release, prerelease: true },
    ]) {
      expect(verifyGitHubRelease(invalidRelease, "v1.0.0").status).not.toBe(0);
    }
  });

  it("documents the complete public user and release-owner journeys", async () => {
    const [readme, readmeZh, agents, release, productContract, deliveryPlan] = await Promise.all([
      read("README.md"),
      read("README.zh-CN.md"),
      read("AGENTS.md"),
      read(".claude/commands/release.md"),
      read("docs/product-contract.md"),
      read("docs/delivery-plan.md"),
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
    expect(readme).toContain("semantic-atlas web --repo");
    expect(readme).toContain("127.0.0.1");
    expect(readme).toContain("Drag to pan");
    expect(readme).toContain("semantic-atlas observe task --stdin");
    expect(readme).toContain("semantic-atlas reconcile candidates");
    expect(readme).toContain("semantic-atlas reconcile status");
    expect(readme).toContain("img.shields.io/npm/v/semantic-atlas.svg");
    expect(readme).toContain("License-MIT");
    expect(readme).toContain("[简体中文](README.zh-CN.md)");

    for (const section of [
      "## 安装",
      "## 升级",
      "## 添加业务地图",
      "## 证据顺序",
      "## 准确性观测",
      "## 地图校准",
      "## 本地数据与隐私",
    ]) {
      expect(readmeZh).toContain(section);
    }
    expect(readmeZh).toContain("semantic-atlas setup");
    expect(readmeZh).toContain("semantic-atlas web --repo");
    expect(readmeZh).toContain("127.0.0.1");
    expect(readmeZh).toContain("桌面右侧面板或窄屏底部");
    expect(readmeZh).toContain("semantic-atlas reconcile candidates");
    expect(readmeZh).toContain("semantic-atlas reconcile status");
    expect(readmeZh).toContain("[English](README.md)");

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
    expect(release).toContain("gh api --method PUT");
    expect(release).toContain("immutable-releases");
    expect(release).toContain("isImmutable");
    expect(release).toContain("gh run watch");
    expect(release).toContain("git merge-base --is-ancestor origin/main HEAD");
    expect(release).toContain("git push origin HEAD:refs/heads/main");
    expect(release).not.toContain("force-with-lease");
    expect(release).not.toContain("Direct V1 Main Cutover");

    for (const productDocument of [productContract, deliveryPlan]) {
      expect(productDocument).toContain("semantic-atlas@2.2.0");
      expect(productDocument).not.toContain("old-CLI upgrade compatibility");
      expect(productDocument).not.toContain("v0.4 transition rehearsal");
    }
    expect(productContract).toMatch(/local\s+read-only Web command/u);
    expect(deliveryPlan).toContain("## Interactive Viewer Extension");
    expect(deliveryPlan).toContain("Status: released in `semantic-atlas@2.1.0`");
  });
});

interface WorkflowJob {
  readonly environment?: string;
  readonly if?: string;
  readonly needs?: string;
  readonly permissions?: Record<string, string>;
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

function verifyGitHubRelease(release: Record<string, unknown>, releaseTag: string) {
  return spawnSync(process.execPath, [path.join(projectRoot, "scripts/verify-github-release.mjs")], {
    encoding: "utf8",
    env: { ...process.env, RELEASE_TAG: releaseTag },
    input: JSON.stringify(release),
  });
}
