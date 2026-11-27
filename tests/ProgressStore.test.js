// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createProgressStore } from "../server/progress-store.js";

describe("PostgreSQL save adapter", () => {
  const hash = "1".repeat(64);
  const progress = { spiritShards: 10 };

  it("returns the row from the database and passes values as bound parameters", async () => {
    const row = { revision: 2, progress };
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    const store = createProgressStore({ query });
    expect(await store.read(hash)).toEqual(row);
    expect(query.mock.lastCall[1]).toEqual([hash]);
    expect(await store.write(hash, 0, progress)).toEqual(row);
    expect(query.mock.lastCall[1]).toEqual([hash, progress]);
    expect(await store.write(hash, 1, progress)).toEqual(row);
    expect(query.mock.lastCall[1]).toEqual([hash, 1, progress]);
  });

  it("represents a missing record or lost update as an empty result", async () => {
    const store = createProgressStore({ query: vi.fn().mockResolvedValue({ rows: [] }) });
    expect(await store.read(hash)).toBeNull();
    expect(await store.write(hash, 0, progress)).toBeNull();
    expect(await store.write(hash, 8, progress)).toBeNull();
  });
});
