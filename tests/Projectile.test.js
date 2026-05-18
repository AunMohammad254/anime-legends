import { describe, it, expect } from "vitest";
import { Projectile } from "../src/entities/Projectile.js";

describe("Projectile", () => {
  describe("constructor", () => {
    it("initializes with correct properties", () => {
      const proj = new Projectile({
        x: 100,
        y: 200,
        vx: 5,
        vy: 3,
        color: "#ff0000",
        dmg: 20,
      });

      expect(proj.x).toBe(100);
      expect(proj.y).toBe(200);
      expect(proj.vx).toBe(5);
      expect(proj.vy).toBe(3);
      expect(proj.dmg).toBe(20);
      expect(proj.active).toBe(true);
    });

    it("uses default values", () => {
      const proj = new Projectile({ x: 0, y: 0, color: "#fff" });
      expect(proj.vx).toBe(0);
      expect(proj.vy).toBe(0);
      expect(proj.dmg).toBe(10);
    });
  });

  describe("update", () => {
    it("updates position based on velocity", () => {
      const proj = new Projectile({ x: 0, y: 0, vx: 5, vy: 3, color: "#fff" });
      proj.update(16);
      expect(proj.x).toBe(5);
      expect(proj.y).toBe(3);
    });
  });

  describe("isOffScreen", () => {
    it("detects off-screen projectiles", () => {
      const proj = new Projectile({ x: -10, y: 0, color: "#fff" });
      expect(proj.isOffScreen({ width: 800, height: 600 })).toBe(true);
    });

    it("returns false for on-screen projectiles", () => {
      const proj = new Projectile({ x: 100, y: 100, color: "#fff" });
      expect(proj.isOffScreen({ width: 800, height: 600 })).toBe(false);
    });
  });

  describe("deactivate", () => {
    it("sets active to false", () => {
      const proj = new Projectile({ x: 0, y: 0, color: "#fff" });
      proj.deactivate();
      expect(proj.active).toBe(false);
    });
  });
});
