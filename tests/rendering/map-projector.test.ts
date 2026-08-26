import { describe, expect, it } from "vitest";
import type {
  BusinessNode,
  BusinessRelation,
  ValidatedBusinessMap,
} from "../../src/contracts/map.js";
import { BusinessGraph } from "../../src/map/business-graph.js";
import { MapProjector } from "../../src/rendering/map-projector.js";

describe("MapProjector", () => {
  it("projects stable graph identities and safely escaped business content", () => {
    const graph = new BusinessGraph(validatedMap());

    const first = new MapProjector(graph).project();
    const second = new MapProjector(graph).project();

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      format: "html",
      nodeCount: 3,
      relationCount: 2,
    });
    expect(first.content).toContain('data-node-id="commerce.orders"');
    expect(first.content).toContain(
      'data-relation-id="commerce.orders.checkout--part_of--commerce.orders"',
    );
    expect(first.content).toContain("Orders &amp; returns");
    expect(first.content).toContain("&lt;reliable&gt;");
    expect(first.content).not.toContain("<script>alert");
  });
});

function validatedMap(): ValidatedBusinessMap {
  return {
    source: {
      root: "/repository",
      mapDirectory: "docs/business-map",
      documents: ["commerce.yaml"],
    },
    documents: [],
    nodes: [
      businessNode("commerce", "domain", "Commerce", "Customer commerce."),
      businessNode(
        "commerce.orders",
        "capability",
        "Orders & returns",
        "Keeps orders <reliable>.",
      ),
      businessNode(
        "commerce.orders.checkout",
        "scenario",
        "Checkout",
        "Turns a cart into an order without <script>alert('x')</script> behavior.",
      ),
    ],
    relations: [
      businessRelation("commerce.orders", "part_of", "commerce"),
      businessRelation("commerce.orders.checkout", "part_of", "commerce.orders"),
    ],
  };
}

function businessNode(
  id: string,
  kind: BusinessNode["kind"],
  name: string,
  summary: string,
): BusinessNode {
  return {
    id,
    kind,
    name,
    summary,
    aliases: [],
    anchors: [],
    documentId: "commerce",
    documentPath: "docs/business-map/commerce.yaml",
  };
}

function businessRelation(
  from: string,
  type: BusinessRelation["type"],
  to: string,
): BusinessRelation {
  return {
    from,
    type,
    to,
    summary: `${from} ${type} ${to}.`,
    documentId: "commerce",
    documentPath: "docs/business-map/commerce.yaml",
  };
}
