import { describe, expect, it, vi } from "vitest";
import { ObjectPool } from "../src/utils/ObjectPool.js";

describe("ObjectPool", () => {
  it("preallocates a hundred objects by default", () => {
    const factory = vi.fn(() => ({}));
    const pool = new ObjectPool(factory);
    expect(factory).toHaveBeenCalledTimes(100);
    expect(pool.activeCount).toBe(0);
    expect(pool.poolSize).toBe(100);
  });

  it("expands on demand and recycles each acquired object exactly once", () => {
    const factory = vi.fn(() => ({}));
    const pool = new ObjectPool(factory, 1);
    const first = pool.acquire();
    const second = pool.acquire();
    expect(second).not.toBe(first);
    expect(pool.activeCount).toBe(2);
    expect(factory).toHaveBeenCalledTimes(2);
    pool.release({});
    pool.release(first);
    pool.release(first);
    expect(pool.activeCount).toBe(1);
    expect(pool.poolSize).toBe(1);
    expect(pool.acquire()).toBe(first);

    pool.releaseAll();
    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
    expect(pool.poolSize).toBe(2);
    expect(new Set([pool.acquire(), pool.acquire()])).toEqual(new Set([first, second]));
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
