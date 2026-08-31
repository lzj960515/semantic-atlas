import { describe, expect, it } from "vitest";
import type {
  BusinessFlow,
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
      flowCount: 1,
    });
    expect(first.content).toContain('data-node-id="commerce.orders"');
    expect(first.content).toContain(
      'data-relation-id="commerce.orders.checkout--part_of--commerce.orders"',
    );
    expect(first.content).toContain("Orders &amp; returns");
    expect(first.content).toContain("&lt;reliable&gt;");
    expect(first.content).not.toContain("<script>alert");
    expect(first.content).toContain('data-map-view="all"');
    expect(first.content).toContain('data-map-view="commerce"');
    expect(first.content).toContain('aria-label="Zoom in"');
    expect(first.content).toContain('data-flow-view="commerce.orders.checkout-flow"');
    expect(first.content).toContain('data-flow-step-id="payment-authorized"');
    expect(first.content).toContain("AUTHORIZED");
  });

  it("links relationship concepts to flows that reuse their business identities", () => {
    const graph = new BusinessGraph(validatedMap());

    const project = new MapProjector(graph).viewerProject({
      id: "repository",
      name: "Repository",
    });
    const checkout = project.views[0]?.nodes.find(({ id }) => id === "commerce.orders.checkout");

    expect(checkout?.relatedFlowIds).toEqual(["commerce.orders.checkout-flow"]);
    expect(project.flows).toMatchObject([{
      id: "commerce.orders.checkout-flow",
      scenario: {
        id: "commerce.orders.checkout",
        name: "Checkout",
      },
      stepCount: 4,
      transitionCount: 3,
    }]);
    expect(project.flows[0]?.svg).toContain('class="flow-step flow-step--decision"');
  });

  it("keeps navigation anchors in on-demand details rather than graph cards", () => {
    const graph = new BusinessGraph(validatedMap());

    const projection = new MapProjector(graph).project();
    const ordersCard = extractNodeMarkup(projection.content, "commerce.orders");

    expect(ordersCard).toContain('role="button"');
    expect(ordersCard).toContain('tabindex="0"');
    expect(ordersCard).not.toContain("NAVIGATION ANCHORS");
    expect(ordersCard).not.toContain("src/orders");
    expect(projection.content).toContain('id="node-details"');
    expect(projection.content).toContain("src/orders");
  });

  it("keeps directly connected external concepts visible in a domain view", () => {
    const graph = new BusinessGraph(crossDomainMap());

    const project = new MapProjector(graph).viewerProject({
      id: "repository",
      name: "Repository",
    });
    const commerce = project.views.find(({ id }) => id === "commerce");

    expect(commerce).toMatchObject({ nodeCount: 3, relationCount: 2 });
    expect(commerce?.svg).toContain('data-node-id="fulfillment.inventory"');
    expect(commerce?.svg).toContain('data-boundary="true"');
    expect(commerce?.svg).not.toContain('data-node-id="support.returns"');
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
        [{
          kind: "directory",
          value: "src/orders",
          description: "Current order implementation.",
        }],
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
    flows: [businessFlow()],
  };
}

function businessNode(
  id: string,
  kind: BusinessNode["kind"],
  name: string,
  summary: string,
  anchors: BusinessNode["anchors"] = [],
): BusinessNode {
  return {
    id,
    kind,
    name,
    summary,
    aliases: [],
    anchors,
    documentId: "commerce",
    documentPath: "docs/business-map/commerce.yaml",
  };
}

function extractNodeMarkup(projection: string, nodeId: string): string {
  const escapedNodeId = nodeId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = projection.match(new RegExp(
    `<g class="node-card[^>]*data-node-id="${escapedNodeId}"[\\s\\S]*?</g>`,
    "u",
  ));
  expect(match, `Expected rendered node ${nodeId}`).not.toBeNull();
  return match?.[0] ?? "";
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

function businessFlow(): BusinessFlow {
  return {
    id: "commerce.orders.checkout-flow",
    name: "Checkout decision",
    summary: "Creates an order only after payment is authorized.",
    scenario: "commerce.orders.checkout",
    startsAt: "receive-order",
    steps: [
      {
        id: "order-created",
        kind: "outcome",
        name: "Order created",
        summary: "The customer receives a confirmed order.",
      },
      {
        id: "payment-authorized",
        kind: "decision",
        name: "Is payment authorized?",
        summary: "Only authorized payment may create an order.",
      },
      {
        id: "payment-declined",
        kind: "outcome",
        name: "Order not created",
        summary: "Declined payment ends checkout without an order.",
      },
      {
        id: "receive-order",
        kind: "action",
        name: "Receive checkout request",
        summary: "Checkout begins from the customer request.",
        concept: "commerce.orders.checkout",
      },
    ],
    transitions: [
      { from: "payment-authorized", to: "order-created", when: "authorized" },
      { from: "payment-authorized", to: "payment-declined", when: "declined" },
      { from: "receive-order", to: "payment-authorized" },
    ],
    documentId: "commerce",
    documentPath: "docs/business-map/commerce.yaml",
  };
}

function crossDomainMap(): ValidatedBusinessMap {
  return {
    source: {
      root: "/repository",
      mapDirectory: "docs/business-map",
      documents: ["commerce.yaml", "fulfillment.yaml", "support.yaml"],
    },
    documents: [],
    nodes: [
      businessNode("commerce", "domain", "Commerce", "Customer commerce."),
      businessNode("commerce.checkout", "scenario", "Checkout", "Places an order."),
      businessNode("fulfillment", "domain", "Fulfillment", "Fulfills orders."),
      businessNode("fulfillment.inventory", "capability", "Inventory", "Reserves stock."),
      businessNode("support", "domain", "Support", "Supports customers."),
      businessNode("support.returns", "capability", "Returns", "Handles returns."),
    ],
    relations: [
      businessRelation("commerce.checkout", "part_of", "commerce"),
      businessRelation("fulfillment.inventory", "part_of", "fulfillment"),
      businessRelation("support.returns", "part_of", "support"),
      businessRelation("commerce.checkout", "invokes", "fulfillment.inventory"),
    ],
    flows: [],
  };
}
