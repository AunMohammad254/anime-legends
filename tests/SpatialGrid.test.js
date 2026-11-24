import { describe, expect, it } from "vitest";
import { SpatialGrid } from "../src/core/SpatialGrid.js";

describe("SpatialGrid", () => {
  it("groups collocated entities in the current frame and clears old buckets", () => {
    const grid = new SpatialGrid(300, 200);
    const a = { x: 99, y: 99 };
    const b = { x: 0, y: 0 };
    const c = { x: 100, y: 100 };

    expect(grid.query([a, b, c])).toEqual([[a, b]]);
    a.x = 101;
    a.y = 100;
    expect(grid.query([a, c])).toEqual([[a, c]]);
    expect(grid.getNearby(b)).not.toContain(b);
    grid.clear();
    expect(grid.getNearby(a)).toEqual([]);
  });

  it("keeps invalid coordinates out of adjacent rows and partial edge cells", () => {
    const grid = new SpatialGrid(205, 105, 50);
    const valid = { x: 204, y: 104 };
    const outside = [{ x: -1, y: 50 }, { x: 250, y: 0 }, { x: 205, y: 30 },
      { x: 201, y: 105 }, { x: 5, y: -1 }];
    for (const entity of [valid, ...outside]) grid.insert(entity);
    expect(grid.grid.flat()).toEqual([valid]);
  });

  it("returns only neighboring rows and columns at boundaries", () => {
    const grid = new SpatialGrid(400, 300);
    const focus = { x: 0, y: 101 };
    const diagonal = { x: 100, y: 0 };
    const farRight = { x: 399, y: 0 };
    grid.query([focus, diagonal, farRight]);
    expect(grid.getNearby(focus)).toEqual([diagonal, focus]);
    expect(grid.getNearby(farRight)).toEqual([farRight]);

    const oneCell = new SpatialGrid(80, 80);
    oneCell.insert(diagonal); // Outside this arena.
    oneCell.insert(focus); // Also outside this arena.
    const center = { x: 40, y: 40 };
    oneCell.insert(center);
    expect(oneCell.getNearby(center)).toEqual([center]);
  });
});
