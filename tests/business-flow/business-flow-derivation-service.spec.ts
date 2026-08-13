import { afterEach, describe, expect, it } from "vitest";

import { BusinessFlowDerivationService } from "../../src/business-flow/business-flow-derivation-service.js";
import { graphPatchV1Schema } from "../../src/contracts/graph.js";
import type { GraphPatchV1 } from "../../src/contracts/graph.js";
import type {
  StructuralIndexBackend,
  StructuralNode,
  StructuralRelation,
} from "../../src/structural-backend/types.js";
import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import {
  createGraphTestContext,
  type GraphTestContext,
} from "../graph/graph-fixture.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

describe("business flow derivation", () => {
  const contexts: GraphTestContext[] = [];
  const gitFixtures: GitFixture[] = [];

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
    await Promise.all(gitFixtures.splice(0).map((fixture) => fixture.cleanup()));
  });

  it("maps representative framework flows to one evidence-bound business patch", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const catalog = frameworkCatalog({ includeAmbiguousDataAccess: false });
    const service = new BusinessFlowDerivationService(
      context.repository,
      structuralBackend(catalog.nodes, catalog.relations),
    );

    const result = await service.derive({
      capability: {
        key: "commerce/orders",
        label: "Orders",
        summary: "Accepts, persists, publishes, and verifies customer orders.",
      },
      messageFlows: [{
        channel: "orders.created",
        producer: catalog.byName("publishCreated").reference,
        consumer: catalog.byName("handleCreated").reference,
      }],
      invariants: [{
        key: "commerce/orders/valid-order",
        label: "Valid order",
        summary: "Only valid orders can be persisted.",
        evidence: catalog.byName("assertValid").reference,
        constrains: [catalog.byQualifiedName("OrdersService::createOrder").reference],
      }],
    });

    const nodes = upsertedNodes(result.patch);
    expect(new Set(nodes.map((node) => node.kind))).toEqual(new Set([
      "Capability",
      "Scenario",
      "Operation",
      "Interface",
      "Data",
      "Invariant",
    ]));
    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "Interface", label: "POST /orders" }),
      expect.objectContaining({ kind: "Interface", label: "MUTATION createOrder" }),
      expect.objectContaining({ kind: "Data", label: "Order" }),
      expect.objectContaining({ kind: "Interface", label: "orders.created" }),
    ]));
    expect(nodes.every((node) => node.certainty !== "exact")).toBe(true);
    expect(nodes.every((node) => node.evidence.length > 0)).toBe(true);

    const relations = upsertedRelations(result.patch);
    expect(relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "consumes" }),
      expect.objectContaining({ type: "invokes" }),
      expect.objectContaining({ type: "writes" }),
      expect.objectContaining({ type: "publishes" }),
      expect.objectContaining({ type: "constrained_by" }),
      expect.objectContaining({
        type: "verified_by",
        to: expect.objectContaining(catalog.byName("creates an order").reference),
      }),
    ]));
    expect(relations.every((relation) => relation.certainty !== "exact")).toBe(true);
    expect(result.boundaries).toEqual([]);
    expect(graphPatchV1Schema.parse(result.patch)).toEqual(result.patch);
  });

  it("derives NestJS and GraphQL entry points from the real CodeGraph adapter", async () => {
    const fixture = await createGitFixture();
    gitFixtures.push(fixture);
    await fixture.write("package.json", JSON.stringify({
      type: "module",
      dependencies: {
        "@nestjs/common": "11.0.0",
        "@nestjs/graphql": "13.0.0",
        "@nestjs/bullmq": "11.0.0",
        "typeorm": "0.3.26",
      },
    }));
    await fixture.write("src/orders.controller.ts", [
      "import { Controller, Post } from '@nestjs/common';",
      "@Controller('orders')",
      "export class OrdersController {",
      "  @Post() create() { return true; }",
      "}",
      "",
    ].join("\n"));
    await fixture.write("src/orders.resolver.ts", [
      "import { Resolver, Mutation } from '@nestjs/graphql';",
      "@Resolver()",
      "export class OrdersResolver {",
      "  @Mutation() createOrder() { return true; }",
      "}",
      "",
    ].join("\n"));
    await fixture.write("src/order.entity.ts", [
      "import { Entity } from 'typeorm';",
      "@Entity()",
      "export class Order {}",
      "",
    ].join("\n"));
    await fixture.write("src/orders.processor.ts", [
      "import { Processor } from '@nestjs/bullmq';",
      "@Processor('orders')",
      "export class OrdersProcessor { handleCreated() { return true; } }",
      "",
    ].join("\n"));
    await fixture.write("src/report.processor.ts", [
      "export class ReportProcessor { reconcile() { return true; } }",
      "",
    ].join("\n"));
    await fixture.git("add", ".");
    await fixture.git("commit", "-m", "test: add framework fixture");
    const repository = await inspectGitRepository(fixture.directory);

    const world = await new (await import("../../src/world/world-model-service.js"))
      .WorldModelService(repository).build();
    expect(world.structural.completeness).toBe("complete");
    const result = await new BusinessFlowDerivationService(repository).derive({
      capability: {
        key: "commerce/orders",
        label: "Orders",
        summary: "Creates orders through HTTP and GraphQL.",
      },
    });

    expect(upsertedNodes(result.patch)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "Interface", label: "POST /orders" }),
      expect.objectContaining({ kind: "Interface", label: "MUTATION createOrder" }),
      expect.objectContaining({ kind: "Data", label: "Order" }),
    ]));
    expect(result.boundaries).toEqual([
      expect.objectContaining({
        framework: "bullmq",
        reason: expect.stringContaining("OrdersProcessor::handleCreated"),
      }),
    ]);
  });

  it("keeps dynamic queue wiring and unsupported data access as source-fallback boundaries", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const catalog = frameworkCatalog({ includeAmbiguousDataAccess: true });
    const service = new BusinessFlowDerivationService(
      context.repository,
      structuralBackend(catalog.nodes, catalog.relations),
    );

    const result = await service.derive({
      capability: {
        key: "commerce/orders",
        label: "Orders",
        summary: "Handles customer orders.",
      },
    });

    expect(result.boundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        framework: "bullmq",
        operation: "resolve_message_channel",
        resolution: "source_fallback",
        owner: expect.objectContaining(catalog.byName("publishCreated").reference),
      }),
      expect.objectContaining({
        framework: "bullmq",
        operation: "resolve_message_channel",
        resolution: "source_fallback",
        owner: expect.objectContaining(catalog.byName("handleCreated").reference),
      }),
      expect.objectContaining({
        framework: "typeorm",
        operation: "classify_data_access",
        resolution: "source_fallback",
        owner: expect.objectContaining(catalog.byName("executeCustomStatement").reference),
      }),
    ]));
    expect(upsertedRelations(result.patch)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "publishes" }),
    ]));
  });

  it("does not interpret persistence-shaped application methods as TypeORM access", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const entity = node("entity", "Order", "Order", "class", ["Entity"]);
    const operation = node("operation", "createOrder", "OrdersService::createOrder", "method");
    const ordinarySave = node("ordinary-save", "save", "DraftService::save", "method");
    const service = new BusinessFlowDerivationService(
      context.repository,
      structuralBackend(
        [entity, operation, ordinarySave],
        [relation(operation, ordinarySave, "calls")],
      ),
    );

    const result = await service.derive({
      capability: {
        key: "commerce/orders",
        label: "Orders",
        summary: "Handles customer orders.",
      },
    });

    const relationTypes = upsertedRelations(result.patch).map((relation) => relation.type);
    expect(relationTypes).not.toContain("reads");
    expect(relationTypes).not.toContain("writes");
    expect(result.boundaries).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ framework: "typeorm" }),
    ]));
  });

  it("does not attach repository access to an unrelated sole entity", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const entity = node("entity", "Order", "Order", "class", ["Entity"]);
    const operation = node("operation", "createOrder", "OrdersService::createOrder", "method");
    const customerSave = node("customer-save", "save", "Repository<Customer>::save", "method");
    const service = new BusinessFlowDerivationService(
      context.repository,
      structuralBackend(
        [entity, operation, customerSave],
        [relation(operation, customerSave, "calls")],
      ),
    );

    const result = await service.derive({
      capability: {
        key: "commerce/orders",
        label: "Orders",
        summary: "Handles customer orders.",
      },
    });

    expect(upsertedRelations(result.patch).map((item) => item.type)).not.toContain("writes");
    expect(result.boundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        framework: "typeorm",
        operation: "resolve_data_target",
        owner: expect.objectContaining(customerSave.reference),
      }),
    ]));
  });

  it("recognizes a class in a conventional TypeORM entity module", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const file = node("entity-file", "order.entity.ts", "src/order.entity.ts", "file");
    const typeOrmImport = node("typeorm-import", "typeorm", "typeorm", "import");
    const entity = node("entity", "Order", "Order", "class");
    const helper = node("helper", "OrderMapper", "OrderMapper", "class");
    const service = new BusinessFlowDerivationService(
      context.repository,
      structuralBackend(
        [file, typeOrmImport, entity, helper],
        [
          relation(file, typeOrmImport, "declares"),
          relation(file, entity, "declares"),
          relation(file, helper, "declares"),
        ],
      ),
    );

    const result = await service.derive({
      capability: {
        key: "commerce/orders",
        label: "Orders",
        summary: "Stores customer orders.",
      },
    });

    expect(upsertedNodes(result.patch)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "Data", label: "Order", certainty: "inferred" }),
    ]));
    expect(upsertedNodes(result.patch).filter((item) => item.kind === "Data"))
      .toHaveLength(1);
  });

  it("requires framework or agent-verified evidence for a capability", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const incidental = node("incidental", "formatter", "formatter", "variable");
    const service = new BusinessFlowDerivationService(
      context.repository,
      structuralBackend([incidental], []),
    );

    await expect(service.derive({
      capability: {
        key: "shared/formatting",
        label: "Formatting",
        summary: "Formats values.",
      },
    })).rejects.toThrow("requires framework or agent-verified evidence");

    const verified = await service.derive({
      capability: {
        key: "shared/formatting",
        label: "Formatting",
        summary: "Formats values.",
        evidence: incidental.reference,
      },
    });
    expect(upsertedNodes(verified.patch)).toEqual([
      expect.objectContaining({ kind: "Capability", key: "shared/formatting" }),
    ]);
  });

  it("leaves message-shaped application methods as structural context", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const route = node("route", "POST /documents", "POST /documents", "route");
    const handler = node("handler", "publish", "DocumentService::publish", "method");
    const service = new BusinessFlowDerivationService(
      context.repository,
      structuralBackend([route, handler], [relation(route, handler, "references")]),
    );

    const result = await service.derive({
      capability: {
        key: "documents/publishing",
        label: "Document publishing",
        summary: "Publishes documents through HTTP.",
      },
    });

    expect(result.boundaries).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ framework: "bullmq" }),
    ]));
  });

  it("recognizes a BullMQ processor owner with a framework import", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const bullMqImport = node("bullmq-import", "@nestjs/bullmq", "@nestjs/bullmq", "import");
    const consumer = node("consumer", "handleCreated", "OrdersProcessor::handleCreated", "method");
    const service = new BusinessFlowDerivationService(
      context.repository,
      structuralBackend([bullMqImport, consumer], []),
    );

    const result = await service.derive({
      capability: {
        key: "commerce/order-processing",
        label: "Order processing",
        summary: "Processes asynchronous order events.",
      },
    });

    expect(upsertedNodes(result.patch)).toEqual([
      expect.objectContaining({ kind: "Capability", key: "commerce/order-processing" }),
    ]);
    expect(result.boundaries).toEqual([
      expect.objectContaining({
        framework: "bullmq",
        operation: "resolve_message_channel",
        owner: expect.objectContaining(consumer.reference),
      }),
    ]);
  });
});

function frameworkCatalog(options: { readonly includeAmbiguousDataAccess: boolean }) {
  const nodes = [
    node("route-http", "POST /orders", "POST /orders", "route"),
    node("controller", "create", "OrdersController::create", "method"),
    node("route-graphql", "MUTATION createOrder", "MUTATION createOrder", "route"),
    node("resolver", "resolveCreateOrder", "OrdersResolver::resolveCreateOrder", "method"),
    node("service", "createOrder", "OrdersService::createOrder", "method"),
    node("repository-save", "save", "Repository<Order>::save", "method"),
    ...(options.includeAmbiguousDataAccess
      ? [node("repository-query", "executeCustomStatement", "Repository<Order>::executeCustomStatement", "method")]
      : []),
    node("entity", "Order", "Order", "class", ["Entity"]),
    node("producer", "publishCreated", "OrdersService::publishCreated", "method", ["InjectQueue"]),
    node("consumer", "handleCreated", "OrdersProcessor::handleCreated", "method", ["Processor"]),
    node("invariant", "assertValid", "OrdersService::assertValid", "method"),
    node("test", "creates an order", "OrdersService.spec::creates an order", "test"),
  ];
  const byName = (name: string): StructuralNode => {
    const matches = nodes.filter((candidate) => candidate.name === name);
    if (matches.length !== 1) {
      throw new Error(`Expected one fixture node named ${name}`);
    }
    return matches[0]!;
  };
  const byQualifiedName = (qualifiedName: string): StructuralNode => {
    const match = nodes.find((candidate) => candidate.qualifiedName === qualifiedName);
    if (match === undefined) {
      throw new Error(`Expected fixture node ${qualifiedName}`);
    }
    return match;
  };
  const relations = [
    relation(byName("POST /orders"), byName("create"), "references"),
    relation(byName("MUTATION createOrder"), byName("resolveCreateOrder"), "references"),
    relation(byName("create"), byQualifiedName("OrdersService::createOrder"), "calls"),
    relation(byName("resolveCreateOrder"), byQualifiedName("OrdersService::createOrder"), "calls"),
    relation(byQualifiedName("OrdersService::createOrder"), byName("save"), "calls"),
    ...(options.includeAmbiguousDataAccess
      ? [relation(byQualifiedName("OrdersService::createOrder"), byName("executeCustomStatement"), "calls")]
      : []),
    relation(byName("creates an order"), byQualifiedName("OrdersService::createOrder"), "calls"),
  ];
  return { nodes, relations, byName, byQualifiedName };
}

function node(
  id: string,
  name: string,
  qualifiedName: string,
  declarationKind: StructuralNode["declarationKind"],
  decorators: readonly string[] = [],
): StructuralNode {
  return {
    reference: {
      id: declarationKind === "test"
        ? `test:src/example.ts#${id}`
        : declarationKind === "file"
          ? `file:src/example.ts`
          : `symbol:src/example.ts#${id}`,
    },
    kind: declarationKind === "test" ? "Test" : declarationKind === "file" ? "File" : "Symbol",
    declarationKind,
    decorators,
    name,
    qualifiedName,
    path: "src/example.ts",
    language: "typescript",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 24 },
    },
    support: { status: "exact", provenance: "backend" },
  };
}

function relation(
  from: StructuralNode,
  to: StructuralNode,
  type: StructuralRelation["type"],
): StructuralRelation {
  return {
    from: from.reference,
    type,
    to: to.reference,
    support: { status: "exact", provenance: "backend" },
  };
}

function structuralBackend(
  nodes: readonly StructuralNode[],
  relations: readonly StructuralRelation[],
): StructuralIndexBackend {
  const byId = new Map(nodes.map((candidate) => [candidate.reference.id, candidate]));
  return {
    inspect: async () => { throw new Error("Not used"); },
    build: async () => { throw new Error("Not used"); },
    sync: async () => { throw new Error("Not used"); },
    listRoots: async () => [],
    readProjectGraph: async ({ declarationKinds }) => {
      const selectedNodes = nodes.filter((candidate) => (
        declarationKinds.includes(candidate.declarationKind)
      ));
      const selectedIds = new Set(selectedNodes.map((candidate) => candidate.reference.id));
      return {
        roots: [],
        nodes: selectedNodes,
        relations: relations.filter((candidate) => (
          selectedIds.has(candidate.from.id) && selectedIds.has(candidate.to.id)
        )),
        boundaries: [],
      };
    },
    search: async () => [],
    getNode: async ({ id }) => byId.get(id),
    traverse: async ({ reference, direction = "both" }) => {
      const adjacent = relations.filter((candidate) => (
        (direction !== "incoming" && candidate.from.id === reference.id)
        || (direction !== "outgoing" && candidate.to.id === reference.id)
      ));
      const adjacentNodes = adjacent.flatMap((candidate) => [
        byId.get(candidate.from.id),
        byId.get(candidate.to.id),
      ]).filter((candidate): candidate is StructuralNode => candidate !== undefined);
      return {
        roots: [reference],
        nodes: [...new Map(adjacentNodes.map((candidate) => [candidate.reference.id, candidate])).values()],
        relations: adjacent,
        boundaries: [],
      };
    },
    getCallers: async () => [],
    getCallees: async () => [],
    getFileDependencies: async () => [],
  };
}

function upsertedNodes(patch: GraphPatchV1) {
  return patch.nodeOperations.flatMap((operation) => (
    operation.op === "upsert" ? [operation.node] : []
  ));
}

function upsertedRelations(patch: GraphPatchV1) {
  return patch.relationOperations.flatMap((operation) => (
    operation.op === "upsert" ? [operation.relation] : []
  ));
}
