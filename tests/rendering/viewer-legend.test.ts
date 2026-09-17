import { describe, expect, it } from "vitest";
import { businessRelationKinds, businessFlowStepKinds } from "../../src/contracts/map.js";
import { renderViewerPage, renderWebViewerPage } from "../../src/rendering/viewer-page.js";

describe("Viewer legend", () => {
  it("explains every relationship and flow shape in the same offline and Web surface", () => {
    const legends = [renderViewerPage([]), renderWebViewerPage([])].map(
      (html) => html.match(/<details class="legend">([\s\S]*?)<\/details>/u)?.[1] ?? "",
    );
    expect(legends[0]).toBe(legends[1]);
    for (const legend of legends) {
      for (const relation of businessRelationKinds) {
        expect(legend).toContain(`data-legend-relation="${relation}"`);
      }
      for (const kind of businessFlowStepKinds) {
        expect(legend).toContain(`data-legend-step="${kind}"`);
      }
      expect(legend).toContain("consumer to interface");
      expect(legend).toContain("parent to child, without an arrow");
      expect(legend).toContain("outside the selected business domain");
      expect(legend).toContain("branch condition");
      expect(legend).toContain('tabindex="0"');
      expect(legend).toContain('aria-labelledby="legend-title"');
    }
  });
});
