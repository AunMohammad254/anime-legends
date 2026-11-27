import { createHash } from "node:crypto";
import { Pool } from "pg";
import { isValidProgress } from "../src/cloud/progressSchema.js";
import { createProgressStore } from "./progress-store.js";

const MAX_BYTES = 16 * 1024;
let store;

function getStore() {
  if (!process.env.DATABASE_URL) throw new Error("Missing database configuration");
  if (!store) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis: 10000,
      statement_timeout: 5000,
    });
    pool.on("error", () => console.error("Cloud save database connection interrupted."));
    store = createProgressStore(pool);
  }
  return store;
}

function reply(status, data, headers = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization", ...headers },
  });
}

function tooLarge() {
  return reply(413, { error: "Save exceeds the size limit." });
}

export async function handleProgress(request) {
  if (request.method !== "POST") return reply(405, { error: "Use POST." }, { Allow: "POST" });
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer ([0-9a-f]{64})$/.exec(authorization);
  if (!bearer) return reply(401, { error: "A valid save code is required." }, { "WWW-Authenticate": "Bearer" });
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return tooLarge();
  if (!request.body || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return reply(400, { error: "Send a JSON request body." });
  }

  let payload;
  try {
    let length = 0;
    const chunks = [];
    for await (const chunk of request.body) {
      length += chunk.byteLength;
      if (length > MAX_BYTES) return tooLarge();
      chunks.push(chunk);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, length));
    payload = JSON.parse(text);
  } catch {
    return reply(400, { error: "Invalid JSON body." });
  }

  const read = payload?.action === "read";
  const write = payload?.action === "write";
  if (!(read && Object.keys(payload).length === 1) && !(write && Object.keys(payload).length === 3
    && Number.isSafeInteger(payload.expectedRevision) && payload.expectedRevision >= 0
    && isValidProgress(payload.progress))) {
    return reply(400, { error: "Invalid save request." });
  }

  const keyHash = createHash("sha256").update(bearer[1]).digest("hex");
  try {
    const db = getStore();
    if (read) {
      const saved = await db.read(keyHash);
      return saved ? reply(200, saved) : reply(404, { error: "Save not found." });
    }
    const saved = await db.write(keyHash, payload.expectedRevision, payload.progress);
    return saved ? reply(200, saved) : reply(409, { error: "The cloud save changed. Load its latest revision." });
  } catch {
    return reply(503, { error: "Cloud saves are temporarily unavailable." });
  }
}
