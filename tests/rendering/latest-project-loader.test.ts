import { describe, expect, it, vi } from "vitest";
import { createLatestProjectLoader } from "../../src/rendering/latest-project-loader.js";

describe("latest project loader", () => {
  it("aborts the previous request and ignores its late result", async () => {
    const pending = new Map<string, {
      readonly signal: AbortSignal;
      resolve(value: string): void;
    }>();
    const load = vi.fn((projectId: string, signal: AbortSignal) =>
      new Promise<string>((resolve) => pending.set(projectId, { signal, resolve }))
    );
    const ready = vi.fn();
    const failed = vi.fn();
    const loader = createLatestProjectLoader(load, ready, failed);

    const first = loader("first");
    const second = loader("second");
    expect(pending.get("first")?.signal.aborted).toBe(true);

    pending.get("second")?.resolve("second-result");
    await second;
    pending.get("first")?.resolve("first-result");
    await first;

    expect(ready).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledWith("second-result", "second");
    expect(failed).not.toHaveBeenCalled();
  });

  it("reports only the current request failure", async () => {
    const failed = vi.fn();
    const loader = createLatestProjectLoader(
      async (projectId: string) => {
        throw new Error(`${projectId} unavailable`);
      },
      vi.fn(),
      failed,
    );

    await loader("missing");

    expect(failed).toHaveBeenCalledWith(expect.any(Error), "missing");
  });
});
