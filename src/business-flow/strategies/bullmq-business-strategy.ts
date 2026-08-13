import type { StructuralNode } from "../../structural-backend/types.js";
import type { BusinessFlowDraft } from "../business-flow-draft.js";
import { businessKeySegment } from "../business-flow-draft.js";
import type { FrameworkBusinessStrategy } from "../framework-business-strategy.js";
import type { StructuralFlowCatalog } from "../structural-flow-catalog.js";
import type {
  BusinessFlowDerivationOptions,
  VerifiedMessageFlow,
} from "../types.js";
import {
  addBusinessNode,
  addBusinessRelation,
  addStructuralRelation,
  hasDecorator,
  nodeKey,
} from "./strategy-helpers.js";

export class BullMqBusinessStrategy implements FrameworkBusinessStrategy {
  derive(
    catalog: StructuralFlowCatalog,
    options: BusinessFlowDerivationOptions,
    draft: BusinessFlowDraft,
  ): void {
    const verifiedReferences = new Set((options.messageFlows ?? []).flatMap((flow) => [
      flow.producer.id,
      flow.consumer.id,
    ]));
    for (const candidate of findBullMqAnchors(catalog)) {
      if (!verifiedReferences.has(candidate.reference.id)) {
        draft.addBoundary(
          "bullmq",
          "resolve_message_channel",
          `The BullMQ channel for ${candidate.qualifiedName} requires agent-verified runtime wiring.`,
          candidate,
        );
      }
    }
    for (const flow of options.messageFlows ?? []) {
      deriveVerifiedFlow(flow, catalog, options, draft);
    }
  }
}

export function findBullMqAnchors(catalog: StructuralFlowCatalog): StructuralNode[] {
  const frameworkPaths = new Set(catalog.nodes.flatMap((node) => (
    catalog.contextNodes(node.path)
  )).filter((node) => (
    node.declarationKind === "import"
    && (node.name === "bullmq" || node.name === "@nestjs/bullmq")
  )).map((node) => node.path));
  return catalog.nodes.filter((node) => (
    hasBullMqDecorator(node)
    || (frameworkPaths.has(node.path)
      && /(?:Processor|Consumer)(?:::|\.)/u.test(node.qualifiedName))
  ));
}

function deriveVerifiedFlow(
  flow: VerifiedMessageFlow,
  catalog: StructuralFlowCatalog,
  options: BusinessFlowDerivationOptions,
  draft: BusinessFlowDraft,
): void {
  const producer = catalog.node(flow.producer.id);
  const consumer = catalog.node(flow.consumer.id);
  if (producer === undefined || consumer === undefined) {
    throw new Error(`Verified message flow ${flow.channel} references missing structural evidence`);
  }
  const channelKey = `${options.capability.key}/interfaces/${businessKeySegment(flow.channel)}`;
  const producerKey = nodeKey(options.capability.key, "operations", producer);
  const consumerKey = nodeKey(options.capability.key, "operations", consumer);
  addBusinessNode(draft, {
    key: channelKey,
    kind: "Interface",
    label: flow.channel,
    summary: `BullMQ channel ${flow.channel}.`,
    evidence: producer,
    certainty: flow.certainty ?? "inferred",
  });
  for (const [operation, key, summary] of [
    [producer, producerKey, `Publishes ${flow.channel}.`],
    [consumer, consumerKey, `Consumes ${flow.channel}.`],
  ] as const) {
    addBusinessNode(draft, {
      key,
      kind: "Operation",
      label: operation.name,
      summary,
      evidence: operation,
      certainty: flow.certainty ?? "inferred",
    });
    addStructuralRelation(draft, {
      from: key,
      type: "realized_by",
      to: operation,
      certainty: flow.certainty ?? "inferred",
    });
  }
  addBusinessRelation(draft, {
    from: producerKey,
    type: "publishes",
    to: channelKey,
    evidence: producer,
    certainty: flow.certainty ?? "inferred",
  });
  addBusinessRelation(draft, {
    from: consumerKey,
    type: "consumes",
    to: channelKey,
    evidence: consumer,
    certainty: flow.certainty ?? "inferred",
  });
}

function hasBullMqDecorator(node: StructuralNode): boolean {
  return hasDecorator(node, ["Processor", "Process", "InjectQueue"]);
}
