import { describe, expect, it } from "vitest";
import { renderViewerBrowserScript } from "../../src/rendering/viewer-browser.js";
import {
  renderViewerPage,
  renderWebViewerPage,
  toViewerProjectPayload,
  type ViewerProject,
} from "../../src/rendering/viewer-page.js";

describe("流程阅读界面", () => {
  it("使用统一跳图与返回，并让节点详情默认关闭", () => {
    for (const html of [renderViewerPage([project()]), renderWebViewerPage([])]) {
      expect(html).toContain('id="diagram-select"');
      expect(html).toContain('id="back-button"');
      expect(html).toContain('id="flow-directory"');
      expect(html).toContain('id="child-flow-menu"');
      expect(html).toContain('aria-labelledby="node-details-title" hidden');
      expect(html).not.toContain("data-view-type=");
      expect(html).not.toContain('id="node-details-anchors"');
      expect(html).not.toContain('id="node-details-links"');
      expect(html).not.toContain('data-action="export-image"');
      expect(html).not.toContain("<script src=");
    }
    expect(() => new Function(renderViewerBrowserScript())).not.toThrow();
  });

  it("HTML导出和Web使用同一份流程与卡片内容", () => {
    const payload = toViewerProjectPayload(project());
    const html = renderViewerPage([project()]);
    expect(payload.project).not.toHaveProperty("views");
    expect(payload.project.navigation.roots).toEqual(["orders.intake"]);
    expect(payload.project.flows[0]!.nodes[0]!.name).toBe("接收订单");
    expect(payload.project.flows[0]).not.toHaveProperty("svg");
    expect(html).toContain(payload.markup);
    expect(html).toContain('class="diagram-world"');
    expect(html).toContain("选择订单后开始处理");
    expect(html).toContain("-webkit-user-select: text");
  });

  it("Web壳子按需加载，不预先嵌入项目图", () => {
    const references = [{ id: "orders", name: "订单", repositoryPath: "/private/local/orders" }];
    const html = renderWebViewerPage(references);
    expect(html).toContain('data-viewer-mode="web"');
    expect(html).toContain('"projectPayloads":[]');
    expect(html).not.toContain('class="flow-svg"');
    const model = JSON.parse(
      html.match(/<script id="viewer-model" type="application\/json">([\s\S]*?)<\/script>/u)![1]!,
    );
    expect(model.projects).toEqual([{ id: "orders", name: "订单" }]);
    expect(html).not.toContain("/private/local/orders");
  });

  it("对重复的项目名称编号，保留业务文本并转义脚本边界", () => {
    const html = renderViewerPage([
      { ...project(), id: "first", name: "订单" },
      { ...project(), id: "second", name: "订单" },
    ]);
    expect(html).toContain(">订单 (1)</option>");
    expect(html).toContain(">订单 (2)</option>");
    const escaped = renderViewerPage([
      { ...project(), name: '</script><script>alert("x")</script>' },
    ]);
    expect(escaped).not.toContain('</script><script>alert("x")</script>');
    expect(escaped).toContain("\\u003c/script>");
  });

  it("空项目目录提供本地注册方式", () => {
    const html = renderWebViewerPage([]);
    expect(html).toContain("No projects registered");
    expect(html).toContain("semantic-atlas project add");
    expect(html).toContain('aria-live="polite"');
  });
});

function project(): ViewerProject {
  return {
    id: "orders",
    name: "订单",
    navigation: {
      roots: ["orders.intake"],
      flows: [
        { id: "orders.intake", name: "处理订单", summary: "选择订单后开始处理", childFlows: [] },
      ],
    },
    flows: [
      {
        id: "orders.intake",
        name: "处理订单",
        summary: "选择订单后开始处理",
        nodes: [
          {
            id: "receive",
            kind: "action",
            name: "接收订单",
            summary: "读取购买请求",
            start: true,
            childFlows: [],
          },
        ],
        svg: '<svg class="flow-svg"></svg>',
        textLayer: '<article class="flow-card">选择订单后开始处理</article>',
        layout: { direction: "LR", nodes: [], edges: [] },
      },
    ],
  };
}
