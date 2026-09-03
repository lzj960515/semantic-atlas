export function createLatestProjectLoader<T>(
  load: (projectId: string, signal: AbortSignal) => Promise<T>,
  ready: (result: T, projectId: string) => void,
  failed: (error: unknown, projectId: string) => void,
): (projectId: string) => Promise<void> {
  let generation = 0;
  let activeController: AbortController | undefined;

  return async (projectId: string): Promise<void> => {
    const requestGeneration = ++generation;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;

    try {
      const result = await load(projectId, controller.signal);
      if (requestGeneration !== generation || controller.signal.aborted) return;
      ready(result, projectId);
    } catch (error) {
      if (requestGeneration !== generation || controller.signal.aborted) return;
      failed(error, projectId);
    } finally {
      if (requestGeneration === generation) activeController = undefined;
    }
  };
}
