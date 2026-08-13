import type { StructuralNode } from "../../structural-backend/types.js";
import type { BusinessFlowDraft } from "../business-flow-draft.js";
import type { FrameworkBusinessStrategy } from "../framework-business-strategy.js";
import type { StructuralFlowCatalog } from "../structural-flow-catalog.js";
import type { BusinessFlowDerivationOptions } from "../types.js";
import {
  addBusinessNode,
  addBusinessRelation,
  nodeKey,
  hasDecorator,
} from "./strategy-helpers.js";

const WRITE_METHODS = new Set(["save", "insert", "update", "delete", "remove", "softDelete", "softRemove", "upsert"]);
const READ_METHODS = new Set(["find", "findOne", "findBy", "findOneBy", "count", "exists", "query"]);

export class TypeOrmBusinessStrategy implements FrameworkBusinessStrategy {
  derive(
    catalog: StructuralFlowCatalog,
    options: BusinessFlowDerivationOptions,
    draft: BusinessFlowDraft,
  ): void {
    const entities = findTypeOrmEntities(catalog);
    const entityKeys = new Map(entities.map((entity) => {
      const key = nodeKey(options.capability.key, "data", entity);
      addBusinessNode(draft, {
        key,
        kind: "Data",
        label: entity.name,
        summary: `TypeORM persisted data represented by ${entity.qualifiedName}.`,
        evidence: entity,
      });
      return [entity.reference.id, key];
    }));
    if (entities.length === 0) {
      return;
    }

    for (const operation of catalog.nodes.filter(isOperationNode)) {
      const operationKey = nodeKey(options.capability.key, "operations", operation);
      for (const call of catalog.outgoing(operation.reference.id, "calls")) {
        const dataAccess = catalog.exactTarget(call);
        if (dataAccess === undefined || !looksLikeRepositoryAccess(dataAccess)) {
          continue;
        }
        const accessType = classifyDataAccess(dataAccess.name);
        if (accessType === undefined) {
          draft.addBoundary(
            "typeorm",
            "classify_data_access",
            `The TypeORM access ${dataAccess.qualifiedName} cannot be classified as a supported read or write.`,
            dataAccess,
            [...entityKeys.values()],
          );
          continue;
        }
        const entity = resolveEntityTarget(dataAccess, entities);
        if (entity === undefined) {
          draft.addBoundary(
            "typeorm",
            "resolve_data_target",
            `The TypeORM access ${dataAccess.qualifiedName} does not identify one decorated entity.`,
            dataAccess,
            entities.map((entity) => entity.reference.id),
          );
          continue;
        }
        const dataKey = entityKeys.get(entity.reference.id)!;
        addBusinessNode(draft, {
          key: operationKey,
          kind: "Operation",
          label: operation.name,
          summary: `Performs ${operation.qualifiedName}.`,
          evidence: operation,
        });
        addBusinessRelation(draft, {
          from: operationKey,
          type: accessType,
          to: dataKey,
          evidence: dataAccess,
        });
      }
    }
  }
}

export function findTypeOrmEntities(catalog: StructuralFlowCatalog): StructuralNode[] {
  const entities = catalog.nodes.filter((node) => hasDecorator(node, ["Entity", "ViewEntity"]));
  for (const file of catalog.nodes.filter(isTypeOrmEntityFile)) {
    const children = catalog.outgoing(file.reference.id, "declares")
      .filter((relation) => relation.support.status === "exact")
      .map((relation) => catalog.node(relation.to.id))
      .filter((node): node is StructuralNode => node !== undefined);
    if (!children.some(isTypeOrmImport)) {
      continue;
    }
    const entityName = entityNameFromFile(file.name);
    entities.push(...children.filter((node) => (
      node.declarationKind === "class" && node.name.toLowerCase() === entityName
    )));
  }
  return [...new Map(entities.map((entity) => [entity.reference.id, entity])).values()];
}

function entityNameFromFile(fileName: string): string {
  return fileName.replace(/\.entity\.[cm]?[jt]sx?$/iu, "")
    .replace(/[^a-z0-9]/giu, "")
    .toLowerCase();
}

function isTypeOrmEntityFile(node: StructuralNode): boolean {
  return node.declarationKind === "file"
    && /(?:^|\.)entity\.[cm]?[jt]sx?$/iu.test(node.name);
}

function isTypeOrmImport(node: StructuralNode): boolean {
  return node.declarationKind === "import"
    && (node.name === "typeorm" || node.qualifiedName === "typeorm");
}

function classifyDataAccess(name: string): "reads" | "writes" | undefined {
  if (WRITE_METHODS.has(name)) {
    return "writes";
  }
  return READ_METHODS.has(name) ? "reads" : undefined;
}

function looksLikeRepositoryAccess(node: StructuralNode): boolean {
  return /(?:^|::|\.)(?:Repository(?:<[^>]+>)?|EntityManager|(?:Select|Insert|Update|Delete|SoftDelete|Relation)?QueryBuilder)(?:::|\.)/u
    .test(node.qualifiedName);
}

function resolveEntityTarget(
  access: StructuralNode,
  entities: readonly StructuralNode[],
): StructuralNode | undefined {
  const generic = access.qualifiedName.match(/Repository<([^>]+)>(?:::|\.)/u)?.[1];
  if (generic === undefined) {
    return undefined;
  }
  const entityName = generic.split(/[.:]/u).at(-1)?.trim();
  const candidates = entities.filter((entity) => entity.name === entityName);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function isOperationNode(node: StructuralNode): boolean {
  return node.declarationKind === "method" || node.declarationKind === "function";
}
