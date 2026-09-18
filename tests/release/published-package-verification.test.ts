import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const scriptPath = fileURLToPath(
  new URL("../../scripts/verify-published-package.mjs", import.meta.url),
);
const version = "2.5.0";
let visibleAfterMs = 0;
let incompleteMetadata = false;
let latestVersion = version;
let hangs = false;
let output: string[] = [];

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.stubEnv("RELEASE_VERSION", version);
  visibleAfterMs = 0;
  incompleteMetadata = false;
  latestVersion = version;
  hangs = false;
  output = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  vi.mocked(spawn).mockImplementation((_command, arguments_, options) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    if (hangs) {
      const timeout = (options as SpawnOptions).timeout;
      if (timeout) setTimeout(() => child.emit("close", null, "SIGKILL"), timeout);
    } else {
      Promise.resolve().then(() => {
        if (Date.now() < visibleAfterMs) {
          child.stderr.end("npm error code E404: version is not visible yet");
          child.emit("close", 1, null);
          return;
        }
        const values: Record<string, string> = {
          version,
          "dist-tags.latest": latestVersion,
          "dist.shasum": "published-shasum",
          "dist.integrity": "published-integrity",
        };
        if (incompleteMetadata) delete values["dist.integrity"];
        const fields = (arguments_ as string[]).slice(2).filter((value) => !value.startsWith("--"));
        const response =
          fields.length === 1
            ? values[fields[0]!]
            : Object.fromEntries(
                fields.filter((field) => field in values).map((field) => [field, values[field]]),
              );
        child.stdout.end(JSON.stringify(response));
        child.emit("close", 0, null);
      });
    }
    return child as unknown as ChildProcess;
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(spawn).mockReset();
});

async function startVerification() {
  const completion = import(scriptPath).then(
    () => ({ error: undefined }),
    (error: unknown) => ({ error }),
  );
  await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
  return { completion };
}

describe("public npm visibility verification", () => {
  it("waits for a version that becomes visible after the old one-minute window", async () => {
    visibleAfterMs = 130_000;
    const { completion } = await startVerification();
    await vi.advanceTimersByTimeAsync(130_000);
    expect((await completion).error).toBeUndefined();
    expect(output.join("")).toContain("E404");
    expect(output.join("")).toContain("130s");
    expect(output.join("")).toContain(`Verified public semantic-atlas@${version}`);
  });

  it("fails with the last registry error when the five-minute deadline expires", async () => {
    visibleAfterMs = Infinity;
    const { completion } = await startVerification();
    await vi.advanceTimersByTimeAsync(300_000);
    expect((await completion).error).toEqual(
      expect.objectContaining({
        message: expect.stringMatching(/300s.*E404/su),
      }),
    );
    expect(output.join("")).not.toContain("Verified public");
  });

  it("does not accept visible metadata without package integrity", async () => {
    incompleteMetadata = true;
    const { completion } = await startVerification();
    await vi.advanceTimersByTimeAsync(300_000);
    expect((await completion).error).toBeInstanceOf(Error);
    expect(output.join("")).not.toContain("Verified public");
  });

  it("keeps checking when the version exists but latest still points to the previous release", async () => {
    latestVersion = "2.4.0";
    const { completion } = await startVerification();
    await vi.advanceTimersByTimeAsync(300_000);
    expect((await completion).error).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("npm latest has not reached the release"),
      }),
    );
    expect(output.join("")).not.toContain("Verified public");
  });

  it("bounds a stalled npm request by the remaining verification deadline", async () => {
    hangs = true;
    let finished = false;
    const { completion } = await startVerification();
    void completion.then(() => {
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(finished).toBe(true);
    expect((await completion).error).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("300s"),
      }),
    );
  });
});
