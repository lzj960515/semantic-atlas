import { createServer, type ServerResponse } from "node:http";
import type { LocalWebApplication } from "./local-web-application.js";

const LOOPBACK_HOST = "127.0.0.1";
const PROJECT_ROUTE = "/api/projects/";

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
  const server = createServer((request, response) => {
    void routeRequest(
      options.application,
      request.method ?? "GET",
      request.url ?? "/",
      response,
    );
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
  response.setHeader("X-Content-Type-Options", "nosniff");
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
  if (pathname.startsWith(PROJECT_ROUTE)) {
    try {
      await sendProject(application, pathname.slice(PROJECT_ROUTE.length), method, response);
    } catch {
      sendJson(response, method, 500, {
        schemaVersion: 1,
        ok: false,
        error: {
          code: "PROJECT_UNAVAILABLE",
          message: "This project's business map could not be loaded.",
        },
      });
    }
    return;
  }
  if (pathname !== "/") {
    sendResponse(response, method, 404, "text/plain; charset=utf-8", "Not found\n");
    return;
  }

  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
  );
  sendResponse(response, method, 200, "text/html; charset=utf-8", application.render());
}

function sendJson(
  response: ServerResponse,
  method: string,
  status: number,
  value: object,
): void {
  sendResponse(
    response,
    method,
    status,
    "application/json; charset=utf-8",
    `${JSON.stringify(value)}\n`,
  );
}

async function sendProject(
  application: LocalWebApplication,
  projectId: string,
  method: string,
  response: ServerResponse,
): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  const result = await application.loadProject(projectId);
  if (!result.found) {
    sendJson(response, method, 404, {
      schemaVersion: 1,
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." },
    });
    return;
  }
  if (!result.ok) {
    sendJson(response, method, 422, {
      schemaVersion: 1,
      ok: false,
      error: { code: "PROJECT_UNAVAILABLE", message: result.message },
    });
    return;
  }
  sendJson(response, method, 200, {
    schemaVersion: 1,
    ok: true,
    data: result.data,
  });
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
