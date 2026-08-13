import { stdin, stdout } from "node:process";

import { GraphStore } from "../graph/graph-store.js";
import { BusinessKnowledgeService } from "../knowledge/business-knowledge-service.js";
import { GraphPatchConflictError } from "../knowledge/graph-patch-conflict-error.js";
import { WorldModelService } from "../world/world-model-service.js";
import { CodeGraphStructuralBackend } from "./codegraph-backend.js";
import type {
  CodeGraphWorkerRequest,
  CodeGraphWorkerResponse,
} from "./codegraph-worker-protocol.js";

const request = JSON.parse(await readStandardInput()) as CodeGraphWorkerRequest;
const backend = new CodeGraphStructuralBackend(request.repository);

try {
  const value = await executeRequest(backend, request);
  writeResponse({ ok: true, value });
} catch (error) {
  writeResponse({ ok: false, error: serializeError(error) });
}

async function executeRequest(
  backend: CodeGraphStructuralBackend,
  request: CodeGraphWorkerRequest,
): Promise<unknown> {
  switch (request.operation) {
    case "inspect": return backend.inspect();
    case "build": return backend.build();
    case "sync": return backend.sync();
    case "search": return backend.search(request.input);
    case "getNode": return backend.getNode(request.input);
    case "traverse": return backend.traverse(request.input);
    case "getCallers": return backend.getCallers(request.input);
    case "getCallees": return backend.getCallees(request.input);
    case "getFileDependencies": return backend.getFileDependencies(request.input);
    case "worldBuild": return new WorldModelService(request.repository).build();
    case "worldSync": return new WorldModelService(request.repository).sync();
    case "learn": {
      using graph = new GraphStore(request.repository);
      return await new BusinessKnowledgeService(
        request.repository,
        graph,
        backend,
      ).learn(request.input);
    }
  }
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function serializeError(error: unknown): Extract<CodeGraphWorkerResponse, { ok: false }>["error"] {
  if (error instanceof GraphPatchConflictError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      baseSnapshotId: error.baseSnapshotId,
      currentSnapshotId: error.currentSnapshotId,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }
  if (!(error instanceof Error)) {
    return { name: "Error", message: String(error) };
  }
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  return {
    name: error.name,
    message: error.message,
    ...(code === undefined ? {} : { code }),
    ...(error.stack === undefined ? {} : { stack: error.stack }),
  };
}

function writeResponse(response: CodeGraphWorkerResponse): void {
  stdout.write(JSON.stringify(response));
}
