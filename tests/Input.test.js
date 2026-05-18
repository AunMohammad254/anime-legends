import { describe, it, expect, beforeEach, vi } from "vitest";
import { KeyboardInput } from "../src/input/KeyboardInput.js";

describe("KeyboardInput", () => {
  let keyboard;
  let engine;

  beforeEach(() => {
    engine = { togglePause: vi.fn() };
    keyboard = new KeyboardInput(engine);
    // Mock addEventListener/removeEventListener
    vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
    vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should initialize listeners", () => {
    keyboard.init();
    expect(window.addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(window.addEventListener).toHaveBeenCalledWith("keyup", expect.any(Function));
  });

  it("should update keyState on keydown", () => {
    const event = { code: "ArrowLeft", preventDefault: vi.fn() };
    keyboard.handleKeyDown(event);
    expect(keyboard.isPressed("ArrowLeft")).toBe(true);
  });

  it("should update keyState on keyup", () => {
    keyboard.setKeyState("ArrowLeft", true);
    const event = { code: "ArrowLeft" };
    keyboard.handleKeyUp(event);
    expect(keyboard.isPressed("ArrowLeft")).toBe(false);
  });

  it("should prevent default for specific keys", () => {
    const event = { code: "ArrowUp", preventDefault: vi.fn() };
    keyboard.handleKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("should toggle pause on Escape", () => {
    const event = { code: "Escape", preventDefault: vi.fn() };
    keyboard.handleKeyDown(event);
    expect(engine.togglePause).toHaveBeenCalled();
  });
});
