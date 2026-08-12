import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CodeGraphWorkerRequest,
  CodeGraphWorkerResponse,
} from "./codegraph-worker-protocol.js";
import { StructuralBackendError } from "./types.js";

export const CODEGRAPH_WORKER_ENVIRONMENT = "SEMANTIC_ATLAS_CODEGRAPH_WORKER";

const MAX_WORKER_OUTPUT_BYTES = 64 * 1024 * 1024;
const require = createRequire(import.meta.url);

export function requiresBundledCodeGraphRuntime(): boolean {
  if (process.env[CODEGRAPH_WORKER_ENVIRONMENT] === "1") {
    return false;
  }
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  return major === 22 && minor < 16;
}

export async function runCodeGraphWorker<T>(request: CodeGraphWorkerRequest): Promise<T> {
  let response: CodeGraphWorkerResponse;
  try {
    response = await executeWorker(request);
  } catch (error) {
    throw new StructuralBackendError(
      "STRUCTURAL_QUERY_FAILED",
      "The structural backend worker could not complete the operation",
      error,
    );
  }
  if (response.ok) {
    return response.value as T;
  }

  throw new StructuralBackendError(
    isStructuralBackendErrorCode(response.error.code)
      ? response.error.code
      : "STRUCTURAL_QUERY_FAILED",
    response.error.message,
  );
}

async function executeWorker(request: CodeGraphWorkerRequest): Promise<CodeGraphWorkerResponse> {
  const runtime = resolveBundledNodeRuntime();
  const worker = fileURLToPath(new URL("./codegraph-worker.js", import.meta.url));

  return new Promise((resolve, reject) => {
    const child = spawn(runtime, [
      "--liftoff-only",
      "--disable-warning=ExperimentalWarning",
      worker,
    ], {
      env: {
        ...process.env,
        [CODEGRAPH_WORKER_ENVIRONMENT]: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_WORKER_OUTPUT_BYTES) {
        child.kill();
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (outputBytes > MAX_WORKER_OUTPUT_BYTES) {
        reject(new Error("The structural backend worker exceeded its output limit"));
        return;
      }
      const output = Buffer.concat(stdout).toString("utf8");
      if (code !== 0) {
        const diagnostic = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(
          `The structural backend worker exited ${signal ?? code}${diagnostic.length === 0 ? "" : `: ${diagnostic}`}`,
        ));
        return;
      }
      try {
        const response = JSON.parse(output) as unknown;
        if (!isWorkerResponse(response)) {
          throw new Error("Invalid worker response shape");
        }
        resolve(response);
      } catch (error) {
        reject(new Error("The structural backend worker returned an invalid response", { cause: error }));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

function resolveBundledNodeRuntime(): string {
  const codeGraphPackage = require.resolve("@colbymchenry/codegraph/package.json");
  const codeGraphRequire = createRequire(codeGraphPackage);
  const platformPackageName = `@colbymchenry/codegraph-${process.platform}-${process.arch}`;
  const platformPackage = codeGraphRequire.resolve(`${platformPackageName}/package.json`);
  return join(dirname(platformPackage), process.platform === "win32" ? "node.exe" : "node");
}

function isStructuralBackendErrorCode(
  code: string | undefined,
): code is StructuralBackendError["code"] {
  return code === "STRUCTURAL_INDEX_MISSING" ||
    code === "STRUCTURAL_INDEX_INCOMPLETE" ||
    code === "STRUCTURAL_QUERY_FAILED";
}

function isWorkerResponse(value: unknown): value is CodeGraphWorkerResponse {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    return false;
  }
  if (value.ok === true) {
    return true;
  }
  if (value.ok !== false || !("error" in value) || typeof value.error !== "object" || value.error === null) {
    return false;
  }
  return "name" in value.error && typeof value.error.name === "string" &&
    "message" in value.error && typeof value.error.message === "string";
}
