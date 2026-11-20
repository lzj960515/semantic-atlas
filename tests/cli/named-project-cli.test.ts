import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MapApplication } from "../../src/application/map-application.js";
import { createCliRuntime, runCli, type CliRuntime } from "../../src/cli/run-cli.js";
import { LocalWebApplication } from "../../src/web/local-web-application.js";
import {
  createMapRepository,
  flow,
  flowStep,
  node,
  transition,
} from "../support/map-repository.js";

const sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("按已登记项目查询", () => {
  it("列出名称、稳定ID和路径，并与Web保持相同项目身份", async () => {
    const { runtime, roots } = await projects(["orders-api", "shipping-api"]);
    const result = await runCli(["project", "list"], runtime);

    expect(result.exitCode, result.stdout).toBe(0);
    const catalog = JSON.parse(result.stdout).data.projects;
    expect(catalog).toEqual(
      roots.map((repositoryPath) => ({
        id: expect.stringMatching(/^[a-f0-9]{24}$/u),
        name: path.basename(repositoryPath),
        displayName: path.basename(repositoryPath),
        repositoryPath,
      })),
    );
    const web = new LocalWebApplication(new MapApplication(), roots).render();
    const model = JSON.parse(
      /<script id="viewer-model" type="application\/json">([^<]+)<\/script>/u.exec(web)?.[1] ??
        "{}",
    );
    expect(model.projects).toEqual(
      catalog.map((project: { id: string; displayName: string }) => ({
        id: project.id,
        name: project.displayName,
      })),
    );
    expect(web).not.toContain(roots[0]);
  });

  it("在其他工作目录按名称或ID查询，重复的业务ID仍严格归属于选中项目", async () => {
    const { runtime, roots } = await projects(["orders-api", "shipping-api"]);
    const catalog = JSON.parse((await runCli(["project", "list"], runtime)).stdout).data.projects;
    const selectedRoot = roots[1]!;
    expect(selectedRoot).not.toBe(process.cwd());
    for (const selection of ["  SHIPPING-API  ", "ｓｈｉｐｐｉｎｇ-ａｐｉ", catalog[1].id]) {
      for (const arguments_ of [
        ["search", "订单"],
        ["search", "订单", "--flows"],
        ["flows", "checkout.flow"],
        ["context", "order"],
        ["validate"],
      ]) {
        const result = await runCli([...arguments_, "--project", selection], runtime);
        expect(result.exitCode, result.stdout).toBe(0);
        const envelope = JSON.parse(result.stdout);
        expect(envelope.repository.root).toBe(selectedRoot);
        expect(envelope.repository.root).not.toBe(roots[0]);
        if (arguments_[0] === "context")
          expect(envelope.data.selected.name).toBe("shipping-api订单");
      }
    }

    const rendered = await runCli(["render", "--project", "shipping-api"], runtime);
    expect(rendered.exitCode, rendered.stdout).toBe(0);
    const outputPath = JSON.parse(rendered.stdout).data.outputPath;
    expect(outputPath).toBe(path.join(selectedRoot, "semantic-atlas.html"));
    expect(await readFile(outputPath, "utf8")).toContain("shipping-api订单");
  });

  it("拼错或只知短名时返回相近候选，不静默查询或写出相似项目", async () => {
    const { runtime, roots } = await projects(["orders-api", "pietra-ex-api", "shipping-api"]);
    for (const [selector, expectedName] of [
      ["ordres-api", "orders-api"],
      ["ex", "pietra-ex-api"],
    ]) {
      const result = await runCli(["render", "--project", selector!], runtime);
      expect(result.exitCode, result.stdout).toBe(1);
      const envelope = JSON.parse(result.stdout);
      expect(envelope).toMatchObject({
        ok: false,
        command: "render",
        error: {
          code: "PROJECT_NOT_FOUND",
          selector,
          candidates: expect.arrayContaining([expect.objectContaining({ name: expectedName })]),
        },
      });
      expect(envelope.repository).toBeUndefined();
      expect(envelope.error.candidates.length).toBeLessThanOrEqual(5);
    }
    for (const root of roots) {
      await expect(readFile(path.join(root, "semantic-atlas.html"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
    const unrelated = JSON.parse(
      (await runCli(["validate", "--project", "zzzzzzzz"], runtime)).stdout,
    );
    expect(unrelated.error.candidates).toEqual([]);
  });

  it("重名目录返回歧义候选，只有精确ID可选中其中一个", async () => {
    const { runtime, roots } = await projects(["team-a/checkout", "team-b/checkout"]);
    const result = await runCli(["context", "order", "--project", "checkout"], runtime);
    expect(result.exitCode, result.stdout).toBe(1);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.error).toMatchObject({
      code: "PROJECT_AMBIGUOUS",
      selector: "checkout",
      candidates: [
        { name: "checkout", displayName: "checkout (1)", repositoryPath: roots[0] },
        { name: "checkout", displayName: "checkout (2)", repositoryPath: roots[1] },
      ],
    });
    const selected = await runCli(
      ["context", "order", "--project", envelope.error.candidates[1].id],
      runtime,
    );
    expect(JSON.parse(selected.stdout).repository.root).toBe(roots[1]);
  });

  it("显式路径与名称不能同时选择项目，保留原路径查询", async () => {
    const { runtime, roots } = await projects(["orders-api"]);
    for (const arguments_ of [
      ["validate"],
      ["render"],
      ["search", "订单"],
      ["flows"],
      ["context", "order"],
      ["web", "--no-open"],
    ]) {
      const result = await runCli(
        [...arguments_, "--project", "orders-api", "--repo", roots[0]!],
        runtime,
      );
      expect(result.exitCode, result.stdout).toBe(2);
      expect(JSON.parse(result.stdout).error).toMatchObject({ code: "INVALID_COMMAND" });
    }
    const explicit = await runCli(["validate", "--repo", roots[0]!], runtime);
    expect(explicit.exitCode, explicit.stdout).toBe(0);
    expect(JSON.parse(explicit.stdout).repository.root).toBe(roots[0]);
  });

  it("空目录可列出，登记文件无效时保留配置错误", async () => {
    const home = await sandbox();
    const runtime = await createCliRuntime({ userHome: home });
    expect(JSON.parse((await runCli(["project", "list"], runtime)).stdout).data.projects).toEqual(
      [],
    );
    const missing = await runCli(["flows", "--project", "unknown"], runtime);
    expect(JSON.parse(missing.stdout).error).toMatchObject({
      code: "PROJECT_NOT_FOUND",
      candidates: [],
    });
    await mkdir(path.join(home, ".semantic-atlas"));
    await writeFile(
      path.join(home, ".semantic-atlas", "projects.json"),
      '{"schemaVersion":2,"paths":[]}',
    );
    for (const arguments_ of [
      ["project", "list"],
      ["validate", "--project", "unknown"],
    ]) {
      const invalid = await runCli(arguments_, runtime);
      expect(invalid.exitCode, invalid.stdout).toBe(1);
      expect(JSON.parse(invalid.stdout).error.code).toBe("PROJECT_CONFIG_INVALID");
    }
  });
});

async function sandbox(): Promise<string> {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-named-project-")),
  );
  sandboxes.push(root);
  return root;
}

async function projects(
  names: readonly string[],
): Promise<{ runtime: CliRuntime; roots: string[] }> {
  const home = await sandbox();
  const runtime = await createCliRuntime({ userHome: home });
  const roots: string[] = [];
  for (const name of names) {
    const source = await createMapRepository({
      "orders.yaml": {
        schemaVersion: 1,
        map: { id: "orders", title: "订单", summary: "订单业务" },
        nodes: [node("order", "scenario", `${name}订单`)],
        relations: [],
        flows: [
          {
            ...flow(
              "checkout.flow",
              "order",
              "receive",
              [
                flowStep("receive", "action", `${name}订单`, "order"),
                flowStep("done", "outcome", "完成"),
              ],
              [transition("receive", "done")],
            ),
            name: `${name}订单`,
          },
        ],
      },
    });
    const root = path.join(home, name);
    await mkdir(path.dirname(root), { recursive: true });
    await rename(source, root);
    roots.push(root);
    const registered = await runCli(["project", "add", root], runtime);
    expect(registered.exitCode, registered.stdout).toBe(0);
  }
  return { runtime, roots };
}
