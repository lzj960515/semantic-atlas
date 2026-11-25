export interface ViewerLocation {
  readonly projectId?: string;
  readonly flowId?: string;
}

export function readViewerLocation(hash: string): ViewerLocation {
  const parameters = new URLSearchParams(hash.replace(/^#/u, ""));
  const projectId = parameters.get("project") || undefined;
  const flowId = parameters.get("flow") || undefined;
  return {
    ...(projectId ? { projectId } : {}),
    ...(flowId ? { flowId } : {}),
  };
}

export function viewerLocationHash(projectId: string, flowId?: string): string {
  const parameters = new URLSearchParams({ project: projectId });
  if (flowId) parameters.set("flow", flowId);
  return `#${parameters.toString()}`;
}
