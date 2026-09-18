import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { renderViewerBrowserScript } from "../../src/rendering/viewer-browser.js";
import {
  renderViewerPage,
  renderWebViewerPage,
  type ViewerProject,
} from "../../src/rendering/viewer-page.js";

describe("ViewerPage", () => {
  it("embeds the PNG exporter in both offline and Web Viewers without a network loader", () => {
    for (const html of [
      renderViewerPage([viewerProject("project", "repository")]),
      renderWebViewerPage([]),
    ]) {
      expect(html).toContain('data-action="export-image"');
      expect(html).toContain('id="export-status"');
    }
    const runtime = {
      document: { querySelector: () => null, querySelectorAll: () => [] },
    };
    const result = runInNewContext(
      `${renderViewerBrowserScript()}\n({
      rasterizer: typeof globalThis.htmlToImage.toBlob,
      renderer: typeof globalThis.__semanticAtlasDiagramImage.renderDiagramImage,
      plan: globalThis.__semanticAtlasDiagramImage.planDiagramImage({width: 960, height: 1504})
    })`,
      runtime,
    );
    expect(JSON.parse(JSON.stringify(result))).toEqual({
      rasterizer: "function",
      renderer: "function",
      plan: { width: 960, height: 1504, pixelWidth: 1920, pixelHeight: 3008 },
    });
  });

  it("disambiguates duplicate project names without exposing repository paths", () => {
    const html = renderWebViewerPage([
      viewerProject("first", "repository"),
      viewerProject("second", "repository"),
    ]);

    expect(html).toContain(">repository (1)</option>");
    expect(html).toContain(">repository (2)</option>");
  });

  it("exposes selectable HTML text beside SVG and retains on-demand details", () => {
    const html = renderViewerPage([viewerProject("project", "repository")]);

    expect(html).not.toMatch(/\.map-viewport\s*\{[^}]*user-select:\s*none/gu);
    expect(html).toContain("-webkit-user-select: text");
    expect(html).toContain('</svg>\n        <div class="diagram-text-layer">');
    expect(html).toContain("<p>Selectable business text</p>");
    expect(html).toContain('id="node-details"');
    expect(html).toContain('aria-label="Close concept details"');
    expect(html).toContain('id="node-details-flows"');
    expect(html).toContain('id="node-details-domain-link"');
    expect(html).toContain('aria-label="View type"');
  });

  it("renders relationship and flow surfaces in one shared Viewer", () => {
    const html = renderViewerPage([
      {
        ...viewerProject("project", "repository"),
        flows: [
          {
            id: "commerce.checkout-flow",
            name: "Checkout flow",
            summary: "Creates an order after payment authorization.",
            scenario: {
              id: "commerce.checkout",
              name: "Checkout",
            },
            stepCount: 1,
            transitionCount: 0,
            steps: [],
            svg: '<svg class="map-svg"></svg>',
            textLayer: "",
            layout: { direction: "TB", nodes: [], edges: [] },
          },
        ],
      },
    ]);

    expect(html).toContain('data-view-type="relationships"');
    expect(html).toContain('data-view-type="flows"');
    expect(html).toContain('data-flow-view="commerce.checkout-flow"');
    expect(html).toContain("Checkout flow");
  });

  it("binds view switching only to controls rather than diagram surfaces", () => {
    const browserScript = renderViewerBrowserScript();
    const html = renderViewerPage([viewerProject("project", "repository")]);

    expect(browserScript).toContain('querySelectorAll("button[data-view-type]")');
    expect(browserScript).not.toContain("__vite");
    expect(() => new Function(browserScript)).not.toThrow();
    expect(html).toContain(".field[hidden] { display: none; }");
  });

  it("renders a Web shell without embedding project maps", () => {
    const html = renderWebViewerPage([viewerProject("project", "repository")]);

    expect(html).toContain('data-viewer-mode="web"');
    expect(html).toContain('"projectPayloads":[]');
    expect(html).not.toContain('<svg class="map-svg"');
  });

  it("renders an actionable empty-project state", () => {
    const html = renderWebViewerPage([]);

    expect(html).toContain("No projects registered");
    expect(html).toContain("semantic-atlas project add");
    expect(html).toContain('aria-live="polite"');
  });
});

function viewerProject(id: string, name: string): ViewerProject {
  return {
    id,
    name,
    views: [
      {
        id: "all",
        name: "All business",
        nodeCount: 0,
        relationCount: 0,
        nodes: [],
        svg: '<svg class="map-svg"></svg>',
        textLayer: "<p>Selectable business text</p>",
        layout: { direction: "LR", nodes: [], edges: [] },
      },
    ],
    flows: [],
  };
}
