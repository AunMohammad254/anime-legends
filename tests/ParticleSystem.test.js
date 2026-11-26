import { afterEach, describe, expect, it, vi } from "vitest";
import { ParticleSystem } from "../src/vfx/ParticleSystem.js";

function arenaWithCanvas(reduced = false) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduced })));
  const arena = document.createElement("div");
  arena.innerHTML = '<canvas id="vfx-layer"></canvas>';
  const canvas = arena.firstElementChild;
  const ctx = { clearRect: vi.fn(), fillRect: vi.fn() };
  vi.spyOn(canvas, "getContext").mockReturnValue(ctx);
  const effects = new ParticleSystem(arena);
  return { arena, effects, canvas, ctx };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("arena effects", () => {
  it("draws the simulation once per paint and clears the last frame when the sparks expire", () => {
    const { effects, canvas, ctx } = arenaWithCanvas();
    vi.useFakeTimers();
    effects.emit(80, 25, 1, "red", 0, 100);
    vi.advanceTimersByTime(1000);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    effects.render(800, 400);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(400);
    expect(ctx.fillRect).toHaveBeenLastCalledWith(78, 273, 4, 4);
    expect(ctx.fillStyle).toBe("red");
    expect(ctx.globalAlpha).toBe(1);
    effects.update(50);
    effects.update(30);
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    effects.render(800, 400);
    expect(ctx.fillRect.mock.lastCall[1]).toBeGreaterThan(273);
    expect(ctx.globalAlpha).toBeLessThan(1);
    effects.update(20);
    effects.render(800, 400);
    effects.render(800, 400);
    expect(ctx.clearRect).toHaveBeenCalledTimes(3);
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  });

  it("bounds simultaneous sparks without adding DOM nodes and clears the canvas between fights", () => {
    const { effects, ctx, arena } = arenaWithCanvas();
    effects.emit(0, 0, 500, "red");
    effects.emit(0, 0, 500, "blue");
    effects.render(400, 200);
    const peak = ctx.fillRect.mock.calls.length;
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(100);
    expect(arena.children).toHaveLength(2);
    effects.clear();
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
    effects.emit(40, 10, 1, "green");
    effects.render(300, 600);
    expect(ctx.fillRect.mock.calls.length).toBe(peak + 1);
    expect(ctx.fillRect).toHaveBeenLastCalledWith(38, 438, 4, 4);
    expect(ctx.fillStyle).toBe("green");
    expect(ctx.globalAlpha).toBe(1);
  });

  it("keeps a stationary guard or punch marker with reduced motion and no decorative sparks", () => {
    const { effects, ctx, arena } = arenaWithCanvas(true);
    const marker = arena.querySelector(".melee-impact");
    vi.useFakeTimers();
    effects.emit(0, 0, 100, "white");
    effects.render(320, 240);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    effects.contact(75, 90, -1, "guard");
    expect(marker.hidden).toBe(false);
    expect(marker.dataset.kind).toBe("guard");
    expect(marker.style.left).toBe("75px");
    expect(marker.style.getPropertyValue("--strike-direction")).toBe("-1");
    vi.advanceTimersByTime(1000);
    expect(marker.hidden).toBe(false);
    effects.update(110);
    expect(marker.hidden).toBe(false);
    effects.update(10);
    expect(marker.hidden).toBe(true);
    effects.contact(120, 100, 1, "heavy");
    effects.update(125);
    expect(marker.hidden).toBe(false);
    effects.clear();
    expect(marker.hidden).toBe(true);
    expect(arena.querySelectorAll(".melee-impact")).toHaveLength(1);
  });

  it("keeps punch feedback available when the canvas layer is absent", () => {
    const arena = document.createElement("div");
    const effects = new ParticleSystem(arena);
    effects.emit(0, 0, 5, "white");
    effects.render(320, 480);
    effects.contact(30, 120, 1, "light");
    expect(arena.querySelector(".melee-impact").hidden).toBe(false);
  });
});
