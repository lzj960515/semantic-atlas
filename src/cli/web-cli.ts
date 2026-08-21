import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { inspectGitRepository } from "../repository/repository-inspector.js";
import { AtlasReadService } from "../web/application/atlas-read-service.js";
import { startLocalWebServer } from "../web/server/local-web-server.js";
import type { CliIo } from "./types.js";

const DEFAULT_WEB_PORT = 4310;

export interface ParsedWebArguments {
  readonly initialRepositoryPath: string | undefined;
  readonly port: number;
  readonly openBrowser: boolean;
}

export function parseWebArguments(
  arguments_: readonly string[],
  currentDirectory: string,
): ParsedWebArguments | undefined {
  const [command, ...options] = arguments_;
  if (command !== "web") {
    return undefined;
  }

  let initialRepositoryPath: string | undefined;
  let port = DEFAULT_WEB_PORT;
  let openBrowser = true;
  let hasPort = false;
  let hasNoOpen = false;
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index]!;
    if (option === "--repo") {
      if (initialRepositoryPath !== undefined) {
        throw new Error("--repo may only be provided once.");
      }
      const value = options[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error("--repo requires a directory path.");
      }
      initialRepositoryPath = resolve(currentDirectory, value);
      index += 1;
      continue;
    }
    if (option === "--port") {
      if (hasPort) {
        throw new Error("--port may only be provided once.");
      }
      const value = Number(options[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 65_535) {
        throw new Error("--port must be an integer from 1 through 65535.");
      }
      port = value;
      hasPort = true;
      index += 1;
      continue;
    }
    if (option === "--no-open") {
      if (hasNoOpen) {
        throw new Error("--no-open may only be provided once.");
      }
      openBrowser = false;
      hasNoOpen = true;
      continue;
    }
    throw new Error("semantic-atlas web accepts only --repo, --port, and --no-open.");
  }
  return { initialRepositoryPath, port, openBrowser };
}

export async function runWebCli(
  arguments_: readonly string[],
  io: CliIo,
  currentDirectory: string,
): Promise<number | undefined> {
  let invocation: ParsedWebArguments | undefined;
  try {
    invocation = parseWebArguments(arguments_, currentDirectory);
  } catch (error) {
    io.stderr.write(`semantic-atlas web: ${errorMessage(error)}\n`);
    return 2;
  }
  if (invocation === undefined) {
    return undefined;
  }

  try {
    const service = new AtlasReadService();
    const initialProjectId = invocation.initialRepositoryPath === undefined
      ? undefined
      : await resolveInitialProject(service, invocation.initialRepositoryPath);
    const server = await startLocalWebServer({
      readService: service,
      port: invocation.port,
    });
    const url = initialProjectId === undefined
      ? server.url
      : `${server.url}/?project=${encodeURIComponent(initialProjectId)}`;
    io.stdout.write(`Semantic Atlas Web is available at ${url}\n`);
    io.stdout.write("Press Ctrl+C to stop the local viewer.\n");
    installShutdownHandlers(server.close);
    if (invocation.openBrowser) {
      openDefaultBrowser(url, (error) => {
        io.stderr.write(`Could not open the default browser: ${errorMessage(error)}\n`);
      });
    }
    return 0;
  } catch (error) {
    io.stderr.write(`Semantic Atlas Web failed: ${errorMessage(error)}\n`);
    return 1;
  }
}

async function resolveInitialProject(
  service: AtlasReadService,
  repositoryPath: string,
): Promise<string> {
  const repository = await inspectGitRepository(repositoryPath);
  if (repository.gitDirectory !== repository.commonGitDirectory) {
    throw new Error("--repo must resolve to a primary main or master working tree");
  }
  const project = (await service.listProjects()).find(({ id }) => id === repository.repositoryId);
  if (project === undefined || project.root !== repository.worktreeRoot) {
    throw new Error("--repo must resolve to an indexed primary main or master working tree");
  }
  return project.id;
}

function installShutdownHandlers(close: () => Promise<void>): void {
  let closing = false;
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    void close().finally(() => {
      process.exitCode = 0;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function openDefaultBrowser(url: string, onError: (error: Error) => void): void {
  const command = process.platform === "darwin"
    ? { executable: "open", arguments: [url] }
    : process.platform === "win32"
      ? { executable: "cmd", arguments: ["/c", "start", "", url] }
      : { executable: "xdg-open", arguments: [url] };
  const child = spawn(command.executable, command.arguments, {
    detached: true,
    stdio: "ignore",
  });
  child.once("error", onError);
  child.unref();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
