import { afterEach, describe, expect, it, vi } from "vitest";
import { Renderer } from "../src/core/Renderer.js";
import { PerformanceMonitor } from "../src/utils/PerformanceMonitor.js";
import { Config } from "../src/utils/Config.js";

function drawingContext() {
  return {
    save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(),
    fillRect: vi.fn(), fillText: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("canvas rendering", () => {
  it("clears the arena and paints visible rectangles and sprites in depth order", () => {
    const context = drawingContext();
    const { WIDTH: width, HEIGHT: height, FLOOR_Y: floor } = Config.ARENA;
    const renderer = new Renderer({ width, height, getContext: () => context });
    const sprite = document.createElement("img");
    const bounds = { x: 3, y: floor, w: 4, h: 6 };
    const entities = [
      { ...bounds, sprite, z: 3 },
      { ...bounds, color: "pink", visible: false, z: -1 },
      { ...bounds, color: "red" },
      { ...bounds },
    ];

    renderer.clear();
    renderer.drawBatch(entities);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, width, height);
    expect(context.fillRect).toHaveBeenCalledExactlyOnceWith(3, floor, 4, 6);
    expect(context.fillStyle).toBe("red");
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(sprite, 3, floor, 4, 6);
    expect(context.fillRect).toHaveBeenCalledBefore(context.drawImage);
    expect(context.save).toHaveBeenCalledBefore(context.fillRect);
    expect(context.restore).toHaveBeenCalledAfter(context.drawImage);
  });

  it("tracks changed HUD values even when a canvas is unavailable", () => {
    const renderer = new Renderer(null);
    renderer.clear();
    renderer.drawBatch([{ color: "red" }]);
    const hud = { hp: 100 };
    expect(renderer.updateHUD(hud)).toBe(true);
    expect(renderer.updateHUD({ hp: 100 })).toBe(false);
    hud.hp = 80;
    expect(renderer.updateHUD(hud)).toBe(true);
    renderer.dirty = false;
    renderer.markDirty();
    expect(renderer.dirty).toBe(true);
  });
});

describe("frame statistics overlay", () => {
  it("averages the latest 60 frames, marks slow frames, and shows optional heap usage", () => {
    let now = 0;
    const timing = { now: () => now };
    vi.stubGlobal("performance", timing);
    const monitor = new PerformanceMonitor();
    const context = drawingContext();
    now = 100;
    monitor.update();
    monitor.render(context);
    expect(monitor.getStats()).toEqual({ fps: Config.PERFORMANCE.TARGET_FPS, frameTime: 0, memory: "N/A" });
    expect(context.save).not.toHaveBeenCalled();

    expect(monitor.toggle()).toBe(true);
    monitor.update();
    monitor.render(context);
    expect(context.fillText).toHaveBeenCalledWith("FPS: 10", 20, 35);
    expect(context.fillStyle).toBe("#ff4444");
    timing.memory = { usedJSHeapSize: 2621440 };
    for (let i = 0; i < 60; i++) {
      now += 10;
      monitor.update();
    }
    expect(monitor.getStats()).toEqual({ fps: 100, frameTime: "10.00", memory: "2.50" });
    monitor.render(null);
    monitor.render(context, 30, 40);
    expect(context.fillText).toHaveBeenCalledWith("Frame: 10.00ms", 40, 85);
    expect(context.fillText).toHaveBeenCalledWith("Mem: 2.50MB", 40, 105);
    expect(context.fillStyle).toBe("#44ff44");
    expect(context.restore).toHaveBeenCalledTimes(2);
    expect(monitor.toggle()).toBe(false);
  });
});
