import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { AtlasReadOperations } from "../application/atlas-read-service.js";
import { createApiRequestHandler } from "./api-router.js";

export interface LocalWebServerOptions {
  readonly readService: AtlasReadOperations;
  readonly port: number;
  readonly assetsDirectory?: string;
}

export interface RunningLocalWebServer {
  readonly url: string;
  close(): Promise<void>;
}

export async function startLocalWebServer(
  options: LocalWebServerOptions,
): Promise<RunningLocalWebServer> {
  const apiHandler = createApiRequestHandler(options.readService);
  const assetsDirectory = options.assetsDirectory ?? bundledAssetsDirectory();
  const server = createServer((request, response) => {
    if ((request.url ?? "").startsWith("/api/")) {
      apiHandler(request, response);
      return;
    }
    void serveStaticAsset(assetsDirectory, request, response);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Semantic Atlas Web did not receive a TCP address");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    }),
  };
}

async function serveStaticAsset(
  assetsDirectory: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD");
    response.end();
    return;
  }
  let requestedPath: string;
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    requestedPath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  } catch {
    response.statusCode = 400;
    response.end("Invalid request");
    return;
  }
  const normalizedPath = normalize(requestedPath);
  const assetPath = join(assetsDirectory, normalizedPath);
  const pathFromAssets = relative(assetsDirectory, assetPath);
  if (pathFromAssets.startsWith("..") || pathFromAssets === "" || pathFromAssets.includes("\0")) {
    respondNotFound(response);
    return;
  }
  try {
    const metadata = await stat(assetPath);
    if (!metadata.isFile()) {
      respondNotFound(response);
      return;
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", contentType(assetPath));
    response.setHeader("Cache-Control", requestedPath === "index.html"
      ? "no-cache"
      : "public, max-age=31536000, immutable");
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(assetPath).pipe(response);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      respondNotFound(response);
      return;
    }
    response.statusCode = 500;
    response.end("Semantic Atlas Web could not load this asset.");
  }
}

function bundledAssetsDirectory(): string {
  return fileURLToPath(new URL("../../web-client/", import.meta.url));
}

function respondNotFound(response: ServerResponse): void {
  response.statusCode = 404;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end("Not found");
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    default: return "application/octet-stream";
  }
}
