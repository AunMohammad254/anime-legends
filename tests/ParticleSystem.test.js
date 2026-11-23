import { describe, expect, it, vi } from "vitest";
import { ParticleSystem } from "../src/vfx/ParticleSystem.js";

describe("Arena particle effects", () => {
  it("leaves the effects frozen during a pause and expires them in simulation time", () => {
    vi.useFakeTimers();
    try {
      const arena = document.createElement("div");
      const particles = new ParticleSystem(arena);
      particles.emit(80, 25, 1, "#fff", 0, 100);
      const spark = arena.firstElementChild;
      const origin = spark.style.transform;
      vi.advanceTimersByTime(1000);
      expect(spark.style.transform).toBe(origin);
      expect(spark.style.display).not.toBe("none");
      particles.update(80);
      expect(spark.style.transform).not.toBe(origin);
      expect(Number(spark.style.opacity)).toBeLessThan(1);
      particles.update(20);
      expect(spark.style.display).toBe("none");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reuses expired or cleared particles at full visibility with the new position and color", () => {
    const arena = document.createElement("div");
    const particles = new ParticleSystem(arena);
    particles.emit(10, 10, 2, "red", 0, 40);
    const previous = [...arena.children];
    particles.update(40);
    particles.emit(30, 20, 2, "blue", 0, 100);
    particles.clear(); // A rematch clears even effects that have not yet expired.
    expect(previous.every((el) => el.style.display === "none")).toBe(true);
    particles.emit(60, 40, 2, "gold");
    expect(arena.childElementCount).toBe(previous.length);
    for (const spark of previous) {
      expect(arena.contains(spark)).toBe(true);
      expect(spark.style.transform.replaceAll(" ", "")).toBe("translate(60px,-40px)");
      expect(spark.style.background).toBe("gold");
      expect(spark.style.display).not.toBe("none");
      expect(Number(spark.style.opacity || 1)).toBe(1);
    }
  });

  it("bounds the number of nodes for overlapping bursts across repeated fights", () => {
    const arena = document.createElement("div");
    const particles = new ParticleSystem(arena);
    particles.emit(0, 0, 500, "red");
    const peak = arena.childElementCount;
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(500);
    particles.emit(0, 0, 500, "blue");
    expect(arena.childElementCount).toBe(peak);
    particles.clear();
    particles.emit(100, 100, 500, "green");
    expect(arena.childElementCount).toBe(peak);
  });
});
