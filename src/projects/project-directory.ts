import { createHash } from "node:crypto";
import path from "node:path";
import type { ProjectSelectionFailure, RegisteredProject } from "../contracts/project.js";
import { t } from "../i18n/index.js";
import { ProjectStore } from "./project-store.js";

export class ProjectSelectionError extends Error {
  public constructor(public readonly error: ProjectSelectionFailure) {
    super(error.message);
    this.name = "ProjectSelectionError";
  }
}

/** One derived directory for CLI selection and the local Viewer's project identities. */
export class ProjectDirectory {
  public constructor(private readonly projectStore: ProjectStore) {}

  public async list(): Promise<readonly RegisteredProject[]> {
    return createProjectCatalog(await this.projectStore.read());
  }

  public async resolve(selector: string): Promise<RegisteredProject> {
    const projects = await this.list();
    const normalized = normalizeProjectName(selector);
    const byId = projects.find((project) => project.id === normalized);
    if (byId) return byId;

    const byName = projects.filter((project) => normalizeProjectName(project.name) === normalized);
    if (byName.length === 1) return byName[0]!;
    if (byName.length > 1) {
      throw new ProjectSelectionError({
        code: "PROJECT_AMBIGUOUS",
        message: t("errors.projectAmbiguous", { selector }),
        selector,
        candidates: byName,
      });
    }

    const candidates = similarProjects(projects, normalized);
    throw new ProjectSelectionError({
      code: "PROJECT_NOT_FOUND",
      message:
        candidates.length > 0
          ? t("errors.projectSuggestion", {
              selector,
              candidates: candidates.map((project) => project.displayName).join(", "),
            })
          : t("errors.projectNameNotFound", { selector }),
      selector,
      candidates,
    });
  }
}

export function createProjectCatalog(
  repositoryPaths: readonly string[],
): readonly RegisteredProject[] {
  const normalizedPaths = [
    ...new Set(repositoryPaths.map((repositoryPath) => path.resolve(repositoryPath))),
  ];
  const names = normalizedPaths.map((repositoryPath) => path.basename(repositoryPath));
  const totals = new Map<string, number>();
  for (const name of names) {
    const normalized = normalizeProjectName(name);
    totals.set(normalized, (totals.get(normalized) ?? 0) + 1);
  }
  const occurrences = new Map<string, number>();
  return Object.freeze(
    normalizedPaths.map((repositoryPath, index) => {
      const name = names[index]!;
      const normalized = normalizeProjectName(name);
      const occurrence = (occurrences.get(normalized) ?? 0) + 1;
      occurrences.set(normalized, occurrence);
      return {
        id: projectId(repositoryPath),
        name,
        displayName: (totals.get(normalized) ?? 0) > 1 ? `${name} (${occurrence})` : name,
        repositoryPath,
      };
    }),
  );
}

function projectId(repositoryPath: string): string {
  return createHash("sha256")
    .update("semantic-atlas-web-project-v1\0")
    .update(repositoryPath)
    .digest("hex")
    .slice(0, 24);
}

function normalizeProjectName(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function similarProjects(
  projects: readonly RegisteredProject[],
  query: string,
): readonly RegisteredProject[] {
  if (!query) return [];
  return projects
    .map((project, index) => ({
      project,
      index,
      score: similarity(normalizeProjectName(project.name), query),
    }))
    .filter((match) => match.score >= 0.5)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 5)
    .map((match) => match.project);
}

function similarity(name: string, query: string): number {
  if (name.split(/[\s._-]+/u).includes(query)) return 0.95;
  if (name.includes(query) || query.includes(name)) {
    return 0.7 + (0.3 * Math.min(name.length, query.length)) / Math.max(name.length, query.length);
  }
  if (Math.min(name.length, query.length) < 3) return 0;
  let previous = Array.from({ length: query.length + 1 }, (_, index) => index);
  for (let nameIndex = 0; nameIndex < name.length; nameIndex += 1) {
    const current = [nameIndex + 1];
    for (let queryIndex = 0; queryIndex < query.length; queryIndex += 1) {
      current.push(
        Math.min(
          current[queryIndex]! + 1,
          previous[queryIndex + 1]! + 1,
          previous[queryIndex]! + (name[nameIndex] === query[queryIndex] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return 1 - previous[query.length]! / Math.max(name.length, query.length);
}
