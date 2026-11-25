import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyboardInput } from "../src/input/KeyboardInput.js";
import { TouchInput } from "../src/input/TouchInput.js";

function pointer(target, type, id, x, y) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: id });
  target.dispatchEvent(event);
}

describe("Mobile combat gestures", () => {
  let keys, touch, stick, light, block, power, hitTest;
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="joystick-zone"><div id="joystick-outer"><div id="joystick-inner"></div></div></div>
      <button class="touch-btn" data-key="KeyZ">Light</button>
      <button class="touch-btn" data-key="KeyC">Block</button>
      <button class="touch-btn" data-key="KeyV"><span>Power</span></button>`;
    stick = document.getElementById("joystick-zone");
    [light, block, power] = document.querySelectorAll("button");
    vi.spyOn(document.getElementById("joystick-outer"), "getBoundingClientRect")
      .mockReturnValue({ left: 0, top: 0, width: 100, height: 100 });
    hitTest = vi.fn();
    document.elementFromPoint = hitTest;
    const engine = { gameActive: true, paused: false };
    keys = new KeyboardInput(engine);
    touch = new TouchInput(engine, keys);
    touch.init();
  });

  afterEach(() => {
    touch.destroy();
    delete document.elementFromPoint;
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("keeps a shallow diagonal grounded and makes a deliberate upward flick jump once", () => {
    pointer(stick, "pointerdown", 1, 63, 28);
    expect(stick.dataset.horizontal).toBe("right");
    expect(keys.isPressed("ArrowUp")).toBe(false);
    pointer(stick, "pointermove", 1, 60, 40);
    expect(keys.isPressed("ArrowRight")).toBe(true);
    pointer(stick, "pointermove", 1, 52, 50);
    expect(stick.dataset.horizontal).toBeUndefined();
    pointer(stick, "pointermove", 1, 25, 18);
    expect(stick.dataset.horizontal).toBe("left");
    expect(stick.dataset.jump).toBe("true");
    pointer(stick, "pointermove", 1, 41, 28);
    expect(keys.isPressed("ArrowUp")).toBe(true);
    expect(keys.isPressed("ArrowLeft")).toBe(true);
    pointer(stick, "pointerup", 1, 41, 28);
    expect(stick.dataset.jump).toBeUndefined();
    expect(stick.dataset.horizontal).toBeUndefined();
    expect(keys.isPressed("ArrowUp")).toBe(false);
    expect(keys.consumePress("ArrowUp")).toBe(true);
    expect(keys.consumePress("ArrowUp")).toBe(false);

    pointer(stick, "pointerdown", 2, 50, 8);
    pointer(stick, "pointercancel", 2, 50, 8);
    expect(keys.consumePress("ArrowUp")).toBe(false);
  });

  it("rolls a strike into guard on contact while the movement thumb stays engaged", () => {
    pointer(stick, "pointerdown", 1, 85, 48);
    pointer(light, "pointerdown", 2, 125, 25);
    hitTest.mockReturnValue(block);
    pointer(light, "pointermove", 2, 180, 25);
    expect(keys.consumePress("KeyZ")).toBe(true);
    expect(keys.isPressed("KeyZ")).toBe(false);
    expect(keys.isPressed("KeyC")).toBe(true);
    expect(light.classList.contains("pressed")).toBe(false);
    expect(block.classList.contains("pressed")).toBe(true);
    pointer(light, "pointerup", 2, 180, 25);
    expect(keys.isPressed("KeyC")).toBe(false);
    expect(keys.isPressed("ArrowRight")).toBe(true);
  });

  it("keeps Power within thumb-drift tolerance and cancels a charge when sliding off", () => {
    vi.spyOn(power, "getBoundingClientRect").mockReturnValue({ left: 100, right: 150, top: 0, bottom: 50 });
    pointer(power, "pointerdown", 3, 125, 25);
    hitTest.mockReturnValue(document.body);
    pointer(power, "pointermove", 3, 156, 25);
    expect(keys.isPressed("KeyV")).toBe(true);
    hitTest.mockReturnValue(power.firstElementChild);
    pointer(power, "pointermove", 3, 145, 25);
    expect(keys.consumePress("KeyV")).toBe(true);
    pointer(power, "pointermove", 3, 130, 25);
    expect(keys.consumePress("KeyV")).toBe(false);
    hitTest.mockReturnValue(null);
    pointer(power, "pointermove", 3, 175, 25);
    expect(keys.isPressed("KeyV")).toBe(false);
    expect(keys.consumeRelease("KeyV")).toBe(false);
    pointer(power, "pointermove", 3, 180, 24);
    hitTest.mockReturnValue(power);
    pointer(power, "pointermove", 3, 125, 25);
    pointer(power, "pointerup", 3, 125, 25);
    expect(keys.consumeRelease("KeyV")).toBe(true);
  });

  it("keeps a guard held until the last thumb leaves and cancels Power without casting", () => {
    pointer(block, "pointerdown", 1, 50, 25);
    pointer(power, "pointerdown", 2, 125, 25);
    hitTest.mockReturnValue(block);
    pointer(power, "pointermove", 2, 50, 25);
    expect(keys.consumeRelease("KeyV")).toBe(false);
    pointer(block, "pointerup", 1, 50, 25);
    expect(block.classList.contains("pressed")).toBe(true);
    expect(keys.isPressed("KeyC")).toBe(true);
    pointer(power, "lostpointercapture", 2, 50, 25);
    expect(block.classList.contains("pressed")).toBe(false);
    expect(keys.isPressed("KeyC")).toBe(false);
  });
});
