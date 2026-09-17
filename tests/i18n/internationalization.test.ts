import { readFile } from "node:fs/promises";
import path from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import { getResources } from "../../src/i18n/index.js";
import { renderWebViewerPage } from "../../src/rendering/viewer-page.js";
import { MapApplication } from "../../src/application/map-application.js";
import { LocalWebApplication } from "../../src/web/local-web-application.js";
import { startLocalWebServer, type LocalWebServer } from "../../src/web/local-web-server.js";
import { createEmptyRepository, createMapRepository, node, relation, removeRepository, type TestMapDocument } from "../support/map-repository.js";

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
    const repository = await trackedRepository({ ...mapDocument(), nodes: [node("BAD ID", "domain", "业务标题")], unexpected: true } as TestMapDocument);
    const outputs: { error: { issues: { code: string; message: string }[] } }[] = [];
    for (const language of ["en", "zh-CN", "en"]) {
      vi.stubEnv("SEMANTIC_ATLAS_LANG", language);
      const result = await runCli(["validate", "--repo", repository]);
      expect(result.exitCode).toBe(1);
      outputs.push(JSON.parse(result.stdout));
    }
    expect(outputs[0]!).toEqual(outputs[2]);
    expect(outputs[1]!).toMatchObject({ ok: false, command: "validate", error: { code: "MAP_DOCUMENT_INVALID" } });
    const diagnostics = (output: typeof outputs[number]) => output.error.issues.map((issue: { message: string }) => issue.message).join("\n");
    expect(diagnostics(outputs[0]!)).toMatch(/Unrecognized|Invalid/u);
    expect(diagnostics(outputs[1]!)).toMatch(/[\u4e00-\u9fff]/u);
    expect(diagnostics(outputs[1]!)).not.toMatch(/Unrecognized key|Invalid string/u);
    expect(diagnostics(outputs[0]!)).toContain("IDs use lowercase");
    expect(diagnostics(outputs[1]!)).toContain("ID 使用小写业务词汇");
    expect(diagnostics(outputs[1]!)).not.toContain("IDs use lowercase");
    expect(outputs[1]!.error.issues.map((issue: { code: string }) => issue.code))
      .toEqual(outputs[0]!.error.issues.map((issue: { code: string }) => issue.code));
  });

  it("preserves user business text and machine-readable context when the language changes", async () => {
    const repository = await trackedRepository(mapDocument());
    const english = await runCli(["context", "commerce", "--repo", repository]);
    vi.stubEnv("SEMANTIC_ATLAS_LANG", "zh-CN");
    const chinese = await runCli(["context", "commerce", "--repo", repository]);
    expect(english.exitCode).toBe(0);
    expect(chinese.stdout).toBe(english.stdout);
    expect(JSON.parse(chinese.stdout).data.selected).toMatchObject({ kind: "domain", name: "Original business 商务" });
  });

  it("renders byte-identical English HTML regardless of shell locale, then follows each browser", async () => {
    const dangerousTitle = "</script><script>globalThis.injected=true</script> 商务 {{count}}";
    const repository = await trackedRepository(viewerDocument(dangerousTitle));
    const englishHtml = await renderRepository(repository, "en");
    const chineseShellHtml = await renderRepository(repository, "zh-CN");
    expect(chineseShellHtml === englishHtml).toBe(true);
    expect(englishHtml.includes('<html lang="en"')).toBe(true);
    expect(englishHtml.includes(">Export PNG</span>")).toBe(true);
    expect(englishHtml.includes(dangerousTitle)).toBe(false);
    expect(englishHtml).not.toMatch(/<script[^>]+src=/u);
    const model = viewerModel(englishHtml);
    expect(model.projectPayloads[0].project.views[0].nodes.some((item: { name: string }) => item.name === dangerousTitle)).toBe(true);

    for (const language of ["en", "zh-CN"]) {
      // The same bytes are opened with a browser language opposite the current shell.
      vi.stubEnv("SEMANTIC_ATLAS_LANG", language === "en" ? "zh-CN" : "en");
      const browser = openViewer(englishHtml, { languages: [language], language });
      expect(browser.element("#map-statistics").textContent)
        .toBe(language === "en" ? "3 concepts / 3 relationships" : "3 个概念 / 3 条关系");
      expect(browser.documentElement.lang).toBe(language);
      expect(browser.translatedText("viewer.exportPng")).toBe(language === "en" ? "Export PNG" : "导出 PNG");
      expect(browser.translatedText("viewer.nodeKinds.operation")).toBe(language === "en" ? "operation" : "操作");
      expect(browser.translatedText("viewer.relationKinds.writes")).toBe(language === "en" ? "writes" : "写入");
      expect(browser.element("#project-select").getAttribute("aria-label")).toBe(language === "en" ? "Project" : "项目");
      expect(browser.hasText(dangerousTitle)).toBe(true);
      expect(browser.hasText("All business $t(viewer.title) {{source}}")).toBe(true);
      expect(browser.translatedText("viewer.relationSummary"))
        .toBe(`All business $t(viewer.title) {{source}} ${language === "en" ? "writes" : "写入"} Order: Keep $t(viewer.title) and {{source}} literal`);
      expect(() => runInContext("__semanticAtlasDiagramImage.planDiagramImage({width: 0, height: 10})", browser.runtime))
        .toThrow(language === "en" ? /dimensions/u : /尺寸无效/u);
      expect(() => runInContext("__semanticAtlasDiagramImage.planDiagramImage({width: 20000, height: 20000})", browser.runtime))
        .toThrow(language === "en" ? /too large/u : /图表过大/u);
      await expect(runInContext("__semanticAtlasDiagramImage.renderDiagramImage({isConnected: false}, null, __semanticAtlasDiagramImage.planDiagramImage)", browser.runtime))
        .rejects.toThrow(language === "en" ? /changed/u : /已更改/u);
      expect(runInContext("typeof injected", browser.runtime)).toBe("undefined");
    }
  });

  it.each([
    ["$t(viewer.project)", "Summary"],
    ["All business", "$t(viewer.project) {{source}}"],
  ])("keeps interpolation-looking business text literal in relationship titles and ARIA: %s / %s", async (source, summary) => {
    const repository = await trackedRepository({
      ...mapDocument(),
      nodes: [node("commerce.source", "operation", source), node("commerce.target", "data", "Target")],
      relations: [{ ...relation("commerce.source", "writes", "commerce.target"), summary }],
    });
    const html = await renderRepository(repository, "en");
    const browser = openViewer(html, { language: "zh-CN" });
    expect(browser.translatedText("viewer.relationSummary")).toBe(`${source} 写入 Target: ${summary}`);
    expect(browser.translatedAttribute("viewer.relationLabel", "aria-label")).toBe(`${source} 写入 Target`);
    expect(browser.hasText(source)).toBe(true);
  });

  it.each([
    [{ languages: ["fr-FR", "zh-CN", "en"], language: "en" }, "zh-CN"],
    [{ languages: ["en-GB", "zh-CN"], language: "zh-CN" }, "en"],
    [{ languages: ["zh-Hans"], language: "en" }, "zh-CN"],
    [{ languages: ["zh-SG"], language: "en" }, "zh-CN"],
    [{ languages: ["zh-TW"], language: "zh-TW" }, "en"],
    [{ languages: ["zh-Hant"], language: "zh-Hant" }, "en"],
    [{ languages: ["zh-TW", "zh-CN"], language: "zh-TW" }, "zh-CN"],
    [{ languages: ["fr-FR"], language: "fr-FR" }, "en"],
    [{ language: "zh-CN" }, "zh-CN"],
    [{ languages: [], language: "zh-CN" }, "zh-CN"],
    [undefined, "en"],
  ] as const)("detects the first supported browser language from %j", (navigator, expected) => {
    vi.stubEnv("SEMANTIC_ATLAS_LANG", "zh-CN");
    const browser = openViewer(renderWebViewerPage([]), navigator);
    expect(browser.documentElement.lang).toBe(expected);
    expect(browser.element("#viewer-status-title").textContent)
      .toBe(expected === "en" ? "No projects registered" : "尚未注册项目");
    expect(browser.storage).not.toHaveBeenCalled();
  });

  it.each(["en", "zh-CN"])("localizes lazy Web markup and structured load failures in the %s browser", async (language) => {
    vi.stubEnv("SEMANTIC_ATLAS_LANG", language === "en" ? "zh-CN" : "en");
    const repository = await trackedRepository(viewerDocument("Original business 商务"));
    const missingRepository = await createEmptyRepository();
    repositories.push(missingRepository);
    const server = await startLocalWebServer({ application: new LocalWebApplication(new MapApplication(), [repository, missingRepository]), port: 0 });
    servers.push(server);
    const html = await (await fetch(server.url)).text();
    const model = viewerModel(html);
    const fetchProject = vi.fn((url: string, options?: RequestInit) => fetch(new URL(url, server.url), options));
    const browser = openViewer(html, { languages: [language], language }, fetchProject);
    await vi.waitFor(() => expect(browser.element("#map-statistics").textContent)
      .toBe(language === "en" ? "3 concepts / 3 relationships" : "3 个概念 / 3 条关系"));
    expect(browser.translatedText("viewer.nodeKinds.operation")).toBe(language === "en" ? "operation" : "操作");
    expect(browser.translatedText("viewer.relationKinds.writes")).toBe(language === "en" ? "writes" : "写入");
    expect(browser.element("#project-view-host").innerHTML).toContain("Original business 商务");
    const errorResponse = await fetch(`${server.url}/api/projects/${model.projects[1].id}`);
    const errorEnvelope = await errorResponse.json();
    expect(errorEnvelope.error.messageKey).toBe("errors.projectMapMissing");
    browser.element("#project-select").value = model.projects[1].id;
    browser.element("#project-select").dispatch("change");
    await vi.waitFor(() => expect(browser.element("#viewer-status-title").textContent)
      .toBe(language === "en" ? "This project is unavailable" : "此项目不可用"));
    expect(browser.element("#viewer-status-message").textContent)
      .toBe(language === "en" ? getResources().en.translation.errors.projectMapMissing : getResources()["zh-CN"].translation.errors.projectMapMissing);
    expect(browser.element("#viewer-status-message").textContent).not.toBe(errorEnvelope.error.message);
    expect(fetchProject).toHaveBeenCalledTimes(2);
  });

  it("keeps every language resource and interpolation argument complete", () => {
    const resources = getResources();
    const english = flatten(resources.en.translation);
    for (const [language, resource] of Object.entries(resources)) {
      const translated = flatten(resource.translation);
      expect(Object.keys(translated).sort(), language).toEqual(Object.keys(english).sort());
      for (const [key, value] of Object.entries(translated)) {
        expect(value.trim(), `${language}:${key}`).not.toBe("");
        const argumentsOf = (text: string) => [...text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/gu)].map((match) => match[1]).sort();
        expect(argumentsOf(value), `${language}:${key}`).toEqual(argumentsOf(english[key]!));
      }
    }
  });

  it.each(["en", "zh-CN"])("explains relationship direction and flow branches in the %s browser", async (language) => {
    const repository = await trackedRepository(mapDocument());
    const exported = await renderRepository(repository, "en");
    for (const html of [exported, renderWebViewerPage([])]) {
      const browser = openViewer(html, { language });
      expect(browser.translatedText("viewer.legendHelp.relations.consumes"))
        .toContain(language === "en" ? "consumer to interface" : "消费者指向接口");
      expect(browser.translatedText("viewer.legendHelp.relations.part_of"))
        .toContain(language === "en" ? "parent to child, without an arrow" : "父概念连接到子概念，不带箭头");
      expect(browser.translatedText("viewer.legendHelp.flowDirection"))
        .toContain(language === "en" ? "branch condition" : "分支条件");
    }
  });
});

function flatten(value: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    return typeof item === "string" ? [[fullKey, item]] : Object.entries(flatten(item as Record<string, unknown>, fullKey));
  }));
}

function mapDocument(): TestMapDocument {
  return { schemaVersion: 1, map: { id: "commerce", title: "Commerce", summary: "Business" }, nodes: [node("commerce", "domain", "Original business 商务")], relations: [], flows: [] };
}

async function trackedRepository(document: TestMapDocument): Promise<string> {
  const repository = await createMapRepository({ "commerce.yaml": document });
  repositories.push(repository);
  return repository;
}

function viewerDocument(title: string): TestMapDocument {
  return {
    ...mapDocument(),
    nodes: [node("commerce", "domain", title), node("commerce.write", "operation", "All business $t(viewer.title) {{source}}"), node("commerce.order", "data", "Order")],
    relations: [relation("commerce.write", "part_of", "commerce"), relation("commerce.order", "part_of", "commerce"), { ...relation("commerce.write", "writes", "commerce.order"), summary: "Keep $t(viewer.title) and {{source}} literal" }],
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
  const text = html.match(/<script id="viewer-model" type="application\/json">([\s\S]*?)<\/script>/u)?.[1];
  expect(text).toBeDefined();
  return JSON.parse(text!);
}

// Parse actual emitted text/attribute bindings into DOM ports. Geometry remains covered by rendering tests.
function openViewer(
  html: string,
  navigator?: { readonly languages?: readonly string[]; readonly language?: string },
  fetchProject?: (url: string, options?: RequestInit) => Promise<Response>,
) {
  const elements = parseElements(html.replace(/<script[\s\S]*?<\/script>/gu, ""));
  const model = new BrowserElement("script", { id: "viewer-model" });
  model.textContent = JSON.stringify(viewerModel(html));
  elements.push(model);
  const element = (selector: string) => {
    const found = findElements(elements, selector)[0];
    if (!found) throw new Error(`Missing emitted Viewer element: ${selector}`);
    return found;
  };
  const documentElement = { lang: "en", getAttribute: () => "zh-CN" };
  const storage = vi.fn(() => "zh-CN");
  const document = {
    documentElement,
    cookie: "i18next=zh-CN",
    querySelector: element,
    querySelectorAll: (selector: string) => findElements(elements, selector),
    createElement: (tag: string) => new BrowserElement(tag),
    addEventListener: () => undefined,
    fonts: { ready: Promise.resolve() },
  };
  const runtime = createContext({
    document,
    ...(navigator ? { navigator } : {}),
    localStorage: { getItem: storage, setItem: storage, removeItem: storage },
    sessionStorage: { getItem: storage, setItem: storage, removeItem: storage },
    location: { search: "?lng=zh-CN", hash: "", pathname: "/zh-CN/", hostname: "zh-CN.example.test" },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (callback: () => void) => callback(),
    AbortController,
    fetch: fetchProject ?? vi.fn(() => { throw new Error("Offline Viewer attempted a request"); }),
  });
  runInContext("globalThis.window = globalThis", runtime);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)];
  expect(scripts).toHaveLength(1);
  runInContext(scripts[0]![1]!, runtime);
  const translatedText = (key: string) => {
    const current = [...element("#project-view-host").children, ...elements];
    const found = current.find((item) => item.getAttribute("data-i18n") === key);
    expect(found, `Missing emitted translation binding ${key}`).toBeDefined();
    return found?.textContent;
  };
  const translatedAttribute = (key: string, attribute: string) => {
    const current = [...element("#project-view-host").children, ...elements];
    const found = current.find((item) => item.getAttribute(`data-i18n-${attribute}`) === key);
    expect(found, `Missing emitted attribute binding ${key}`).toBeDefined();
    return found?.getAttribute(attribute);
  };
  const hasText = (value: string) => [...element("#project-view-host").children, ...elements].some((item) => item.textContent === value);
  return { runtime, element, translatedText, documentElement, storage, hasText, translatedAttribute };
}

class BrowserElement {
  textContent = "";
  value = "";
  hidden = false;
  disabled = false;
  children: BrowserElement[] = [];
  readonly dataset: Record<string, string> = {};
  private markup = "";
  private readonly listeners = new Map<string, (() => void)[]>();

  constructor(readonly tag: string, private readonly attributes: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith("data-")) this.dataset[key.slice(5).replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase())] = value;
    }
    this.value = attributes.value ?? "";
  }

  get options() { return this.children; }
  get innerHTML() { return this.markup; }
  set innerHTML(value: string) { this.markup = value; this.children = parseElements(value); }
  getAttribute(name: string) { return this.attributes[name] ?? null; }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  querySelector() { return null; }
  querySelectorAll(selector: string) { return findElements(this.children, selector); }
  replaceChildren(...children: BrowserElement[]) { this.children = children; }
  addEventListener(name: string, callback: () => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]);
  }
  dispatch(name: string) { for (const callback of this.listeners.get(name) ?? []) callback(); }
}

function parseElements(html: string): BrowserElement[] {
  return [...html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*?)(?:\/)?>/giu)].map((match) => {
    const attributes = Object.fromEntries([...match[2]!.matchAll(/([\w-]+)="([^"]*)"/gu)].map((attribute) => [attribute[1]!, decodeHtml(attribute[2]!)]));
    const element = new BrowserElement(match[1]!, attributes);
    element.textContent = decodeHtml(html.slice(match.index + match[0].length).split("<")[0]!);
    return element;
  });
}

function findElements(elements: readonly BrowserElement[], selector: string): BrowserElement[] {
  if (selector.startsWith("#")) return elements.filter((element) => element.getAttribute("id") === selector.slice(1));
  if (selector === "[data-project-view]") return []; // Geometry is outside this DOM port.
  if (selector === ".camera-controls button") return elements.filter((element) => ["zoom-in", "zoom-out", "fit", "reset-layout"].includes(element.getAttribute("data-action") ?? ""));
  const selectors = selector.split(",").map((item) => item.trim());
  return elements.filter((element) => selectors.some((item) => {
    const attribute = item.match(/^(?:([a-z]+))?\[([\w-]+)(?:="([^"]*)")?\]$/u);
    return attribute && (!attribute[1] || element.tag === attribute[1])
      && element.getAttribute(attribute[2]!) !== null
      && (attribute[3] === undefined || element.getAttribute(attribute[2]!) === attribute[3]);
  }));
}

function decodeHtml(value: string): string {
  return value.replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}
