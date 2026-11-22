import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyboardInput } from "../src/input/KeyboardInput.js";
import { TouchInput } from "../src/input/TouchInput.js";

function key(type, code, options = {}, target = window) {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}

function pointer(element, type, id, x = 0, y = 0) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: id });
  element.dispatchEvent(event);
}

describe("Battle input", () => {
  let engine;
  let keyboard;
  let touch;

  beforeEach(() => {
    engine = { gameActive: true, paused: false, togglePause: vi.fn() };
    keyboard = new KeyboardInput(engine);
    keyboard.init();
    touch = new TouchInput(engine, keyboard);
  });

  afterEach(() => {
    touch.destroy();
    keyboard.destroy();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("tracks held movement and buffers brief attack presses for one simulation step", () => {
    expect(key("keydown", "ArrowLeft").defaultPrevented).toBe(true);
    expect(keyboard.isPressed("ArrowLeft")).toBe(true);
    key("keyup", "ArrowLeft");
    expect(keyboard.isPressed("ArrowLeft")).toBe(false);

    key("keydown", "KeyZ");
    key("keyup", "KeyZ");
    expect(keyboard.consumePress("KeyZ")).toBe(true);
    expect(keyboard.consumePress("KeyZ")).toBe(false);

    const now = vi.spyOn(performance, "now").mockReturnValue(100);
    key("keydown", "KeyX");
    now.mockReturnValue(500);
    expect(keyboard.consumePress("KeyX")).toBe(false);
  });

  it("keeps menu navigation and browser shortcuts available", () => {
    engine.gameActive = false;
    expect(key("keydown", "Space").defaultPrevented).toBe(false);
    expect(key("keydown", "Escape").defaultPrevented).toBe(false);
    expect(engine.togglePause).not.toHaveBeenCalled();

    engine.gameActive = true;
    expect(key("keydown", "KeyX", { ctrlKey: true }).defaultPrevented).toBe(false);
    const button = document.createElement("button");
    document.body.append(button);
    expect(key("keydown", "Space", {}, button).defaultPrevented).toBe(false);
    expect(keyboard.isPressed("Space")).toBe(false);
  });

  it("handles Escape once per press and allows resuming while paused", () => {
    expect(key("keydown", "Escape").defaultPrevented).toBe(true);
    key("keydown", "Escape", { repeat: true });
    expect(engine.togglePause).toHaveBeenCalledTimes(1);
    engine.paused = true;
    key("keydown", "KeyC");
    expect(keyboard.isPressed("KeyC")).toBe(false);
    key("keydown", "Escape");
    expect(engine.togglePause).toHaveBeenCalledTimes(2);
  });

  it("clears held and buffered inputs when focus is lost and pauses a hidden battle", () => {
    key("keydown", "ArrowRight");
    key("keydown", "KeyX");
    window.dispatchEvent(new Event("blur"));
    expect(keyboard.isPressed("ArrowRight")).toBe(false);
    expect(keyboard.consumePress("KeyX")).toBe(false);
    key("keydown", "ArrowRight", { repeat: true });
    expect(keyboard.isPressed("ArrowRight")).toBe(false);

    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(engine.togglePause).toHaveBeenCalledOnce();
  });

  it.each(["", "portrait-"])("allows simultaneous joystick and action input in the '%s' layout", (prefix) => {
    document.body.innerHTML = `<div id="${prefix}joystick-zone">
      <div id="${prefix}joystick-outer"><div id="${prefix}joystick-inner"></div></div>
      </div><button class="touch-btn" data-key="KeyV">Power</button>`;
    const zone = document.getElementById(prefix + "joystick-zone");
    const outer = document.getElementById(prefix + "joystick-outer");
    const button = document.querySelector("button");
    vi.spyOn(outer, "getBoundingClientRect").mockReturnValue({ left: 100, top: 100, width: 100, height: 100 });
    touch.init();
    pointer(zone, "pointerdown", 1, 195, 150);
    pointer(button, "pointerdown", 2);
    pointer(zone, "pointerdown", 3, 110, 150);
    expect(keyboard.isPressed("ArrowRight")).toBe(true);
    expect(keyboard.isPressed("KeyV")).toBe(true);
    pointer(button, "pointerup", 2);
    expect(keyboard.consumeRelease("KeyV")).toBe(true);
    pointer(zone, "pointermove", 1, 150, 100);
    expect(keyboard.isPressed("ArrowUp")).toBe(true);
    pointer(zone, "pointercancel", 1);
    expect(keyboard.isPressed("ArrowUp")).toBe(false);
    expect(keyboard.isPressed("ArrowRight")).toBe(false);
  });

  it("keeps keyboard and touch holds independent and clears cancelled touch gestures", () => {
    document.body.innerHTML = '<button class="touch-btn" data-key="KeyV">Power</button>';
    const button = document.querySelector("button");
    touch.init();

    key("keydown", "KeyV");
    pointer(button, "pointerdown", 1);
    pointer(button, "pointerup", 1);
    expect(keyboard.isPressed("KeyV")).toBe(true);
    expect(keyboard.consumeRelease("KeyV")).toBe(false);
    key("keyup", "KeyV");
    expect(keyboard.consumeRelease("KeyV")).toBe(true);

    pointer(button, "pointerdown", 2);
    window.dispatchEvent(new Event("orientationchange"));
    expect(button.classList.contains("pressed")).toBe(false);
    expect(keyboard.isPressed("KeyV")).toBe(false);
    expect(keyboard.consumeRelease("KeyV")).toBe(false);
    expect(keyboard.consumePress("KeyV")).toBe(false);

    engine.paused = true;
    pointer(button, "pointerdown", 3);
    expect(keyboard.isPressed("KeyV")).toBe(false);
  });

  it("detaches input handlers cleanly", () => {
    keyboard.destroy();
    key("keydown", "ArrowLeft");
    expect(keyboard.isPressed("ArrowLeft")).toBe(false);
  });
});
