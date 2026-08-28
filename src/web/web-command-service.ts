import { spawn } from "node:child_process";
import { MapApplication } from "../application/map-application.js";
import { LocalWebApplication } from "./local-web-application.js";
import { startLocalWebServer, type LocalWebServer } from "./local-web-server.js";

export interface StartWebOptions {
  readonly repositoryPaths: readonly string[];
  readonly port: number;
  readonly openBrowser: boolean;
}

export interface WebSessionData {
  readonly url: string;
  readonly repositoryCount: number;
}

export class WebCommandService {
  public constructor(private readonly mapApplication: MapApplication) {}

  public async start(options: StartWebOptions): Promise<WebSessionData> {
    const application = new LocalWebApplication(this.mapApplication, options.repositoryPaths);
    const server = await startLocalWebServer({ application, port: options.port });
    installShutdownHandlers(server);
    if (options.openBrowser) openDefaultBrowser(server.url);
    return {
      url: server.url,
      repositoryCount: server.repositoryCount,
    };
  }
}

function installShutdownHandlers(server: LocalWebServer): void {
  let closing = false;
  const close = (): void => {
    if (closing) return;
    closing = true;
    void server.close().finally(() => {
      process.exitCode = 0;
    });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

function openDefaultBrowser(url: string): void {
  const command = process.platform === "darwin"
    ? { executable: "open", arguments: [url] }
    : process.platform === "win32"
      ? { executable: "cmd", arguments: ["/c", "start", "", url] }
      : { executable: "xdg-open", arguments: [url] };
  const child = spawn(command.executable, command.arguments, {
    detached: true,
    stdio: "ignore",
  });
  child.once("error", () => {
    // The printed loopback URL remains usable when the desktop opener is unavailable.
  });
  child.unref();
}
