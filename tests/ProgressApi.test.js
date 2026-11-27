// @vitest-environment node
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handleProgress } from "../server/progress.js";
import vercel from "../api/progress.js";
import netlify from "../netlify/functions/progress.js";

const fake = vi.hoisted(() => ({ query: vi.fn(), on: vi.fn() }));
vi.mock("pg", () => ({ Pool: class { constructor() { return fake; } } }));

const code = "af".repeat(32);
const snapshot = {
  spiritShards: 3, bestCombo: 0, unlockedCharacters:["blaze"], unlockedSkins:["default"],
  activeSkinId:"default", unlockedBoosts:[], activeBoosts:[], highScores:[],
};
const write = {action:"write", expectedRevision:0, progress:snapshot};
function request(body, headers = {}) {
  return new Request("https://game.example/api/progress", {
    method:"POST", headers:{"content-type":"application/json",authorization:`Bearer ${code}`,...headers},
    body:typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body),
  });
}
describe("progress HTTP API", () => {
  beforeAll(() => vi.stubEnv("DATABASE_URL","postgresql://example/db"));
  afterAll(() => vi.unstubAllEnvs());
  beforeEach(() => { fake.query.mockReset(); });

  it("binds both hosts to the same endpoint and allows only POST", async () => {
    for (const handler of [vercel.fetch, netlify]) {
      const res = await handler(new Request("https://game.example/api/progress"));
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
      expect(res.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("requires a case-sensitive lowercase hex code", async () => {
    const missing = request({action:"read"});
    missing.headers.delete("authorization");
    expect((await handleProgress(missing)).status).toBe(401);
    expect((await handleProgress(request({action:"read"},{authorization:"Bearer "+code.toUpperCase()}))).status).toBe(401);
    expect(fake.query).not.toHaveBeenCalled();
  });

  it("bounds streamed and declared sizes before querying Postgres", async () => {
    expect((await handleProgress(request({action:"read"},{"content-length":"1000000"}))).status).toBe(413);
    expect((await handleProgress(request("x".repeat(16385)))).status).toBe(413);
    expect(fake.query).not.toHaveBeenCalled();
  });

  it("rejects unsupported media, invalid encoding, and empty JSON", async () => {
    const noType=request({action:"read"});
    noType.headers.delete("content-type");
    for (const input of [
      noType, request({action:"read"},{"content-type":"text/html"}), request(undefined),
      request("{"),request(Uint8Array.of(0xff)),
    ]) expect((await handleProgress(input)).status).toBe(400);
    expect(fake.query).not.toHaveBeenCalled();
  });

  it.each([null, [], {action:"no"}, {action:"read",progress:0}, {action:"write"},
    {...write,expectedRevision:-1},{...write,expectedRevision:"0"},{...write,progress:{}}])(
    "rejects malformed operation %j", async payload => {
      expect((await handleProgress(request(payload))).status).toBe(400);
      expect(fake.query).not.toHaveBeenCalled();
    },
  );

  it("fails temporarily when DATABASE_URL is not configured", async () => {
    const configured = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect((await handleProgress(request({action:"read"}))).status).toBe(503);
    } finally {
      process.env.DATABASE_URL=configured;
    }
  });

  it("writes and reads the exact returned snapshot, passing only its key digest to storage", async () => {
    const saved={ revision:1,progress:snapshot };
    const hash=createHash("sha256").update(code).digest("hex");
    fake.query.mockResolvedValue({rows:[saved]});
    const created=await handleProgress(request(write));
    expect(created.status).toBe(200);
    expect(await created.json()).toEqual(saved);
    expect(fake.query.mock.calls[0][1]).toEqual([hash,snapshot]);
    const read=await handleProgress(request({action:"read"},{"content-type":"application/json; charset=UTF-8"}));
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual(saved);
    expect(fake.query.mock.calls[1][1]).toEqual([hash]);
    expect(read.headers.get("vary")).toBe("Authorization");
    const [,idleError]=fake.on.mock.calls.find(([event])=>event==="error");
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try { idleError(new Error(code)); expect(log.mock.calls.flat().join(" ")).not.toContain(code); }
    finally { log.mockRestore(); }
  });

  it("distinguishes a missing record, write conflict, and temporary database outage", async () => {
    fake.query.mockResolvedValue({rows:[]});
    expect((await handleProgress(request({action:"read"}))).status).toBe(404);
    expect((await handleProgress(request(write))).status).toBe(409);
    fake.query.mockRejectedValue(new Error("postgres connection failed"));
    const unavailable=await handleProgress(request(write));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("postgres connection failed");
  });
});
