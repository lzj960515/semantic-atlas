import { createRepositorySnapshot } from "../snapshots/repository-snapshot.js";
import type { GitRepository } from "../repository/types.js";
import {
  CodeGraphStructuralBackend,
  type StructuralWorldPublicationHooks,
} from "../structural-backend/codegraph-backend.js";
import {
  requiresBundledCodeGraphRuntime,
  runCodeGraphWorker,
} from "../structural-backend/codegraph-worker-client.js";
import type { StructuralBuildResult } from "../structural-backend/types.js";
import { WorldSnapshotStore } from "./world-snapshot-store.js";
import type { WorldSnapshotState } from "./types.js";

export interface PublishedWorldSnapshot {
  readonly snapshotId: string;
  readonly structural: StructuralBuildResult;
  readonly staleAssertions: readonly string[];
}

export class WorldModelService {
  readonly #backend: CodeGraphStructuralBackend;

  constructor(readonly repository: GitRepository) {
    this.#backend = new CodeGraphStructuralBackend(repository);
  }

  async build(): Promise<PublishedWorldSnapshot> {
    return this.publish("full");
  }

  async sync(): Promise<PublishedWorldSnapshot> {
    return this.publish("incremental");
  }

  state(): WorldSnapshotState {
    using store = new WorldSnapshotStore(this.repository);
    return store.readState();
  }

  currentSnapshotId(): string {
    using store = new WorldSnapshotStore(this.repository);
    return store.requireCurrentSnapshot().snapshotId;
  }

  private async publish(mode: "full" | "incremental"): Promise<PublishedWorldSnapshot> {
    if (requiresBundledCodeGraphRuntime()) {
      return runCodeGraphWorker({
        operation: mode === "full" ? "worldBuild" : "worldSync",
        repository: this.repository,
      });
    }
    const snapshot = await createRepositorySnapshot(this.repository);
    let staleAssertions: readonly string[] = [];
    let previousSnapshotId: string | null = null;
    const hooks: StructuralWorldPublicationHooks = {
      onBuilding: () => {
        using store = new WorldSnapshotStore(this.repository);
        previousSnapshotId = store.readState().currentSnapshotId;
        store.begin(snapshot.snapshotId);
      },
      publish: (structural, resolver) => {
        using store = new WorldSnapshotStore(this.repository);
        staleAssertions = store.publish(
          snapshot,
          structural.backendVersion,
          structural.extractionVersion,
          resolver,
          {
            fromSnapshotId: previousSnapshotId,
            toSnapshotId: snapshot.snapshotId,
            structural: structural.changes,
          },
        ).staleAssertions;
      },
      fail: (error) => {
        using store = new WorldSnapshotStore(this.repository);
        store.fail(snapshot.snapshotId, error);
      },
    };
    const structural = await this.#backend.publishWorld(mode, hooks);
    if (structural.completeness !== "complete") {
      throw new Error(
        structural.diagnostics[0]?.message ?? "The structural index did not complete",
      );
    }
    return { snapshotId: snapshot.snapshotId, structural, staleAssertions };
  }
}
