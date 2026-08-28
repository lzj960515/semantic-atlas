import path from "node:path";
import { MapApplication } from "../application/map-application.js";
import { renderViewerPage } from "../rendering/viewer-page.js";

export class LocalWebApplication {
  private readonly repositoryPaths: readonly string[];

  public constructor(
    private readonly mapApplication: MapApplication,
    repositoryPaths: readonly string[],
  ) {
    this.repositoryPaths = Object.freeze([
      ...new Set(repositoryPaths.map((repositoryPath) => path.resolve(repositoryPath))),
    ]);
    if (this.repositoryPaths.length === 0) {
      throw new Error("At least one repository is required for the Web viewer");
    }
  }

  public get repositoryCount(): number {
    return this.repositoryPaths.length;
  }

  public async render(): Promise<string> {
    const results = await Promise.all(
      this.repositoryPaths.map((repositoryPath) => this.mapApplication.viewerProject(repositoryPath)),
    );
    const failure = results.find((result) => !result.ok);
    if (failure && !failure.ok) {
      throw new Error(failure.error.message);
    }
    const projects = results.flatMap((result) => result.ok ? [result.viewerProject] : []);
    return renderViewerPage(projects, "web");
  }
}
