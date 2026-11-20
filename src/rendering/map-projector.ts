import { getTranslator } from "../i18n/index.js";
import type { MapProjection } from "../contracts/projection.js";
import { BusinessGraph } from "../map/business-graph.js";
import { FlowProjector } from "./flow-projector.js";
import { FlowNavigationService } from "../query/flow-navigation-service.js";
import { renderViewerPage, type ViewerProject } from "./viewer-page.js";

const t = getTranslator("en");

export interface ViewerProjectMetadata {
  readonly id: string;
  readonly name: string;
}

export class MapProjector {
  public constructor(private readonly graph: BusinessGraph) {}

  public project(
    metadata: ViewerProjectMetadata = { id: "repository", name: t("viewer.title") },
  ): MapProjection {
    const project = this.viewerProject(metadata);
    return {
      format: "html",
      content: renderViewerPage([project]),
      nodeCount: this.graph.nodes().length,
      relationCount: this.graph.relations().length,
      flowCount: project.flows.length,
    };
  }

  public viewerProject(metadata: ViewerProjectMetadata): ViewerProject {
    const navigation = new FlowNavigationService(this.graph);
    const projected = new Map(
      new FlowProjector(this.graph).project(metadata.id).map((flow) => [flow.id, flow]),
    );
    return {
      ...metadata,
      navigation: navigation.directory(),
      flows: Object.freeze(navigation.orderedFlows().map((flow) => projected.get(flow.id)!)),
    };
  }
}
