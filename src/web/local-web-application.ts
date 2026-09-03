import { createHash } from "node:crypto";
import path from "node:path";
import { MapApplication } from "../application/map-application.js";
import {
  renderWebViewerPage,
  toViewerProjectPayload,
  type ViewerProjectPayload,
  type ViewerProjectReference,
} from "../rendering/viewer-page.js";

interface WebProject extends ViewerProjectReference {
  readonly repositoryPath: string;
}

export type WebProjectLoadResult =
  | {
      readonly found: true;
      readonly ok: true;
      readonly data: ViewerProjectPayload;
    }
  | {
      readonly found: true;
      readonly ok: false;
      readonly message: string;
    }
  | {
      readonly found: false;
    };

export class LocalWebApplication {
  private readonly projects: readonly WebProject[];

  public constructor(
    private readonly mapApplication: MapApplication,
    repositoryPaths: readonly string[],
  ) {
    const normalizedPaths = [...new Set(repositoryPaths.map((repositoryPath) =>
      path.resolve(repositoryPath)))];
    this.projects = Object.freeze(disambiguateProjectNames(normalizedPaths.map(
      (repositoryPath) => ({
        id: projectId(repositoryPath),
        name: path.basename(repositoryPath),
        repositoryPath,
      }),
    )));
  }

  public get repositoryCount(): number {
    return this.projects.length;
  }

  public render(): string {
    return renderWebViewerPage(this.projects);
  }

  public async loadProject(id: string): Promise<WebProjectLoadResult> {
    const project = this.projects.find((candidate) => candidate.id === id);
    if (!project) return { found: false };

    const result = await this.mapApplication.viewerProject(project.repositoryPath, {
      id: project.id,
      name: project.name,
    });
    if (!result.ok) {
      return {
        found: true,
        ok: false,
        message: safeUnavailableMessage(result.error.code),
      };
    }
    return {
      found: true,
      ok: true,
      data: toViewerProjectPayload(result.viewerProject),
    };
  }
}

function projectId(repositoryPath: string): string {
  return createHash("sha256")
    .update("semantic-atlas-web-project-v1\0")
    .update(repositoryPath)
    .digest("hex")
    .slice(0, 24);
}

function disambiguateProjectNames(projects: readonly WebProject[]): readonly WebProject[] {
  const totals = new Map<string, number>();
  for (const project of projects) {
    totals.set(project.name, (totals.get(project.name) ?? 0) + 1);
  }
  const occurrences = new Map<string, number>();
  return projects.map((project) => {
    if ((totals.get(project.name) ?? 0) < 2) return project;
    const occurrence = (occurrences.get(project.name) ?? 0) + 1;
    occurrences.set(project.name, occurrence);
    return { ...project, name: `${project.name} (${occurrence})` };
  });
}

function safeUnavailableMessage(code: string): string {
  if (code === "MAP_NOT_FOUND") return "No business map is configured for this project.";
  if (code === "MAP_DOCUMENT_INVALID") return "This project's business map is invalid.";
  if (code === "REPOSITORY_INVALID") return "The registered project path is unavailable.";
  return "This project's business map could not be loaded.";
}
