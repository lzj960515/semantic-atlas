import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCliRuntime, runCli, type CliRuntime } from "../../src/cli/run-cli.js";
import * as localWebServer from "../../src/web/local-web-server.js";
import type { LocalWebServer } from "../../src/web/local-web-server.js";
import {
  createEmptyRepository,
  createMapRepository,
  flow,
  flowStep,
  node,
  relation,
  removeRepository,
} from "../support/map-repository.js";

const sandboxes: string[] = [];
const servers: LocalWebServer[] = [];
const startLocalWebServer = localWebServer.startLocalWebServer;
let signalListeners: ReadonlyMap<NodeJS.Signals, ReturnType<typeof process.rawListeners>>;

beforeEach(() => {
  signalListeners = new Map(
    (["SIGINT", "SIGTERM"] as const).map((signal) => [signal, process.rawListeners(signal)]),
  );
  vi.spyOn(localWebServer, "startLocalWebServer").mockImplementation(async (options) => {
    const server = await startLocalWebServer(options);
    servers.push(server);
    return server;
  });
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const [signal, existing] of signalListeners) {
    for (const listener of process.rawListeners(signal)) {
      if (!existing.includes(listener)) process.removeListener(signal, listener as () => void);
    }
  }
  vi.restoreAllMocks();
  await Promise.all(sandboxes.splice(0).map(removeRepository));
});

describe("业务流程直达链接", () => {
  it.each(["repo", "project", "only-registered"] as const)(
    "通过 %s 选择项目后，返回能定位实际项目和非默认流程的 URL",
    async (selection) => {
      const root = await mappedRepository();
      const roots = selection === "only-registered" ? [root] : [await mappedRepository(), root];
      const runtime = await runtimeWithProjects(roots);
      const catalog = JSON.parse((await runCli(["project", "list"], runtime)).stdout).data.projects;
      const project = catalog.find(
        (candidate: { repositoryPath: string }) => candidate.repositoryPath === root,
      );
      const selector =
        selection === "repo"
          ? ["--repo", root]
          : selection === "project"
            ? ["--project", project.id]
            : [];

      const result = await runCli(
        ["web", ...selector, "--flow", "orders.refund-flow", "--no-open"],
        runtime,
      );

      expect(result.exitCode, result.stdout).toBe(0);
      const data = JSON.parse(result.stdout).data;
      const url = new URL(data.url);
      const location = new URLSearchParams(url.hash.slice(1));
      expect(data.repositoryCount).toBe(1);
      expect(location.get("project")).toBe(project.id);
      expect(location.get("flow")).toBe("orders.refund-flow");
      const payload = await (
        await fetch(`${url.origin}/api/projects/${location.get("project")}`)
      ).json();
      expect(payload.data.project.flows.map(({ id }: { id: string }) => id)).toEqual([
        "orders.checkout-flow",
        "orders.refund-flow",
      ]);
    },
  );

  it("目标流程不存在时返回错误，并且不启动本地服务", async () => {
    const root = await mappedRepository();
    const runtime = await runtimeWithProjects([root]);

    const result = await runCli(
      ["web", "--repo", root, "--flow", "orders.missing-flow", "--no-open"],
      runtime,
    );

    expect(result.exitCode, result.stdout).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      command: "web",
      error: { code: "WEB_START_FAILED", message: expect.stringContaining("orders.missing-flow") },
    });
    expect(servers).toHaveLength(0);
  });

  it.each(["explicit", "registered"] as const)(
    "%s 多项目没有明确目标时要求选择项目，不搜索或猜测流程所属项目",
    async (selection) => {
      const roots = [await mappedRepository(), await mappedRepository()];
      const runtime = await runtimeWithProjects(roots);

      const result = await runCli(
        [
          "web",
          ...(selection === "explicit" ? ["--repo", ...roots] : []),
          "--flow",
          "orders.refund-flow",
          "--no-open",
        ],
        runtime,
      );

      expect(result.exitCode, result.stdout).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        command: "web",
        error: {
          code: "WEB_START_FAILED",
          message: expect.stringContaining("--project"),
        },
      });
      expect(servers).toHaveLength(0);
    },
  );
});

async function runtimeWithProjects(roots: readonly string[]): Promise<CliRuntime> {
  const userHome = await createEmptyRepository();
  sandboxes.push(userHome);
  const runtime = await createCliRuntime({ userHome });
  for (const root of roots) {
    const added = await runtime.addProject(root);
    expect(added.ok).toBe(true);
  }
  return {
    ...runtime,
    startWeb: (options) => runtime.startWeb({ ...options, port: 0 }),
  };
}

async function mappedRepository(): Promise<string> {
  const root = await createMapRepository({
    "orders.yaml": {
      schemaVersion: 1,
      map: { id: "orders", title: "订单", summary: "下单与退款业务。" },
      nodes: [
        node("orders", "domain", "订单"),
        node("orders.checkout", "scenario", "下单"),
        node("orders.refund", "scenario", "退款"),
      ],
      relations: [
        relation("orders.checkout", "part_of", "orders"),
        relation("orders.refund", "part_of", "orders"),
      ],
      flows: [
        flow(
          "orders.checkout-flow",
          "orders.checkout",
          "complete",
          [flowStep("complete", "outcome", "下单完成")],
          [],
        ),
        flow(
          "orders.refund-flow",
          "orders.refund",
          "complete",
          [flowStep("complete", "outcome", "退款完成")],
          [],
        ),
      ],
    },
  });
  sandboxes.push(root);
  return root;
}
