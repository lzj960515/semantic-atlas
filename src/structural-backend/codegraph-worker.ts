import { stdin, stdout } from "node:process";

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

function executeRequest(
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
