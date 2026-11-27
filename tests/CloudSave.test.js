import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameState } from "../src/core/GameState.js";
import { CloudSave } from "../src/cloud/CloudSave.js";

const key = "anime_legends_cloud";
const code = "ab".repeat(32);
const secondCode = "91".repeat(32);

function response(status, data) {
  return { status, ok: status === 200, json: async () => data };
}

function gate() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

describe("Cloud save synchronization", () => {
  let game, cloud, rows, events, exchange, fetcher;

  beforeEach(() => {
    localStorage.clear();
    game = new GameState();
    cloud = new CloudSave(game);
    events = new EventTarget();
    vi.spyOn(window, "addEventListener").mockImplementation((...args) => events.addEventListener(...args));
    vi.spyOn(crypto, "getRandomValues").mockImplementation(bytes => bytes.fill(0xab));
    rows = new Map();
    exchange = (path, options) => {
      expect(path).toBe("/api/progress");
      const id = options.headers.Authorization.slice("Bearer ".length);
      const body = JSON.parse(options.body);
      const record = rows.get(id);
      if (body.action === "read") return record ? response(200, record) : response(404);
      if (body.expectedRevision !== (record?.revision ?? 0)) return response(409);
      const saved = { revision: body.expectedRevision + 1, progress: body.progress };
      rows.set(id, saved);
      return response(200, saved);
    };
    fetcher = vi.fn(exchange);
    vi.stubGlobal("fetch", fetcher);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function put(id, shards, revision = 1) {
    rows.set(id, { revision, progress: { ...game.data, spiritShards: shards } });
  }

  it("remains offline-only until enabled, then backs up the current save and each gameplay change", async () => {
    const listener = vi.fn();
    const unsubscribe = cloud.subscribe(listener);
    await cloud.start();
    game.addShards(17);
    expect(fetcher).not.toHaveBeenCalled();
    expect(cloud.view).toEqual({ status: "off", code: "" });
    expect(await cloud.enable()).toBe(true);
    expect(rows.get(code).progress.spiritShards).toBe(17);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", credentials: "omit" });
    expect(JSON.parse(localStorage.getItem(game.storageKey))).not.toHaveProperty("code");
    game.addShards(8);
    expect(await cloud.retry()).toBe(true);
    expect(rows.get(code)).toMatchObject({ revision: 2, progress: { spiritShards: 25 } });
    expect(listener.mock.lastCall[0]).toEqual({ status: "saved", code });
    unsubscribe();
    listener.mockClear();
    cloud.disconnect();
    expect(listener).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBeNull();
    expect(game.spiritShards).toBe(25);
  });

  it("replays a journal after a lost ACK and reload, including subsequent offline play", async () => {
    await cloud.start();
    game.addShards(40);
    fetcher.mockImplementationOnce((...args) => {
      exchange(...args);
      return Promise.reject(new TypeError("Connection closed"));
    });
    expect(await cloud.enable()).toBe(false);
    expect(cloud.view).toEqual({ code, status: "offline" });
    expect(rows.get(code).revision).toBe(1);
    // Another match finishes before the recovering tab starts.
    const nextGame = new GameState();
    nextGame.addShards(10);
    const nextTab = new CloudSave(nextGame);
    expect(await nextTab.start()).toBe(true);
    expect(rows.get(code)).toMatchObject({ revision: 2, progress: { spiritShards: 50 } });
    expect(JSON.parse(localStorage.getItem(key)).pending).toBeNull();
  });

  it("pulls clean external updates and retries network errors on returning online", async () => {
    await cloud.start();
    await cloud.enable();
    put(code, 25, 2);
    fetcher.mockResolvedValueOnce(response(503));
    expect(await cloud.retry()).toBe(false);
    expect(game.spiritShards).toBe(0);
    events.dispatchEvent(new Event("online"));
    await cloud.retry();
    expect(game.spiritShards).toBe(25);
    expect(cloud.view.status).toBe("saved");
  });

  it("protects divergent progress and can explicitly restore a chosen backup", async () => {
    await cloud.start();
    await cloud.enable();
    put(code, 21, 2);
    game.addShards(30);
    expect(await cloud.retry()).toBe(false);
    expect(cloud.view.status).toBe("conflict");
    expect(game.spiritShards).toBe(30);
    expect(rows.get(code).progress.spiritShards).toBe(21);
    fetcher.mockClear();
    game.addShards(2);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await cloud.restore(" " + code.toUpperCase() + " ")).toBe(true);
    expect(game.spiritShards).toBe(21);
    expect(cloud.view).toEqual({ status: "saved", code });
  });

  it("rejects invalid, absent, malformed, and unpersistable restores without touching the existing save or link", async () => {
    game.addShards(9);
    await cloud.enable();
    const old = localStorage.getItem(key);
    expect(await cloud.restore("short")).toBe(false);
    expect(cloud.view.status).toBe("invalid-code");
    expect(await cloud.restore(secondCode)).toBe(false);
    expect(cloud.view.status).toBe("not-found");
    fetcher.mockResolvedValueOnce(response(200, { revision: 1, progress: { spiritShards: 82 } }));
    expect(await cloud.restore(secondCode)).toBe(false);
    expect(cloud.view.status).toBe("offline");
    put(secondCode, 100);
    vi.spyOn(game, "replaceProgress").mockReturnValue(false);
    expect(await cloud.restore(secondCode)).toBe(false);
    expect(cloud.view.status).toBe("storage-error");
    expect(localStorage.getItem(key)).toBe(old);
    expect(game.spiritShards).toBe(9);
  });

  it("coalesces writes while one is uploading and observes play started by a saved-status listener", async () => {
    await cloud.start();
    await cloud.enable();
    const upload = gate();
    fetcher.mockImplementationOnce((...args) => upload.promise.then(() => exchange(...args)));
    game.addShards(8);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    game.addShards(3);
    let earned = false;
    cloud.subscribe(view => {
      if (view.status === "saved" && !earned) {
        earned = true;
        game.addShards(4);
      }
    });
    upload.resolve();
    await vi.waitFor(() => expect(rows.get(code).progress.spiritShards).toBe(15));
    expect(await cloud.retry()).toBe(true);
  });

  it("retains local changes made while waiting for an explicit restore or an automatic pull", async () => {
    await cloud.start();
    put(secondCode, 50);
    const read = gate();
    fetcher.mockReturnValueOnce(read.promise);
    const restore = cloud.restore(secondCode);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    game.addShards(7);
    read.resolve(response(200, rows.get(secondCode)));
    expect(await restore).toBe(false);
    expect(cloud.view).toEqual({ code: "", status: "conflict" });
    await cloud.enable();
    put(code, 80, 2);
    const pull = gate();
    fetcher.mockReturnValueOnce(pull.promise);
    const retry = cloud.retry();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    game.addShards(2);
    pull.resolve(response(200, rows.get(code)));
    expect(await retry).toBe(false);
    expect(cloud.view.status).toBe("conflict");
    expect(game.spiritShards).toBe(9);
  });

  it("stops stale operations after unlink, superseding restore, or another tab changing linkage", async () => {
    await cloud.start();
    const unused = cloud.restore(code);
    cloud.disconnect();
    expect(await unused).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();

    put(secondCode, 55);
    const older = gate();
    fetcher.mockReturnValueOnce(older.promise);
    const first = cloud.restore(code);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(await cloud.restore(secondCode)).toBe(true);
    older.reject(new Error("Old request failed"));
    expect(await first).toBe(false);
    expect(cloud.view).toEqual({ status: "saved", code: secondCode });

    const late = gate();
    fetcher.mockReturnValueOnce(late.promise);
    const change = cloud.enable();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    localStorage.removeItem(key);
    late.resolve(response(200, { revision: 1, progress: game.data }));
    expect(await change).toBe(false);
    await cloud.retry();
    expect(cloud.view).toEqual({ code: "", status: "off" });
  });

  it("refreshes linkage from another tab on storage events, retaining newer local scores", async () => {
    await cloud.start();
    const other = new CloudSave(game);
    await other.enable();
    events.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    expect(cloud.view.status).toBe("off");
    events.dispatchEvent(new StorageEvent("storage", { key }));
    await cloud.retry();
    expect(cloud.view.code).toBe(code);
    game.addShards(5);
    events.dispatchEvent(new StorageEvent("storage", { key: game.storageKey }));
    await cloud.retry();
    expect(rows.get(code).progress.spiritShards).toBe(5);
    localStorage.clear();
    events.dispatchEvent(new StorageEvent("storage", { key: null }));
    await cloud.retry();
    expect(cloud.view.code).toBe("");
  });

  it.each(["restore", "retry"])("ignores a successful %s response that arrives after disconnect", async method => {
    game.addShards(18);
    await cloud.enable();
    put(secondCode, 99);
    const read = gate();
    fetcher.mockClear().mockReturnValueOnce(read.promise);
    const pending = method === "restore" ? cloud.restore(secondCode) : cloud.retry();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    cloud.disconnect();
    read.resolve(response(200, rows.get(secondCode)));
    expect(await pending).toBe(false);
    expect(cloud.view).toEqual({ status: "off", code: "" });
    expect(game.spiritShards).toBe(18);
  });

  it("reports blocked or malformed metadata without disrupting gameplay", async () => {
    localStorage.setItem(key, "{}");
    expect(await cloud.start()).toBe(false);
    expect(cloud.view.status).toBe("storage-error");
    localStorage.setItem(key, "{");
    expect(await cloud.retry()).toBe(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    expect(await cloud.enable()).toBe(false);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    cloud.disconnect();
    expect(cloud.view.status).toBe("storage-error");
    game.addShards(4);
    expect(game.spiritShards).toBe(4);
  });

  it("recovers a missing or damaged local save without overwriting the last cloud revision", async () => {
    game.addShards(45);
    await cloud.enable();
    for (const damaged of [null, "{", "{}"]) {
      if (damaged === null) localStorage.removeItem(game.storageKey);
      else localStorage.setItem(game.storageKey, damaged);
      fetcher.mockClear();
      const device = new GameState();
      expect(await new CloudSave(device).start()).toBe(true);
      expect(device.spiritShards).toBe(45);
      expect(rows.get(code).revision).toBe(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ action: "read" });
    }
  });

  it("plays offline from the last linked save after device data is lost, then backs up the new earnings", async () => {
    game.addShards(45);
    await cloud.enable();
    localStorage.removeItem(game.storageKey);
    const device = new GameState();
    const sync = new CloudSave(device);
    vi.spyOn(device, "replaceProgress").mockReturnValueOnce(false);
    expect(await sync.start()).toBe(false);
    expect(sync.view.status).toBe("storage-error");
    fetcher.mockRejectedValue(new Error("Offline"));
    expect(await sync.retry()).toBe(false);
    expect(device.spiritShards).toBe(45);
    device.addShards(5);
    expect(await sync.retry()).toBe(false);
    expect(rows.get(code).progress.spiritShards).toBe(45);
    // A second interrupted session can also recover the pending offline earnings.
    localStorage.removeItem(game.storageKey);
    const reopened = new GameState();
    const resumed = new CloudSave(reopened);
    expect(await resumed.start()).toBe(false);
    expect(reopened.spiritShards).toBe(50);
    fetcher.mockImplementation(exchange);
    expect(await resumed.retry()).toBe(true);
    expect(rows.get(code).progress.spiritShards).toBe(50);
  });

  it("finishes an interrupted restore across both storage keys, unless the player made a new save", async () => {
    game.addShards(12);
    await cloud.enable();
    const link = JSON.parse(localStorage.getItem(key));
    const incoming = { ...JSON.parse(link.base), spiritShards: 45 };
    put(code, 45, 2);
    const marker = { ...link, revision: 2, base: JSON.stringify(incoming), restoreFrom: link.base };
    const stage = () => localStorage.setItem(key, JSON.stringify(marker));
    stage();
    const device = new GameState();
    const sync = new CloudSave(device);
    vi.spyOn(device, "replaceProgress").mockReturnValueOnce(false);
    expect(await sync.start()).toBe(false);
    expect(sync.view.status).toBe("storage-error");
    expect(device.spiritShards).toBe(12);
    expect(await sync.retry()).toBe(true);
    expect(device.spiritShards).toBe(45);
    expect(JSON.parse(localStorage.getItem(key))).not.toHaveProperty("restoreFrom");
    stage(); // The incoming save was already applied, but the final metadata write was interrupted.
    expect(await sync.retry()).toBe(true);
    device.addShards(2);
    await sync.retry();
    stage();
    expect(await sync.retry()).toBe(false);
    expect(sync.view.status).toBe("conflict");
    expect(device.spiritShards).toBe(47);
  });

  it("refuses damaged restore journals rather than uploading the device save", async () => {
    await cloud.enable();
    const link = JSON.parse(localStorage.getItem(key));
    for (const change of [
      { code: "bad" }, { revision: -1 }, { revision: 0 }, { base: 5 },
      { base: "{}" }, { pending: "{" }, { restoreFrom: "{}" },
      { revision: 0, base: null, restoreFrom: link.base },
    ]) {
      localStorage.setItem(key, JSON.stringify({ ...link, ...change }));
      fetcher.mockClear();
      expect(await cloud.retry()).toBe(false);
      expect(cloud.view.status).toBe("storage-error");
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("rejects inconsistent successful responses and never loops on an unchanged conflicting revision", async () => {
    fetcher.mockResolvedValueOnce(response(200, { revision: 2, progress: game.data }));
    expect(await cloud.enable()).toBe(false);
    fetcher.mockResolvedValueOnce(response(200, { revision: 1, progress: { ...game.data, spiritShards: 77 } }));
    expect(await cloud.retry()).toBe(false);
    expect(await cloud.retry()).toBe(true);
    game.addShards(3);
    fetcher.mockResolvedValueOnce(response(409));
    expect(await cloud.retry()).toBe(false);
    expect(cloud.view.status).toBe("offline");
    expect(rows.get(code).progress.spiritShards).toBe(0);
  });
});
