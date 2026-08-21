import { describe, expect, it, vi } from "vitest";

import { loadCachedValue } from "../../src/web/client/map-cache.js";

describe("interactive map cache", () => {
  it("shares one pending focused-map read and retains its resolved value", async () => {
    const values = new Map<string, string>();
    const pending = new Map<string, Promise<string>>();
    let resolve!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((done) => { resolve = done; }));

    const first = loadCachedValue(values, pending, "business-map-browsing", load);
    const second = loadCachedValue(values, pending, "business-map-browsing", load);

    expect(load).toHaveBeenCalledOnce();
    expect(second).toBe(first);
    resolve("focused map");
    await expect(first).resolves.toBe("focused map");
    await expect(loadCachedValue(values, pending, "business-map-browsing", load))
      .resolves.toBe("focused map");
    expect(load).toHaveBeenCalledOnce();
  });

  it("clears a failed pending read so the region can be retried", async () => {
    const values = new Map<string, string>();
    const pending = new Map<string, Promise<string>>();
    const rejected = vi.fn(() => Promise.reject(new Error("temporary read failure")));

    await expect(loadCachedValue(values, pending, "orders", rejected)).rejects.toThrow("temporary read failure");
    await expect(loadCachedValue(values, pending, "orders", async () => "retried map"))
      .resolves.toBe("retried map");
  });
});
