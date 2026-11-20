import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import { getResources } from "../../src/i18n/index.js";
import { MapApplication } from "../../src/application/map-application.js";
import { LocalWebApplication } from "../../src/web/local-web-application.js";
import { startLocalWebServer, type LocalWebServer } from "../../src/web/local-web-server.js";
import {
  createEmptyRepository,
  createMapRepository,
  node,
  removeRepository,
  type TestMapDocument,
} from "../support/map-repository.js";

const repositories: string[] = [];
const servers: LocalWebServer[] = [];
const languageVariables = ["SEMANTIC_ATLAS_LANG", "LC_ALL", "LC_MESSAGES", "LANG"] as const;

beforeEach(() => {
  for (const name of languageVariables) vi.stubEnv(name, "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(repositories.splice(0).map(removeRepository));
});

describe("internationalized public surfaces", () => {
  it.each([
    [{}, false],
    [{ LANG: "zh_CN.UTF-8" }, true],
    [{ LANG: "zh_SG.UTF-8" }, true],
    [{ LANG: "zh-Hans-CN" }, true],
    [{ LANG: "zh" }, true],
    [{ LANG: "zh_TW.UTF-8" }, false],
    [{ LANG: "zh-Hant" }, false],
    [{ LANG: "fr_FR.UTF-8" }, false],
    [{ LANG: "zh_CN.UTF-8", LC_MESSAGES: "en_US.UTF-8" }, false],
    [{ LANG: "en_US.UTF-8", LC_MESSAGES: "zh_CN.UTF-8" }, true],
    [{ LC_MESSAGES: "zh_CN.UTF-8", LC_ALL: "C" }, false],
    [{ LC_MESSAGES: "en_US.UTF-8", LC_ALL: "zh_CN.UTF-8" }, true],
    [{ LC_ALL: "zh_CN.UTF-8", SEMANTIC_ATLAS_LANG: "de" }, false],
    [{ LC_ALL: "C", SEMANTIC_ATLAS_LANG: "zh-CN" }, true],
    [{ LANG: "zh_CN.UTF-8", SEMANTIC_ATLAS_LANG: "  " }, true],
  ] as const)("selects help language from %j", async (environment, chinese) => {
    for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(chinese ? "用法：" : "Usage:");
    expect(result.stdout).toContain(chinese ? "显示命令帮助" : "display help");
    expect(result.stdout).toContain("--version");
    expect(result.stdout).toContain("validate");
  });

  it("changes schema diagnostics between consecutive invocations without changing error codes", async () => {
    const repository = await trackedRepository({
      ...mapDocument(),
      nodes: [node("BAD ID", "domain", "业务标题")],
      unexpected: true,
    } as TestMapDocument);
    const outputs: { error: { issues: { code: string; message: string }[] } }[] = [];
    for (const language of ["en", "zh-CN", "en"]) {
      vi.stubEnv("SEMANTIC_ATLAS_LANG", language);
      const result = await runCli(["validate", "--repo", repository]);
      expect(result.exitCode).toBe(1);
      outputs.push(JSON.parse(result.stdout));
    }
    expect(outputs[0]!).toEqual(outputs[2]);
    expect(outputs[1]!).toMatchObject({
      ok: false,
      command: "validate",
      error: { code: "MAP_DOCUMENT_INVALID" },
    });
    const diagnostics = (output: (typeof outputs)[number]) =>
      output.error.issues.map((issue: { message: string }) => issue.message).join("\n");
    expect(diagnostics(outputs[0]!)).toMatch(/Unrecognized|Invalid/u);
    expect(diagnostics(outputs[1]!)).toMatch(/[\u4e00-\u9fff]/u);
    expect(diagnostics(outputs[1]!)).not.toMatch(/Unrecognized key|Invalid string/u);
    expect(diagnostics(outputs[0]!)).toContain("IDs use lowercase");
    expect(diagnostics(outputs[1]!)).toContain("ID 使用小写业务词汇");
    expect(diagnostics(outputs[1]!)).not.toContain("IDs use lowercase");
    expect(outputs[1]!.error.issues.map((issue: { code: string }) => issue.code)).toEqual(
      outputs[0]!.error.issues.map((issue: { code: string }) => issue.code),
    );
  });

  it("preserves user business text and machine-readable context when the language changes", async () => {
    const repository = await trackedRepository(mapDocument());
    const english = await runCli(["context", "commerce", "--repo", repository]);
    vi.stubEnv("SEMANTIC_ATLAS_LANG", "zh-CN");
    const chinese = await runCli(["context", "commerce", "--repo", repository]);
    expect(english.exitCode).toBe(0);
    expect(chinese.stdout).toBe(english.stdout);
    expect(JSON.parse(chinese.stdout).data.selected).toMatchObject({
      kind: "domain",
      name: "Original business 商务",
    });
  });

  it("keeps exported process content literal and independent of shell language", async () => {
    const title = "</script><script>globalThis.injected=true</script> 商务 {{count}}";
    const repository = await trackedRepository(viewerDocument(title));
    const english = await renderRepository(repository, "en");
    expect(await renderRepository(repository, "zh-CN")).toBe(english);
    expect(english).not.toContain(title);
    expect(english).not.toMatch(/<script[^>]+src=/u);
    const model = viewerModel(english);
    expect(
      model.projectPayloads[0].project.flows[0].nodes.find(
        (node: { id: string }) => node.id === "start",
      ).name,
    ).toBe(title);
    expect(
      model.projectPayloads[0].project.flows[0].nodes.find(
        (node: { id: string }) => node.id === "start",
      ).summary,
    ).toBe("$t(viewer.title) {{source}}");
    expect(model.resources.en.translation.viewer.back).toBe("Previous level");
    expect(model.resources["zh-CN"].translation.viewer.back).toBe("上一层");
  });

  it("serves lazy process content and stable localized error keys without repository paths", async () => {
    const repository = await trackedRepository(viewerDocument("下单流程"));
    const missing = await createEmptyRepository();
    repositories.push(missing);
    const server = await startLocalWebServer({
      application: new LocalWebApplication(new MapApplication(), [repository, missing]),
      port: 0,
    });
    servers.push(server);
    const html = await (await fetch(server.url)).text();
    const model = viewerModel(html);
    expect(model.projectPayloads).toEqual([]);
    expect(html).not.toContain(repository);
    const loaded = await (await fetch(`${server.url}/api/projects/${model.projects[0].id}`)).json();
    expect(
      loaded.data.project.flows[0].nodes.find((node: { id: string }) => node.id === "start").name,
    ).toBe("下单流程");
    const unavailable = await (
      await fetch(`${server.url}/api/projects/${model.projects[1].id}`)
    ).json();
    expect(unavailable.error.messageKey).toBe("errors.projectMapMissing");
    expect(unavailable.error.message).not.toContain(missing);
  });

  it("keeps every language resource and interpolation argument complete", () => {
    const resources = getResources();
    const english = flatten(resources.en.translation);
    for (const [language, resource] of Object.entries(resources)) {
      const translated = flatten(resource.translation);
      expect(Object.keys(translated).sort(), language).toEqual(Object.keys(english).sort());
      for (const [key, value] of Object.entries(translated)) {
        expect(value.trim(), `${language}:${key}`).not.toBe("");
        const argumentsOf = (text: string) =>
          [...text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/gu)].map((match) => match[1]).sort();
        expect(argumentsOf(value), `${language}:${key}`).toEqual(argumentsOf(english[key]!));
      }
    }
  });
});

function flatten(value: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      return typeof item === "string"
        ? [[fullKey, item]]
        : Object.entries(flatten(item as Record<string, unknown>, fullKey));
    }),
  );
}

function mapDocument(): TestMapDocument {
  return {
    schemaVersion: 1,
    map: { id: "commerce", title: "Commerce", summary: "Business" },
    nodes: [node("commerce", "domain", "Original business 商务")],
    relations: [],
    flows: [],
  };
}

async function trackedRepository(document: TestMapDocument): Promise<string> {
  const repository = await createMapRepository({ "commerce.yaml": document });
  repositories.push(repository);
  return repository;
}

function viewerDocument(title: string): TestMapDocument {
  return {
    ...mapDocument(),
    nodes: [node("commerce.checkout", "scenario", "Checkout")],
    relations: [],
    flows: [
      {
        id: "commerce.checkout.flow",
        name: "下单流程",
        summary: "从确认商品到下单完成。",
        scenario: "commerce.checkout",
        startsAt: "start",
        steps: [
          { id: "start", kind: "action", name: title, summary: "$t(viewer.title) {{source}}" },
          { id: "done", kind: "outcome", name: "完成", summary: "订单已确认。" },
        ],
        transitions: [{ from: "start", to: "done" }],
      },
    ],
  };
}

async function renderRepository(repository: string, language: string): Promise<string> {
  vi.stubEnv("SEMANTIC_ATLAS_LANG", language);
  const output = path.join(repository, "viewer.html");
  const result = await runCli(["render", "--repo", repository, "--output", output]);
  expect(result.exitCode).toBe(0);
  return readFile(output, "utf8");
}

function viewerModel(html: string) {
  const text = html.match(
    /<script id="viewer-model" type="application\/json">([\s\S]*?)<\/script>/u,
  )?.[1];
  expect(text).toBeDefined();
  return JSON.parse(text!);
}
