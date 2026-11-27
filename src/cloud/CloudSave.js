import { isValidProgress } from "./progressSchema.js";

const storageKey = "anime_legends_cloud";
const codePattern = /^[0-9a-f]{64}$/;

// PostgreSQL JSON objects can arrive in a different key order to a browser save.
function snapshot(progress) {
  return JSON.stringify(progress, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
    }
    return value;
  });
}

function isSnapshot(text) {
  return typeof text === "string" && isValidProgress(JSON.parse(text));
}

function readRecord() {
  try {
    const record = JSON.parse(localStorage.getItem(storageKey));
    if (record === null) return null;
    if (codePattern.test(record.code) && Number.isSafeInteger(record.revision) && record.revision >= 0 &&
        (record.revision === 0 ? record.base === null : isSnapshot(record.base)) &&
        (record.pending === null || isSnapshot(record.pending)) &&
        (!Object.hasOwn(record, "restoreFrom") || (record.revision > 0 && isSnapshot(record.restoreFrom)))) return record;
  } catch {
    // Storage may be blocked or contain an incomplete record.
  }
  throw new Error("storage-error");
}

function store(record) {
  try {
    if (record) localStorage.setItem(storageKey, JSON.stringify(record));
    else localStorage.removeItem(storageKey);
  } catch {
    throw new Error("storage-error");
  }
}

async function request(code, body) {
  const response = await fetch("/api/progress", {
    method: "POST", credentials: "omit", cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(12000),
    headers: { Authorization: "Bearer " + code, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 404) throw new Error("not-found");
  if (response.status === 409 && body.action === "write") return null;
  if (!response.ok) throw new Error("offline");
  const result = await response.json();
  if (!Number.isSafeInteger(result?.revision) || result.revision < 1 || !isValidProgress(result.progress)) {
    throw new Error("offline");
  }
  return result;
}

export class CloudSave {
  constructor(state) {
    this.state = state;
    this.record = null;
    this.status = "off";
    this.listeners = new Set();
    this.epoch = 0;
    this.active = null;
  }

  get view() {
    return { code: this.record?.code ?? "", status: this.status };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.view);
    return () => this.listeners.delete(listener);
  }

  show(status) {
    this.status = status;
    for (const listener of this.listeners) listener(this.view);
    return status === "saved";
  }

  start() {
    this.state.on("progressSaved", () => {
      if (this.record && this.status !== "conflict") {
        this.localChanged = true;
        this.retry();
      }
    });
    window.addEventListener("online", () => this.retry());
    window.addEventListener("storage", event => {
      if (event.key === storageKey || event.key === this.state.storageKey || event.key === null) this.retry();
    });
    return this.retry();
  }

  local() {
    this.state.load();
    return snapshot(this.state.data);
  }

  persist(record) {
    store(record);
    this.record = record;
  }

  run(operation) {
    const epoch = ++this.epoch;
    // Start in a microtask so callers in the same turn share the registered operation.
    const task = Promise.resolve().then(async () => {
      if (epoch !== this.epoch) return false;
      try {
        return await operation(epoch);
      } catch (error) {
        if (epoch === this.epoch) {
          this.show(["not-found", "storage-error"].includes(error.message) ? error.message : "offline");
        }
        return false;
      }
    }).finally(() => {
      if (epoch === this.epoch) {
        this.active = null;
        if (this.localChanged && this.status === "saved" && this.local() !== this.record.base) this.retry();
        this.localChanged = false;
      }
    });
    this.active = task;
    return task;
  }

  // Re-read the link after each network await. A restore or unlink in another tab takes precedence.
  current(epoch) {
    if (this.epoch !== epoch) return false;
    const actual = readRecord();
    if (JSON.stringify(actual) === JSON.stringify(this.record)) return true;
    this.active = null;
    this.retry();
    return false;
  }

  enable() {
    return this.run(epoch => {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const code = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
      this.persist({ code, revision: 0, base: null, pending: null });
      return this.reconcile(epoch);
    });
  }

  restore(input) {
    return this.run(async epoch => {
      const code = input.trim().toLowerCase();
      if (!codePattern.test(code)) return this.show("invalid-code");
      this.record = readRecord();
      const initial = this.local();
      this.show("syncing");
      const remote = await request(code, { action: "read" });
      if (!this.current(epoch)) return false;
      if (initial !== this.local()) return this.show("conflict");
      this.install(code, remote);
      return this.show("saved");
    });
  }

  disconnect() {
    ++this.epoch;
    this.active = null;
    try {
      this.persist(null);
      this.show("off");
    } catch {
      this.show("storage-error");
    }
  }

  install(code, remote) {
    const previous = this.record;
    const next = { code, revision: remote.revision, base: snapshot(remote.progress), pending: null };
    // A restore changes two storage keys. Journal the old device snapshot first
    // so a reload or another tab cannot upload it under the incoming code.
    this.persist({ ...next, restoreFrom: this.local() });
    if (!this.state.replaceProgress(remote.progress)) {
      this.persist(previous);
      throw new Error("storage-error");
    }
    this.persist(next);
  }

  retry() {
    if (this.active) return this.active;
    return this.run(epoch => {
      this.record = readRecord();
      if (!this.record) return this.show("off");
      return this.reconcile(epoch);
    });
  }

  async reconcile(epoch) {
    this.show("syncing");
    if (this.record.restoreFrom) {
      const { restoreFrom, ...link } = this.record;
      const local = this.local();
      if (!this.state.needsRecovery && local !== restoreFrom && local !== link.base) return this.show("conflict");
      if (!this.state.replaceProgress(JSON.parse(link.base))) throw new Error("storage-error");
      this.persist(link);
    }
    let checkRemote = true;
    for (;;) {
      const record = this.record;
      const local = this.local();
      const dirty = record.pending !== null || record.revision === 0 || (!this.state.needsRecovery && record.base !== local);
      if (!dirty && !checkRemote) return this.show("saved");
      checkRemote = false;

      const sent = record.pending ?? local;
      let remote;
      if (dirty) {
        // Journal the exact request before sending it. If its ACK is lost, a later
        // attempt can identify the committed snapshot even after another match.
        if (record.pending === null) this.persist({ ...record, pending: sent });
        remote = await request(record.code, { action: "write", expectedRevision: record.revision, progress: JSON.parse(sent) });
        if (!this.current(epoch)) return false;
        if (remote && (remote.revision !== record.revision + 1 || snapshot(remote.progress) !== sent)) {
          return this.show("offline");
        }
      }
      if (!remote) {
        remote = await request(record.code, { action: "read" });
        if (!this.current(epoch)) return false;
      }
      if (remote.revision < record.revision || (dirty && remote.revision === record.revision)) {
        return this.show("offline");
      }
      const received = snapshot(remote.progress);
      const latest = this.local();
      if (this.state.needsRecovery) {
        // A missing or damaged browser save is a reason to recover from the
        // cloud. Uploading a normalized empty game would erase the backup.
        this.install(record.code, remote);
      } else if (received !== sent && received !== latest && received !== record.base) {
        if (dirty || latest !== record.base) return this.show("conflict");
        this.install(record.code, remote);
      } else {
        this.persist({ code: record.code, revision: remote.revision, base: received, pending: null });
      }
    }
  }
}
