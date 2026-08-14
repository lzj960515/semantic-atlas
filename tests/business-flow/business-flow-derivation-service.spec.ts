import { afterEach, describe, expect, it } from "vitest";

import { BusinessFlowDerivationService } from "../../src/business-flow/business-flow-derivation-service.js";
import type { BusinessFlowDerivationOptions } from "../../src/business-flow/types.js";
import { graphPatchV1Schema } from "../../src/contracts/graph.js";
import type { GraphPatchV1 } from "../../src/contracts/graph.js";
import { BusinessKnowledgeService } from "../../src/knowledge/business-knowledge-service.js";
import type {
  StructuralIndexBackend,
  StructuralNode,
  StructuralRelation,
  StructuralUnknownBoundary,
} from "../../src/structural-backend/types.js";
import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import type {
  StructuralEvidenceResolver,
  WorldWriteCoordinator,
} from "../../src/world/types.js";
import { WorldGraphQuery } from "../../src/world/world-graph-query.js";
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
        roots: [
          catalog.byName("POST /orders").reference,
          catalog.byName("MUTATION createOrder").reference,
          catalog.byName("Order").reference,
          catalog.byName("publishCreated").reference,
          catalog.byName("handleCreated").reference,
        ],
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
      verifications: [{
        operation: catalog.byQualifiedName("OrdersService::createOrder").reference,
        test: catalog.byName("creates an order").reference,
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
    expect(result.boundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        framework: "nestjs",
        operation: "resolve_called_operation",
        owner: expect.objectContaining(catalog.byName("create").reference),
        candidates: [catalog.byQualifiedName("OrdersService::createOrder").reference.id],
      }),
      expect.objectContaining({
        framework: "graphql",
        operation: "resolve_called_operation",
        owner: expect.objectContaining(catalog.byName("resolveCreateOrder").reference),
        candidates: [catalog.byQualifiedName("OrdersService::createOrder").reference.id],
      }),
    ]));
    expect(graphPatchV1Schema.parse(result.patch)).toEqual(result.patch);
  });

  it("keeps a BullMQ-only flow navigable from its capability", async () => {
    const catalog = frameworkCatalog({ includeAmbiguousDataAccess: false });
    await expectCapabilityNavigation(contexts, catalog, {
      capability: capabilityFor(catalog, ["publishCreated", "handleCreated"]),
      messageFlows: [{
        channel: "orders.created",
        producer: catalog.byName("publishCreated").reference,
        consumer: catalog.byName("handleCreated").reference,
        certainty: "exact",
      }],
    });
  });

  it("keeps a TypeORM-only flow navigable from its capability", async () => {
    const catalog = frameworkCatalog({ includeAmbiguousDataAccess: false });
    await expectCapabilityNavigation(contexts, catalog, {
      capability: capabilityFor(catalog, ["Order"], ["OrdersService::createOrder"]),
    });
  });

  it("keeps an invariant-only flow navigable from its capability", async () => {
    const catalog = frameworkCatalog({ includeAmbiguousDataAccess: false });
    await expectCapabilityNavigation(contexts, catalog, {
      capability: capabilityFor(catalog, ["assertValid"]),
      invariants: [{
        key: "commerce/orders/valid-order",
        label: "Valid order",
        summary: "Only valid orders can be persisted.",
        evidence: catalog.byName("assertValid").reference,
        constrains: [catalog.byQualifiedName("OrdersService::createOrder").reference],
      }],
    });
  });

  it("keeps a verification-only flow navigable from its capability", async () => {
    const catalog = frameworkCatalog({ includeAmbiguousDataAccess: false });
    await expectCapabilityNavigation(contexts, catalog, {
      capability: capabilityFor(catalog, [], ["OrdersService::createOrder"]),
      verifications: [{
        operation: catalog.byQualifiedName("OrdersService::createOrder").reference,
        test: catalog.byName("creates an order").reference,
      }],
    });
  });

  it("keeps unresolved injected service calls visible in real CodeGraph flows", async () => {
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
      "import { OrdersService } from './orders.service.js';",
      "@Controller('orders')",
      "export class OrdersController {",
      "  constructor(private readonly orders: OrdersService) {}",
      "  @Post() create() { return this.orders.create(); }",
      "}",
      "",
    ].join("\n"));
    await fixture.write("src/orders.resolver.ts", [
      "import { Resolver, Mutation } from '@nestjs/graphql';",
      "import { OrdersService } from './orders.service.js';",
      "@Resolver()",
      "export class OrdersResolver {",
      "  constructor(private readonly orders: OrdersService) {}",
      "  @Mutation() createOrder() { return this.orders.create(); }",
      "}",
      "",
    ].join("\n"));
    await fixture.write("src/orders.service.ts", [
      "import { Injectable } from '@nestjs/common';",
      "@Injectable()",
      "export class OrdersService {",
      "  create() { return true; }",
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
    const structural = new (await import("../../src/structural-backend/codegraph-backend.js"))
      .CodeGraphStructuralBackend(repository);
    const graph = await structural.readProjectGraph({
      declarationKinds: ["file", "import", "route", "class", "method", "function"],
    });
    const root = (name: string): StructuralNode["reference"] => {
      const matches = graph.nodes.filter((node) => node.name === name);
      if (matches.length !== 1) {
        throw new Error(`Expected one real framework root named ${name}`);
      }
      return matches[0]!.reference;
    };
    const rootAt = (path: string, name: string): StructuralNode["reference"] => {
      const matches = graph.nodes.filter((node) => node.path === path && node.name === name);
      if (matches.length !== 1) {
        throw new Error(`Expected one real framework root ${path}#${name}`);
      }
      return matches[0]!.reference;
    };
    const serviceOperation = rootAt("src/orders.service.ts", "create");
    const controllerOperation = rootAt("src/orders.controller.ts", "create");
    const resolverOperation = rootAt("src/orders.resolver.ts", "createOrder");
    const result = await new BusinessFlowDerivationService(repository, structural).derive({
      capability: {
        key: "commerce/orders",
        label: "Orders",
        summary: "Creates orders through HTTP and GraphQL.",
        roots: [
          root("POST /orders"),
          root("MUTATION createOrder"),
          controllerOperation,
          serviceOperation,
          root("Order"),
          root("handleCreated"),
        ],
      },
    });

    expect(upsertedNodes(result.patch)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "Interface", label: "POST /orders" }),
      expect.objectContaining({ kind: "Interface", label: "MUTATION createOrder" }),
      expect.objectContaining({ kind: "Data", label: "Order" }),
    ]));
    expect(result.boundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        framework: "bullmq",
        reason: expect.stringContaining("OrdersProcessor::handleCreated"),
      }),
    ]));
    const controllerBusinessOperation = realizedBusinessOperation(result.patch, controllerOperation);
    const resolverBusinessOperation = realizedBusinessOperation(result.patch, resolverOperation);
    expect(upsertedRelations(result.patch)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: resolverBusinessOperation,
        type: "invokes",
        to: controllerBusinessOperation,
      }),
    ]));
    expect(result.boundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        framework: "nestjs",
        operation: "resolve_called_operation",
        owner: expect.objectContaining(controllerOperation),
        candidates: [serviceOperation.id],
      }),
      expect.objectContaining({
        framework: "graphql",
        operation: "resolve_called_operation",
        owner: expect.objectContaining(resolverOperation),
        candidates: [controllerOperation.id, serviceOperation.id].sort(),
      }),
    ]));
  });

  it("does not trust a rooted same-name target across multiple injected services", async () => {
    const probe = await deriveRealGraphqlFixture(gitFixtures, {
      "src/orders.resolver.ts": [
        "import { Resolver, Mutation } from '@nestjs/graphql';",
        "import { OrdersService } from './orders.service.js';",
        "import { AuditService } from './audit.service.js';",
        "@Resolver()",
        "export class OrdersResolver {",
        "  constructor(",
        "    private readonly orders: OrdersService,",
        "    private readonly audit: AuditService,",
        "  ) {}",
        "  @Mutation() createOrder() { return this.orders.create(); }",
        "}",
        "",
      ],
      "src/orders.service.ts": [
        "export class OrdersService { create() { return 'order'; } }",
        "",
      ],
      "src/audit.service.ts": [
        "export class AuditService { create() { return 'audit'; } }",
        "",
      ],
    }, [
      { path: "src/orders.resolver.ts", name: "MUTATION createOrder" },
      { path: "src/audit.service.ts", name: "create" },
    ]);
    const resolver = probe.referenceAt("src/orders.resolver.ts", "createOrder");
    const audit = probe.referenceAt("src/audit.service.ts", "create");
    const orders = probe.referenceAt("src/orders.service.ts", "create");
    expect(probe.exactCallTarget(resolver)).toEqual(audit);

    const resolverBusiness = realizedBusinessOperation(probe.result.patch, resolver);
    expect(operationInvocationsFrom(probe.result.patch, resolverBusiness.key)).toEqual([]);
    expect(probe.result.boundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        framework: "graphql",
        operation: "resolve_called_operation",
        owner: expect.objectContaining(resolver),
        candidates: [audit.id],
      }),
    ]));
    expect(probe.result.boundaries.flatMap((boundary) => boundary.candidates)).not.toContain(orders.id);
  });

  it("does not trust a same-owner method as an injected call receiver", async () => {
    const probe = await deriveRealGraphqlFixture(gitFixtures, {
      "src/orders.resolver.ts": [
        "import { Resolver, Mutation } from '@nestjs/graphql';",
        "import { OrdersService } from './orders.service.js';",
        "@Resolver()",
        "export class OrdersResolver {",
        "  constructor(private readonly orders: OrdersService) {}",
        "  create() { return 'resolver'; }",
        "  @Mutation() createOrder() { return this.orders.create(); }",
        "}",
        "",
      ],
      "src/orders.service.ts": [
        "export class OrdersService { create() { return 'order'; } }",
        "",
      ],
    }, [
      { path: "src/orders.resolver.ts", name: "MUTATION createOrder" },
      { path: "src/orders.resolver.ts", name: "create" },
    ]);
    const resolver = probe.referenceAt("src/orders.resolver.ts", "createOrder");
    const decoy = probe.referenceAt("src/orders.resolver.ts", "create");
    expect(probe.exactCallTarget(resolver)).toEqual(decoy);

    const resolverBusiness = realizedBusinessOperation(probe.result.patch, resolver);
    expect(operationInvocationsFrom(probe.result.patch, resolverBusiness.key)).toEqual([]);
    expect(probe.result.boundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        framework: "graphql",
        operation: "resolve_called_operation",
        owner: expect.objectContaining(resolver),
        candidates: [decoy.id],
      }),
    ]));
  });

  it("preserves real TypeORM repository reads and writes as source fallbacks", async () => {
    const fixture = await createGitFixture();
    gitFixtures.push(fixture);
    await fixture.write("package.json", JSON.stringify({
      type: "module",
      dependencies: { typeorm: "0.3.26" },
    }));
    await fixture.write("src/order.entity.ts", [
      "import { Entity } from 'typeorm';",
      "@Entity()",
      "export class Order {}",
      "",
    ].join("\n"));
    await fixture.write("src/orders.service.ts", [
      "import type { Repository } from 'typeorm';",
      "import type { Order } from './order.entity.js';",
      "export class OrdersService {",
      "  constructor(private readonly orders: Repository<Order>) {}",
      "  async create(order: Order) { return this.orders.save(order); }",
      "  async list() { return this.orders.find(); }",
      "}",
      "",
    ].join("\n"));
    await fixture.git("add", ".");
    await fixture.git("commit", "-m", "test: add TypeORM repository fixture");
    const repository = await inspectGitRepository(fixture.directory);
    const world = await new (await import("../../src/world/world-model-service.js"))
      .WorldModelService(repository).build();
    expect(world.structural.completeness).toBe("complete");
    const structural = new (await import("../../src/structural-backend/codegraph-backend.js"))
      .CodeGraphStructuralBackend(repository);
    const graph = await structural.readProjectGraph({
      declarationKinds: ["file", "import", "class", "method"],
    });
    const root = (name: string): StructuralNode["reference"] => {
      const matches = graph.nodes.filter((node) => node.name === name);
      if (matches.length !== 1) {
        throw new Error(`Expected one real TypeORM root named ${name}`);
      }
      return matches[0]!.reference;
    };

    const result = await new BusinessFlowDerivationService(repository, structural).derive({
      capability: {
        key: "commerce/orders",
        label: "Orders",
        summary: "Persists and reads customer orders.",
        roots: [root("Order"), root("create"), root("list")],
      },
    });

    expect(upsertedNodes(result.patch)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "Data", label: "Order" }),
    ]));
    expect(result.boundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        framework: "typeorm",
        operation: "resolve_repository_access",
        reason: expect.stringContaining("save"),
        owner: expect.objectContaining(root("create")),
      }),
      expect.objectContaining({
        framework: "typeorm",
        operation: "resolve_repository_access",
        reason: expect.stringContaining("find"),
        owner: expect.objectContaining(root("list")),
      }),
    ]));
    expect(upsertedRelations(result.patch).map((relation) => relation.type))
      .not.toEqual(expect.arrayContaining(["reads", "writes"]));
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
        roots: [
          catalog.byName("POST /orders").reference,
          catalog.byName("MUTATION createOrder").reference,
          catalog.byName("Order").reference,
          catalog.byName("publishCreated").reference,
          catalog.byName("handleCreated").reference,
        ],
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

  it("derives only framework anchors owned by the requested capability root", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const ordersRoute = nodeAt(
      "orders-route",
      "POST /orders",
      "POST /orders",
      "route",
      "src/example.ts",
    );
    const ordersHandler = nodeAt(
      "orders-handler",
      "create",
      "OrdersController::create",
      "method",
      "src/example.ts",
    );
    const billingRoute = nodeAt(
      "billing-route",
      "POST /billing",
      "POST /billing",
      "route",
      "src/example.ts",
    );
    const billingHandler = nodeAt(
      "billing-handler",
      "charge",
      "BillingController::charge",
      "method",
      "src/example.ts",
    );
    const service = new BusinessFlowDerivationService(
      context.repository,
      structuralBackend(
        [ordersRoute, ordersHandler, billingRoute, billingHandler],
        [
          relation(ordersRoute, ordersHandler, "references"),
          relation(billingRoute, billingHandler, "references"),
        ],
      ),
    );

    const result = await service.derive({
      capability: {
        key: "commerce/orders",
        label: "Orders",
        summary: "Accepts customer orders.",
        roots: [ordersRoute.reference],
      },
    });

    expect(upsertedNodes(result.patch)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "Interface", label: "POST /orders" }),
    ]));
    expect(upsertedNodes(result.patch)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "POST /billing" }),
      expect.objectContaining({ label: "charge" }),
    ]));
  });

  it("keeps unresolved TypeORM repository calls as owner-linked source fallbacks", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const entity = nodeAt(
      "entity",
      "Order",
      "Order",
      "class",
      "src/example.ts",
      ["Entity"],
    );
    const operation = nodeAt(
      "operation",
      "createOrder",
      "OrdersService::createOrder",
      "method",
      "src/example.ts",
    );
    const typeOrmImport = nodeAt(
      "typeorm-import",
      "typeorm",
      "typeorm",
      "import",
      "src/example.ts",
    );
    const repositoryReference = unresolvedBoundary(
      "repository-type",
      operation,
      "references",
      "Repository",
    );
    const saveCall = unresolvedBoundary("save-call", operation, "calls", "save");
    const service = new BusinessFlowDerivationService(
      context.repository,
      structuralBackend(
        [entity, operation, typeOrmImport],
        [],
        [repositoryReference, saveCall],
      ),
    );

    const result = await service.derive({
      capability: {
        key: "commerce/orders",
        label: "Orders",
        summary: "Persists customer orders.",
        roots: [operation.reference, entity.reference],
      },
    });

    expect(result.boundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        framework: "typeorm",
        operation: "resolve_repository_access",
        owner: expect.objectContaining(operation.reference),
        reason: expect.stringContaining("save"),
      }),
    ]));
    expect(upsertedRelations(result.patch).map((item) => item.type)).not.toContain("writes");
  });

  it("does not promote serialization, logging, or utility callees into business operations", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const route = node("route", "POST /orders", "POST /orders", "route");
    const handler = node("handler", "create", "OrdersController::create", "method");
    const handlerOwner = node("handler-owner", "OrdersController", "OrdersController", "class");
    const handlerConstructor = node(
      "handler-constructor",
      "constructor",
      "OrdersController::constructor",
      "method",
    );
    const serviceOperation = node(
      "service-operation",
      "createOrder",
      "OrdersService::createOrder",
      "method",
    );
    const serviceOwner = node("service-owner", "OrdersService", "OrdersService", "class", ["Injectable"]);
    const serialize = node("serialize", "serializeResponse", "serializeResponse", "function");
    const log = node("log", "logRequest", "logRequest", "function");
    const utility = node("utility", "cloneValue", "cloneValue", "function");
    const serviceSerializer = node(
      "service-serializer",
      "serializeOrder",
      "OrdersService::serializeOrder",
      "method",
    );
    const structural = structuralBackend(
      [
        route,
        handlerOwner,
        handlerConstructor,
        handler,
        serviceOwner,
        serviceOperation,
        serviceSerializer,
        serialize,
        log,
        utility,
      ],
      [
        relation(route, handler, "references"),
        relation(handlerOwner, handlerConstructor, "contains"),
        relation(handlerOwner, handler, "contains"),
        relation(handlerConstructor, serviceOwner, "references"),
        relation(handler, serviceOperation, "calls"),
        relation(serviceOwner, serviceOperation, "contains"),
        relation(serviceOwner, serviceSerializer, "contains"),
        relation(handler, serviceSerializer, "calls"),
        relation(handler, serialize, "calls"),
        relation(handler, log, "calls"),
        relation(handler, utility, "calls"),
      ],
    );

    const result = await new BusinessFlowDerivationService(context.repository, structural).derive({
      capability: {
        key: "commerce/orders",
        label: "Orders",
        summary: "Accepts customer orders.",
        roots: [route.reference, serviceOperation.reference],
      },
    });

    expect(result.boundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        framework: "nestjs",
        operation: "resolve_called_operation",
        owner: expect.objectContaining(handler.reference),
        candidates: [serviceOperation.reference.id],
      }),
    ]));
    for (const incidental of [
      "createOrder",
      "serializeResponse",
      "logRequest",
      "cloneValue",
      "serializeOrder",
    ]) {
      expect(upsertedNodes(result.patch)).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "Operation", label: incidental }),
      ]));
    }
  });

  it("does not trust a same-file function as an injected call target", async () => {
    const probe = await deriveRealGraphqlFixture(gitFixtures, {
      "src/orders.resolver.ts": [
        "import { Resolver, Mutation } from '@nestjs/graphql';",
        "import { OrdersService } from './orders.service.js';",
        "export function create() { return 'same-file decoy'; }",
        "@Resolver()",
        "export class OrdersResolver {",
        "  constructor(private readonly orders: OrdersService) {}",
        "  @Mutation() createOrder() { return this.orders.create(); }",
        "}",
        "",
      ],
      "src/orders.service.ts": [
        "export class OrdersService { create() { return 'order'; } }",
        "",
      ],
    }, [
      { path: "src/orders.resolver.ts", name: "MUTATION createOrder" },
      { path: "src/orders.resolver.ts", name: "create" },
      { path: "src/orders.service.ts", name: "create" },
    ]);
    const resolver = probe.referenceAt("src/orders.resolver.ts", "createOrder");
    const decoy = probe.referenceAt("src/orders.resolver.ts", "create");
    const service = probe.referenceAt("src/orders.service.ts", "create");
    expect(probe.exactCallTarget(resolver)).toEqual(decoy);

    const resolverBusiness = realizedBusinessOperation(probe.result.patch, resolver);
    expect(operationInvocationsFrom(probe.result.patch, resolverBusiness.key)).toEqual([]);
    expect(probe.result.boundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        framework: "graphql",
        operation: "resolve_called_operation",
        owner: expect.objectContaining(resolver),
        candidates: [decoy.id, service.id].sort(),
      }),
    ]));
  });

  it("does not trust an imported function as an injected call target", async () => {
    const probe = await deriveRealGraphqlFixture(gitFixtures, {
      "src/orders.resolver.ts": [
        "import { Resolver, Mutation } from '@nestjs/graphql';",
        "import { OrdersService } from './orders.service.js';",
        "import { create } from './create.js';",
        "@Resolver()",
        "export class OrdersResolver {",
        "  constructor(private readonly orders: OrdersService) {}",
        "  @Mutation() createOrder() { return this.orders.create(); }",
        "}",
        "",
      ],
      "src/create.ts": [
        "export function create() { return 'imported decoy'; }",
        "",
      ],
      "src/orders.service.ts": [
        "export class OrdersService { create() { return 'order'; } }",
        "",
      ],
    }, [
      { path: "src/orders.resolver.ts", name: "MUTATION createOrder" },
      { path: "src/create.ts", name: "create" },
      { path: "src/orders.service.ts", name: "create" },
    ]);
    const resolver = probe.referenceAt("src/orders.resolver.ts", "createOrder");
    const decoy = probe.referenceAt("src/create.ts", "create");
    const service = probe.referenceAt("src/orders.service.ts", "create");
    expect(probe.exactCallTarget(resolver)).toEqual(decoy);

    const resolverBusiness = realizedBusinessOperation(probe.result.patch, resolver);
    expect(operationInvocationsFrom(probe.result.patch, resolverBusiness.key)).toEqual([]);
    expect(probe.result.boundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        framework: "graphql",
        operation: "resolve_called_operation",
        owner: expect.objectContaining(resolver),
        candidates: [decoy.id, service.id].sort(),
      }),
    ]));
  });

  it("emits verification only for agent-verified test evidence", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const route = node("route", "POST /orders", "POST /orders", "route");
    const operation = node("operation", "create", "OrdersController::create", "method");
    const support = nodeAt(
      "support",
      "seedForDemo",
      "seedForDemo",
      "function",
      "src/example.ts",
    );
    const fixture = nodeAt(
      "fixture",
      "createFixture",
      "createFixture",
      "function",
      "src/example.ts",
    );
    const hook = nodeAt(
      "hook",
      "prepareOrder",
      "prepareOrder",
      "function",
      "src/example.ts",
    );
    const testCase = nodeAt(
      "test-case",
      "creates an order",
      "orders suite::creates an order",
      "function",
      "src/example.ts",
    );
    const structural = structuralBackend(
      [route, operation, support, fixture, hook, testCase],
      [
        relation(route, operation, "references"),
        relation(support, operation, "calls"),
        relation(fixture, operation, "calls"),
        relation(hook, operation, "calls"),
        relation(testCase, operation, "calls"),
      ],
    );
    const service = new BusinessFlowDerivationService(context.repository, structural);
    const options = {
      capability: {
        key: "commerce/orders",
        label: "Orders",
        summary: "Accepts customer orders.",
        roots: [route.reference],
      },
    } as const;

    const unverified = await service.derive(options);
    expect(upsertedRelations(unverified.patch).map((relation) => relation.type))
      .not.toContain("verified_by");

    const verified = await service.derive({
      ...options,
      verifications: [{ operation: operation.reference, test: testCase.reference }],
    });
    expect(upsertedRelations(verified.patch)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "verified_by",
        to: expect.objectContaining(testCase.reference),
      }),
    ]));
    for (const incidental of [support, fixture, hook]) {
      expect(upsertedRelations(verified.patch)).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "verified_by", to: incidental.reference }),
      ]));
    }
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
        roots: [operation.reference, entity.reference],
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
        roots: [operation.reference, entity.reference],
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
        roots: [entity.reference],
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
        roots: [],
      },
    })).rejects.toThrow("requires at least one capability root");

    const verified = await service.derive({
      capability: {
        key: "shared/formatting",
        label: "Formatting",
        summary: "Formats values.",
        roots: [incidental.reference],
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
        roots: [route.reference],
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
        roots: [consumer.reference],
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
  const controllerOwner = node("controller-owner", "OrdersController", "OrdersController", "class");
  const controllerConstructor = node(
    "controller-constructor",
    "constructor",
    "OrdersController::constructor",
    "method",
  );
  const resolverOwner = node("resolver-owner", "OrdersResolver", "OrdersResolver", "class");
  const resolverConstructor = node(
    "resolver-constructor",
    "constructor",
    "OrdersResolver::constructor",
    "method",
  );
  const serviceOwner = node("service-owner", "OrdersService", "OrdersService", "class", ["Injectable"]);
  const nodes = [
    node("route-http", "POST /orders", "POST /orders", "route"),
    controllerOwner,
    controllerConstructor,
    node("controller", "create", "OrdersController::create", "method"),
    node("route-graphql", "MUTATION createOrder", "MUTATION createOrder", "route"),
    resolverOwner,
    resolverConstructor,
    node("resolver", "resolveCreateOrder", "OrdersResolver::resolveCreateOrder", "method"),
    serviceOwner,
    node("service", "createOrder", "OrdersService::createOrder", "method"),
    node("repository-save", "save", "Repository<Order>::save", "method"),
    ...(options.includeAmbiguousDataAccess
      ? [node("repository-query", "executeCustomStatement", "Repository<Order>::executeCustomStatement", "method")]
      : []),
    node("entity", "Order", "Order", "class", ["Entity"]),
    node("producer", "publishCreated", "OrdersService::publishCreated", "method", ["InjectQueue"]),
    node("consumer", "handleCreated", "OrdersProcessor::handleCreated", "method", ["Processor"]),
    node("invariant", "assertValid", "OrdersService::assertValid", "method"),
    node("test", "creates an order", "OrdersService.spec::creates an order", "function"),
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
    relation(controllerOwner, controllerConstructor, "contains"),
    relation(controllerOwner, byName("create"), "contains"),
    relation(controllerConstructor, serviceOwner, "references"),
    relation(resolverOwner, resolverConstructor, "contains"),
    relation(resolverOwner, byName("resolveCreateOrder"), "contains"),
    relation(resolverConstructor, serviceOwner, "references"),
    relation(serviceOwner, byQualifiedName("OrdersService::createOrder"), "contains"),
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
  return nodeAt(id, name, qualifiedName, declarationKind, "src/example.ts", decorators);
}

function nodeAt(
  id: string,
  name: string,
  qualifiedName: string,
  declarationKind: StructuralNode["declarationKind"],
  path: string,
  decorators: readonly string[] = [],
): StructuralNode {
  return {
    reference: {
      id: declarationKind === "test"
        ? `test:${path}#${id}`
        : declarationKind === "file"
          ? `file:${path}`
          : `symbol:${path}#${id}`,
    },
    kind: declarationKind === "test" ? "Test" : declarationKind === "file" ? "File" : "Symbol",
    declarationKind,
    decorators,
    name,
    qualifiedName,
    path,
    language: "typescript",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 24 },
    },
    support: { status: "exact", provenance: "backend" },
  };
}

function unresolvedBoundary(
  id: string,
  owner: StructuralNode,
  operation: string,
  target: string,
): StructuralUnknownBoundary {
  return {
    reference: { id: `unknown:${id}` },
    kind: "UnknownBoundary",
    owner: owner.reference,
    operation,
    target,
    reason: `The structural backend could not resolve ${target}.`,
    path: owner.path,
    position: owner.range.start,
    candidates: [],
    support: { status: "unresolved", provenance: "backend" },
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
  boundaries: readonly StructuralUnknownBoundary[] = [],
): StructuralIndexBackend & WorldWriteCoordinator {
  const byId = new Map(nodes.map((candidate) => [candidate.reference.id, candidate]));
  const state = {
    completeness: "complete" as const,
    databasePath: "/fixture/.atlas/codegraph.db",
    backendVersion: "1.5.0",
    extractionVersion: 1,
    indexedAt: "2026-08-14T00:00:00.000Z",
    diagnostics: [],
  };
  const resolver: StructuralEvidenceResolver = {
    getNode: (id) => byId.get(id),
    findCandidates: (locator) => nodes.filter((candidate) => (
      candidate.path === locator.file
      && (locator.qualifiedSymbol === null || candidate.qualifiedName === locator.qualifiedSymbol)
      && (locator.structuralKind === null || candidate.kind === locator.structuralKind)
    )),
    backendLocator: (candidate) => `backend:${candidate.reference.id}`,
  };
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
        boundaries: boundaries.filter((boundary) => selectedIds.has(boundary.owner.id)),
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
    withWorldWriteLock: async (operation) => operation(state, resolver),
  };
}

async function expectCapabilityNavigation(
  contexts: GraphTestContext[],
  catalog: ReturnType<typeof frameworkCatalog>,
  options: BusinessFlowDerivationOptions,
): Promise<void> {
  const context = await createGraphTestContext();
  contexts.push(context);
  const structural = structuralBackend(catalog.nodes, catalog.relations);
  const result = await new BusinessFlowDerivationService(context.repository, structural)
    .derive(options);
  await new BusinessKnowledgeService(context.repository, context.graph, structural)
    .learn(result.patch);

  using query = new WorldGraphQuery(context.repository, context.graph, structural);
  const capability = { domain: "business" as const, key: options.capability.key };
  await expect(query.roots()).resolves.toEqual([
    expect.objectContaining(capability),
  ]);

  const expectedChildren = upsertedNodes(result.patch)
    .filter((node) => node.kind !== "Capability")
    .map((node) => node.key)
    .sort();
  const children = await query.children(capability);
  expect(children.flatMap((node) => (
    node.domain === "business" ? [node.key] : []
  )).sort()).toEqual(expectedChildren);
  expect(upsertedRelations(result.patch).filter((relation) => (
    relation.type === "part_of"
  )).every((relation) => relation.certainty !== "exact")).toBe(true);

  const view = await query.show(capability, { maxDepth: 3 });
  expect(view).toBeDefined();
  expect(view?.neighbors.flatMap(({ node }) => (
    node.domain === "business" ? [node.key] : []
  ))).toEqual(expect.arrayContaining(expectedChildren));
}

function capabilityFor(
  catalog: ReturnType<typeof frameworkCatalog>,
  names: readonly string[],
  qualifiedNames: readonly string[] = [],
): BusinessFlowDerivationOptions["capability"] {
  return {
    key: "commerce/orders",
    label: "Orders",
    summary: "Owns the derived order flow.",
    roots: [
      ...names.map((name) => catalog.byName(name).reference),
      ...qualifiedNames.map((name) => catalog.byQualifiedName(name).reference),
    ],
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

function operationInvocationsFrom(patch: GraphPatchV1, operationKey: string) {
  return upsertedRelations(patch).filter((relation) => (
    relation.type === "invokes" && relation.from.key === operationKey
  ));
}

async function deriveRealGraphqlFixture(
  fixtures: GitFixture[],
  files: Readonly<Record<string, readonly string[]>>,
  roots: readonly { readonly path: string; readonly name: string }[],
) {
  const fixture = await createGitFixture();
  fixtures.push(fixture);
  await fixture.write("package.json", JSON.stringify({
    type: "module",
    dependencies: { "@nestjs/graphql": "13.0.0" },
  }));
  for (const [path, lines] of Object.entries(files)) {
    await fixture.write(path, lines.join("\n"));
  }
  await fixture.git("add", ".");
  await fixture.git("commit", "-m", "test: add GraphQL receiver fixture");
  const repository = await inspectGitRepository(fixture.directory);
  const world = await new (await import("../../src/world/world-model-service.js"))
    .WorldModelService(repository).build();
  expect(world.structural.completeness).toBe("complete");
  const structural = new (await import("../../src/structural-backend/codegraph-backend.js"))
    .CodeGraphStructuralBackend(repository);
  const graph = await structural.readProjectGraph({
    declarationKinds: ["file", "import", "route", "class", "method", "function"],
  });
  const referenceAt = (path: string, name: string): StructuralNode["reference"] => {
    const matches = graph.nodes.filter((node) => node.path === path && node.name === name);
    if (matches.length !== 1) {
      throw new Error(`Expected one real GraphQL reference ${path}#${name}`);
    }
    return matches[0]!.reference;
  };
  const exactCallTarget = (owner: StructuralNode["reference"]): StructuralNode["reference"] => {
    const calls = graph.relations.filter((relation) => (
      relation.from.id === owner.id
      && relation.type === "calls"
      && relation.support.status === "exact"
    ));
    if (calls.length !== 1) {
      throw new Error(`Expected one exact call from ${owner.id}`);
    }
    return calls[0]!.to;
  };
  const result = await new BusinessFlowDerivationService(repository, structural).derive({
    capability: {
      key: "commerce/orders",
      label: "Orders",
      summary: "Creates orders through GraphQL.",
      roots: roots.map(({ path, name }) => referenceAt(path, name)),
    },
  });
  return { result, referenceAt, exactCallTarget };
}

function realizedBusinessOperation(
  patch: GraphPatchV1,
  structural: StructuralNode["reference"],
) {
  const operation = upsertedRelations(patch).find((relation) => (
    relation.type === "realized_by"
    && relation.to.domain === "structural"
    && relation.to.id === structural.id
  ))?.from;
  if (operation === undefined) {
    throw new Error(`Expected one business operation realized by ${structural.id}`);
  }
  return operation;
}
