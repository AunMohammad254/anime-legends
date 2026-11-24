import { describe, it, expect } from "vitest";
import { Physics } from "../src/core/Physics.js";

describe("Physics", () => {
  describe("checkCollision", () => {
    it("detects overlapping rectangles", () => {
      const a = { x: 0, y: 0, w: 50, h: 50 };
      const b = { x: 25, y: 25, w: 50, h: 50 };
      expect(Physics.checkCollision(a, b)).toBe(true);
    });

    it("returns false for non-overlapping rectangles", () => {
      const a = { x: 0, y: 0, w: 50, h: 50 };
      const b = { x: 100, y: 100, w: 50, h: 50 };
      expect(Physics.checkCollision(a, b)).toBe(false);
    });

    it("handles edge touching", () => {
      const a = { x: 0, y: 0, w: 50, h: 50 };
      const b = { x: 50, y: 0, w: 50, h: 50 };
      expect(Physics.checkCollision(a, b)).toBe(false);
    });
  });

  describe("resolveCollision", () => {
    it("constrains entity within left bound", () => {
      const entity = { x: -10, y: 0, w: 50, h: 50 };
      const bounds = { left: 0, right: 800, top: 0, bottom: 600 };
      Physics.resolveCollision(entity, bounds);
      expect(entity.x).toBe(0);
    });

    it.each([
      [-1, 0], [200, 180], [0, 0], [180, 180], [40, 40],
    ])("clamps y=%i within the ceiling and floor to %i", (y, expected) => {
      const entity = { x: 45, y, w: 10, h: 20 };
      Physics.resolveCollision(entity, { left: 0, right: 100, top: 0, bottom: 200 });
      expect(entity).toEqual({ x: 45, y: expected, w: 10, h: 20 });
    });

    it("constrains entity within right bound", () => {
      const entity = { x: 800, y: 0, w: 50, h: 50 };
      const bounds = { left: 0, right: 800, top: 0, bottom: 600 };
      Physics.resolveCollision(entity, bounds);
      expect(entity.x).toBe(750);
    });
  });

  describe("applyGravity", () => {
    it("increases vertical velocity", () => {
      const entity = { vy: 0 };
      Physics.applyGravity(entity, 0.5);
      expect(entity.vy).toBe(0.5);
    });

    it("uses default gravity", () => {
      const entity = { vy: 0 };
      Physics.applyGravity(entity);
      expect(entity.vy).toBe(0.5);
    });
  });

  describe("applyFriction", () => {
    it("reduces horizontal velocity", () => {
      const entity = { vx: 10 };
      Physics.applyFriction(entity);
      expect(entity.vx).toBe(8.5);
    });
  });
});
