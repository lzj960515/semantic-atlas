import { createServer, type ServerResponse } from "node:http";
import type { LocalWebApplication } from "./local-web-application.js";

const LOOPBACK_HOST = "127.0.0.1";

export interface LocalWebServerOptions {
  readonly application: LocalWebApplication;
  readonly port: number;
}

export interface LocalWebServer {
  readonly url: string;
  readonly repositoryCount: number;
  close(): Promise<void>;
}

export async function startLocalWebServer(
  options: LocalWebServerOptions,
): Promise<LocalWebServer> {
  await options.application.render();
  const server = createServer((request, response) => {
    void routeRequest(options.application, request.method ?? "GET", request.url ?? "/", response);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, LOOPBACK_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Could not resolve the local Web server address");
  }

  return {
    url: `http://${LOOPBACK_HOST}:${address.port}`,
    repositoryCount: options.application.repositoryCount,
    close: async () => {
      server.closeIdleConnections();
      await closeServer(server);
    },
  };
}

async function routeRequest(
  application: LocalWebApplication,
  method: string,
  requestUrl: string,
  response: ServerResponse,
): Promise<void> {
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, {
      Allow: "GET, HEAD",
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Method not allowed\n");
    return;
  }

  const pathname = new URL(requestUrl, `http://${LOOPBACK_HOST}`).pathname;
  if (pathname === "/health") {
    sendResponse(response, method, 200, "application/json; charset=utf-8", '{"ok":true}\n');
    return;
  }
  if (pathname !== "/") {
    sendResponse(response, method, 404, "text/plain; charset=utf-8", "Not found\n");
    return;
  }

  try {
    const html = await application.render();
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    sendResponse(response, method, 200, "text/html; charset=utf-8", html);
  } catch {
    sendResponse(
      response,
      method,
      500,
      "text/plain; charset=utf-8",
      "The business map could not be loaded.\n",
    );
  }
}

function sendResponse(
  response: ServerResponse,
  method: string,
  status: number,
  contentType: string,
  body: string,
): void {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(method === "HEAD" ? undefined : body);
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
