import { describe, expect, it } from "vitest";
import { renderViewerBrowserScript } from "../../src/rendering/viewer-browser.js";
import { renderViewerPage, type ViewerProject } from "../../src/rendering/viewer-page.js";

describe("ViewerPage", () => {
  it("disambiguates duplicate project names without exposing repository paths", () => {
    const html = renderViewerPage([
      viewerProject("first", "repository"),
      viewerProject("second", "repository"),
    ], "web");

    expect(html).toContain(">repository (1)</option>");
    expect(html).toContain(">repository (2)</option>");
  });

  it("prevents map text selection and provides an on-demand detail surface", () => {
    const html = renderViewerPage([viewerProject("project", "repository")], "export");

    expect(html).toMatch(/\.map-viewport\s*\{[^}]*user-select:\s*none/gu);
    expect(html).toContain("-webkit-user-select: none");
    expect(html).toContain('id="node-details"');
    expect(html).toContain('aria-label="Close concept details"');
    expect(html).toContain('id="node-details-flows"');
    expect(html).toContain('aria-label="View type"');
  });

  it("renders relationship and flow surfaces in one shared Viewer", () => {
    const html = renderViewerPage([{
      ...viewerProject("project", "repository"),
      flows: [{
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
      }],
    }], "web");

    expect(html).toContain('data-view-type="relationships"');
    expect(html).toContain('data-view-type="flows"');
    expect(html).toContain('data-flow-view="commerce.checkout-flow"');
    expect(html).toContain("Checkout flow");
  });

  it("binds view switching only to controls rather than diagram surfaces", () => {
    const browserScript = renderViewerBrowserScript();
    const html = renderViewerPage([viewerProject("project", "repository")], "web");

    expect(browserScript).toContain('querySelectorAll("button[data-view-type]")');
    expect(html).toContain(".field[hidden] { display: none; }");
  });
});

function viewerProject(id: string, name: string): ViewerProject {
  return {
    id,
    name,
    views: [{
      id: "all",
      name: "All business",
      nodeCount: 0,
      relationCount: 0,
      nodes: [],
      svg: '<svg class="map-svg"></svg>',
    }],
    flows: [],
  };
}
