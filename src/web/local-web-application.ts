import { t } from "../i18n/index.js";
import { MapApplication } from "../application/map-application.js";
import { createProjectCatalog } from "../projects/project-directory.js";
import { viewerLocationHash } from "../rendering/viewer-location.js";
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
      readonly messageKey: string;
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
    this.projects = Object.freeze(
      createProjectCatalog(repositoryPaths).map((project) => ({
        id: project.id,
        name: project.displayName,
        repositoryPath: project.repositoryPath,
      })),
    );
  }

  public get repositoryCount(): number {
    return this.projects.length;
  }

  public render(): string {
    return renderWebViewerPage(this.projects);
  }

  public async resolveFlowLocation(flowId: string): Promise<string> {
    if (this.projects.length !== 1) {
      throw new Error(t("cli.webFlowProjectRequired"));
    }
    const project = this.projects[0]!;
    const result = await this.mapApplication.flows(project.repositoryPath, flowId);
    if (!result.ok) throw new Error(result.error.message);
    if (!("selected" in result.data)) {
      throw new Error(t("errors.flowNotFound", { flowId }));
    }
    return viewerLocationHash(project.id, result.data.selected.id);
  }

  public async loadProject(id: string): Promise<WebProjectLoadResult> {
    const project = this.projects.find((candidate) => candidate.id === id);
    if (!project) return { found: false };

    const result = await this.mapApplication.viewerProject(project.repositoryPath, {
      id: project.id,
      name: project.name,
    });
    if (!result.ok) {
      const messageKey = safeUnavailableMessageKey(result.error.code);
      return {
        found: true,
        ok: false,
        message: t(messageKey),
        messageKey,
      };
    }
    return {
      found: true,
      ok: true,
      data: toViewerProjectPayload(result.viewerProject),
    };
  }
}

function safeUnavailableMessageKey(code: string): string {
  if (code === "MAP_NOT_FOUND") return "errors.projectMapMissing";
  if (code === "MAP_DOCUMENT_INVALID") return "errors.projectMapInvalid";
  if (code === "REPOSITORY_INVALID") return "errors.projectPathUnavailable";
  return "errors.projectMapUnavailable";
}
