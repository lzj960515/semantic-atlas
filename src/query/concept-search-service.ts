import type { ConceptSearchField, ConceptSearchResult } from "../contracts/cli.js";
import type { BusinessNode } from "../contracts/map.js";

const RESULT_LIMIT = 5;
const MINIMUM_SCORE = 0.2;

interface SearchField {
  readonly kind: ConceptSearchField;
  readonly value: string;
  readonly weight: number;
}

interface ScoredField {
  readonly kind: ConceptSearchField;
  readonly score: number;
}

interface ScoredNode {
  readonly node: BusinessNode;
  readonly score: number;
  readonly matchedFields: readonly ConceptSearchField[];
}

/** Deterministic, local candidate retrieval across every business-map node. */
export class ConceptSearchService {
  public constructor(private readonly nodes: readonly BusinessNode[]) {}

  public search(query: string): readonly ConceptSearchResult[] {
    const ranked = this.nodes
      .map((node) => scoreNode(query, node))
      .filter((candidate) => candidate.score >= MINIMUM_SCORE)
      .sort(compareScoredNodes)
      .slice(0, RESULT_LIMIT);

    return Object.freeze(
      ranked.map((candidate, index) => ({
        rank: index + 1,
        score: candidate.score,
        id: candidate.node.id,
        name: candidate.node.name,
        kind: candidate.node.kind,
        documentId: candidate.node.documentId,
        matchedFields: candidate.matchedFields,
      })),
    );
  }
}

function scoreNode(query: string, node: BusinessNode): ScoredNode {
  const fields: readonly SearchField[] = [
    { kind: "name", value: node.name, weight: 1 },
    ...node.aliases.map((alias): SearchField => ({ kind: "alias", value: alias, weight: 0.95 })),
    { kind: "id", value: node.id, weight: 0.85 },
    { kind: "summary", value: node.summary, weight: 0.35 },
  ];
  const scoredFields = fields.map((field): ScoredField => ({
    kind: field.kind,
    score: roundScore(scoreField(query, field)),
  }));
  const score = Math.max(0, ...scoredFields.map((field) => field.score));
  const matchedFields = Object.freeze(
    [
      ...new Set(
        scoredFields.filter((field) => field.score >= MINIMUM_SCORE).map((field) => field.kind),
      ),
    ].sort(compareSearchFields),
  );

  return { node, score, matchedFields };
}

function scoreField(query: string, field: SearchField): number {
  const exactLookupVocabulary =
    field.kind !== "summary" && normalize(query) === normalize(field.value);
  return exactLookupVocabulary ? 1 : similarity(query, field.value) * field.weight;
}

function similarity(query: string, candidate: string): number {
  const normalizedQuery = normalize(query);
  const normalizedCandidate = normalize(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedQuery === normalizedCandidate) return 1;

  const compactQuery = compact(normalizedQuery);
  const compactCandidate = compact(normalizedCandidate);
  if (!compactQuery || !compactCandidate) return 0;
  if (compactQuery === compactCandidate) return 0.98;

  const containment =
    compactQuery.includes(compactCandidate) || compactCandidate.includes(compactQuery)
      ? Math.min(compactQuery.length, compactCandidate.length) /
        Math.max(compactQuery.length, compactCandidate.length)
      : 0;
  const approximate =
    0.65 * diceCoefficient(compactQuery, compactCandidate) +
    0.35 * queryTokenCoverage(normalizedQuery, normalizedCandidate);

  return Math.max(0.9 * containment, approximate);
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function compact(value: string): string {
  return value.replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function diceCoefficient(left: string, right: string): number {
  const leftBigrams = characterBigrams(left);
  const rightBigrams = characterBigrams(right);
  if (leftBigrams.size === 0 || rightBigrams.size === 0) return 0;

  let intersectionSize = 0;
  for (const bigram of leftBigrams) {
    if (rightBigrams.has(bigram)) intersectionSize += 1;
  }
  return (2 * intersectionSize) / (leftBigrams.size + rightBigrams.size);
}

function characterBigrams(value: string): ReadonlySet<string> {
  const characters = [...value];
  if (characters.length < 2) return new Set(characters);
  return new Set(
    characters.slice(0, -1).map((character, index) => character + characters[index + 1]),
  );
}

function queryTokenCoverage(query: string, candidate: string): number {
  const queryTokens = searchTokens(query);
  if (queryTokens.size === 0) return 0;
  const candidateTokens = searchTokens(candidate);
  let matches = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) matches += 1;
  }
  return matches / queryTokens.size;
}

function searchTokens(value: string): ReadonlySet<string> {
  const tokens = new Set<string>();
  for (const match of value.matchAll(/[\p{Script=Latin}\p{Number}]+/gu)) {
    tokens.add(match[0]!);
  }
  for (const match of value.matchAll(/[\p{Script=Han}]+/gu)) {
    const term = match[0]!;
    tokens.add(term);
    for (const bigram of characterBigrams(term)) tokens.add(bigram);
  }
  return tokens;
}

function compareScoredNodes(left: ScoredNode, right: ScoredNode): number {
  return right.score - left.score || left.node.id.localeCompare(right.node.id);
}

function compareSearchFields(left: ConceptSearchField, right: ConceptSearchField): number {
  const order: readonly ConceptSearchField[] = ["name", "alias", "id", "summary"];
  return order.indexOf(left) - order.indexOf(right);
}

function roundScore(score: number): number {
  return Math.round(score * 1_000) / 1_000;
}
