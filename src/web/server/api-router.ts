import type { IncomingMessage, ServerResponse } from "node:http";

import { businessKeySchema } from "../../contracts/graph.js";
import {
  AtlasReadError,
  type AtlasReadOperations,
} from "../application/atlas-read-service.js";

const PROJECT_ID_PATTERN = /^[0-9a-f]{64}$/u;
const PROJECT_ROUTE_PATTERN = /^\/api\/v1\/projects\/([^/]+)\/(status|map|search|node)$/u;

class HttpApiError extends Error {
  constructor(
    readonly statusCode: 400 | 405 | 500,
    readonly code: "INVALID_REQUEST" | "METHOD_NOT_ALLOWED" | "INTERNAL_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "HttpApiError";
  }
}

export function createApiRequestHandler(
  service: AtlasReadOperations,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    void routeApiRequest(service, request, response);
  };
}

async function routeApiRequest(
  service: AtlasReadOperations,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      throw new HttpApiError(405, "METHOD_NOT_ALLOWED", "The resource supports GET only.");
    }
    if (url.pathname === "/api/v1/projects") {
      requireAllowedQuery(url, []);
      writeJson(response, 200, { data: { projects: await service.listProjects() } });
      return;
    }

    const route = PROJECT_ROUTE_PATTERN.exec(url.pathname);
    if (route === null) {
      throw invalidRequest("The requested API route is invalid.");
    }
    const repositoryId = route[1]!;
    const operation = route[2]!;
    if (!PROJECT_ID_PATTERN.test(repositoryId)) {
      throw invalidRequest("Expected an opaque Semantic Atlas project ID.");
    }
    if (operation === "status") {
      requireAllowedQuery(url, []);
      writeJson(response, 200, { data: await service.getStatus(repositoryId) });
      return;
    }
    if (operation === "map") {
      requireAllowedQuery(url, ["focus"]);
      const focus = optionalBusinessKey(url, "focus");
      writeJson(response, 200, {
        data: await service.getMap(repositoryId, focus),
      });
      return;
    }
    if (operation === "search") {
      requireAllowedQuery(url, ["q", "limit"]);
      const query = requiredQuery(url, "q").trim();
      if (query.length === 0) {
        throw invalidRequest("Search query q must not be empty.");
      }
      const limit = positiveIntegerQuery(url, "limit", 20, 100);
      writeJson(response, 200, {
        data: await service.searchBusiness(repositoryId, query, limit),
      });
      return;
    }

    requireAllowedQuery(url, ["key"]);
    const businessKey = requiredBusinessKey(url, "key");
    writeJson(response, 200, {
      data: await service.getBusinessNode(repositoryId, businessKey),
    });
  } catch (error) {
    writeApiError(response, error);
  }
}

function requiredQuery(url: URL, name: string): string {
  const values = url.searchParams.getAll(name);
  if (values.length !== 1 || values[0] === undefined) {
    throw invalidRequest(`Query parameter ${name} is required exactly once.`);
  }
  return values[0];
}

function optionalBusinessKey(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  if (values.length === 0) {
    return undefined;
  }
  if (values.length !== 1) {
    throw invalidRequest(`Query parameter ${name} may be provided once.`);
  }
  return parseBusinessKey(values[0]!, name);
}

function requiredBusinessKey(url: URL, name: string): string {
  return parseBusinessKey(requiredQuery(url, name), name);
}

function parseBusinessKey(value: string, name: string): string {
  const parsed = businessKeySchema.safeParse(value);
  if (!parsed.success) {
    throw invalidRequest(`Query parameter ${name} must be a business key.`);
  }
  return parsed.data;
}

function positiveIntegerQuery(
  url: URL,
  name: string,
  defaultValue: number,
  maximum: number,
): number {
  const values = url.searchParams.getAll(name);
  if (values.length === 0) {
    return defaultValue;
  }
  if (values.length !== 1) {
    throw invalidRequest(`Query parameter ${name} may be provided once.`);
  }
  const value = Number(values[0]);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw invalidRequest(`Query parameter ${name} must be an integer from 1 through ${maximum}.`);
  }
  return value;
}

function requireAllowedQuery(url: URL, allowed: readonly string[]): void {
  const allowedNames = new Set(allowed);
  for (const name of url.searchParams.keys()) {
    if (!allowedNames.has(name)) {
      throw invalidRequest(`Query parameter ${name} is not supported by this route.`);
    }
  }
}

function invalidRequest(message: string): HttpApiError {
  return new HttpApiError(400, "INVALID_REQUEST", message);
}

function writeApiError(response: ServerResponse, error: unknown): void {
  if (response.headersSent) {
    response.end();
    return;
  }
  if (error instanceof AtlasReadError || error instanceof HttpApiError) {
    writeJson(response, error.statusCode, {
      error: { code: error.code, message: error.message },
    });
    return;
  }
  writeJson(response, 500, {
    error: {
      code: "INTERNAL_ERROR",
      message: "Semantic Atlas could not complete the local request.",
    },
  });
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  contents: { readonly data: unknown } | { readonly error: unknown },
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify({ schemaVersion: 1, ...contents }));
}
