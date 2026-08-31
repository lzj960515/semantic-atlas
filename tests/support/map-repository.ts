import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";

export interface TestMapDocument {
  readonly schemaVersion: 1;
  readonly map: {
    readonly id: string;
    readonly title: string;
    readonly summary: string;
  };
  readonly nodes: readonly Record<string, unknown>[];
  readonly relations: readonly Record<string, unknown>[];
  readonly flows?: readonly Record<string, unknown>[];
}

export function flow(
  id: string,
  scenario: string,
  startsAt: string,
  steps: readonly Record<string, unknown>[],
  transitions: readonly Record<string, unknown>[],
): Record<string, unknown> {
  return {
    id,
    name: id,
    summary: `${id} business flow.`,
    scenario,
    startsAt,
    steps,
    transitions,
  };
}

export function flowStep(
  id: string,
  kind: string,
  name: string,
  concept?: string,
): Record<string, unknown> {
  return {
    id,
    kind,
    name,
    summary: `${name} business meaning.`,
    ...(concept ? { concept } : {}),
  };
}

export function transition(
  from: string,
  to: string,
  when?: string,
): Record<string, unknown> {
  return {
    from,
    to,
    ...(when ? { when } : {}),
  };
}

export async function createMapRepository(
  documents: Readonly<Record<string, TestMapDocument | string>>,
): Promise<string> {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "semantic-atlas-next-test-"));
  const mapDirectory = path.join(repositoryRoot, "docs", "business-map");
  await mkdir(mapDirectory, { recursive: true });

  await Promise.all(
    Object.entries(documents).map(async ([fileName, document]) => {
      const content = typeof document === "string" ? document : stringify(document);
      await writeFile(path.join(mapDirectory, fileName), content, "utf8");
    }),
  );

  return realpath(repositoryRoot);
}

export async function createEmptyRepository(): Promise<string> {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "semantic-atlas-next-empty-"));
  return realpath(repositoryRoot);
}

export async function removeRepository(repositoryRoot: string): Promise<void> {
  await rm(repositoryRoot, { recursive: true, force: true });
}

export function node(
  id: string,
  kind: string,
  name: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id,
    kind,
    name,
    summary: `${name} business meaning.`,
    aliases: [],
    anchors: [],
    ...overrides,
  };
}

export function relation(
  from: string,
  type: string,
  to: string,
): Record<string, unknown> {
  return {
    from,
    type,
    to,
    summary: `${from} ${type} ${to}.`,
  };
}
