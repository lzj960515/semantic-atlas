import { createRepositorySnapshot } from "../snapshots/repository-snapshot.js";
import { isSupportedSource } from "../repository/repository-inspector.js";
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
import type { RepositorySnapshot } from "../snapshots/types.js";
import { WorldSnapshotStore } from "./world-snapshot-store.js";
import type { IndexedSourceFile, WorldSnapshotState } from "./types.js";

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
    let snapshot: Awaited<ReturnType<typeof createRepositorySnapshot>> | undefined;
    let staleAssertions: readonly string[] = [];
    let previousSnapshotId: string | null = null;
    const hooks: StructuralWorldPublicationHooks = {
      onBuilding: async () => {
        snapshot = await createRepositorySnapshot(this.repository);
        using store = new WorldSnapshotStore(this.repository);
        previousSnapshotId = store.readState().currentSnapshotId;
        store.begin(snapshot.snapshotId);
      },
      publish: async (structural, resolver, indexedSources) => {
        const indexedSnapshot = requireBuildSnapshot(snapshot);
        const publishableSnapshot = await createRepositorySnapshot(this.repository);
        const mismatch = worldPublicationMismatch(
          indexedSnapshot,
          publishableSnapshot,
          indexedSources,
        );
        if (mismatch !== null) {
          throw new Error(
            `Repository changed during world publication: ${mismatch}`,
          );
        }
        using store = new WorldSnapshotStore(this.repository);
        staleAssertions = store.publish(
          indexedSnapshot,
          structural.backendVersion,
          structural.extractionVersion,
          resolver,
          {
            fromSnapshotId: previousSnapshotId,
            toSnapshotId: indexedSnapshot.snapshotId,
            structural: structural.changes,
          },
        ).staleAssertions;
      },
      fail: (error) => {
        if (snapshot === undefined) {
          return;
        }
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
    return {
      snapshotId: requireBuildSnapshot(snapshot).snapshotId,
      structural,
      staleAssertions,
    };
  }
}

function requireBuildSnapshot(
  snapshot: Awaited<ReturnType<typeof createRepositorySnapshot>> | undefined,
): Awaited<ReturnType<typeof createRepositorySnapshot>> {
  if (snapshot === undefined) {
    throw new Error("World publication did not capture a repository snapshot");
  }
  return snapshot;
}

export function worldPublicationMismatch(
  indexedSnapshot: RepositorySnapshot,
  publishableSnapshot: RepositorySnapshot,
  indexedSources: readonly IndexedSourceFile[],
): string | null {
  if (publishableSnapshot.snapshotId !== indexedSnapshot.snapshotId) {
    return `indexed ${indexedSnapshot.snapshotId}, current ${publishableSnapshot.snapshotId}`;
  }

  const indexedHashes = new Map(indexedSources.map((file) => [file.path, file.contentHash]));
  for (const file of indexedSnapshot.files) {
    if (!isSupportedSource(file.path) || file.worktree === null) {
      continue;
    }
    const indexedHash = indexedHashes.get(file.path);
    if (indexedHash === undefined) {
      return `snapshot source ${file.path} is missing from the structural index`;
    }
  }

  const snapshotHashes = new Map(indexedSnapshot.files.map((file) =>
    [file.path, file.worktree?.contentHash] as const));
  for (const file of indexedSources) {
    const snapshotHash = snapshotHashes.get(file.path);
    if (snapshotHash !== file.contentHash) {
      return `indexed source ${file.path} has ${file.contentHash}, ` +
        `snapshot has ${snapshotHash ?? "no content"}`;
    }
  }
  return null;
}
