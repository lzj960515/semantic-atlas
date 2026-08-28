import { describe, expect, it } from "vitest";
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
  };
}
