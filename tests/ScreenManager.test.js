import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import gamePage from "../game.html?raw";
import { ScreenManager } from "../src/ui/ScreenManager.js";

const byId = (id) => document.getElementById(id);

describe("screen navigation", () => {
  let ui;
  let screens;
  let listeners;
  let cleanups;

  // Fullscreen APIs differ by browser, and jsdom does not implement them.
  function provide(object, key, value) {
    const original = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { configurable: true, value });
    cleanups.push(() => {
      if (original) Object.defineProperty(object, key, original);
      else delete object[key];
    });
  }

  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(gamePage, "text/html").body.innerHTML;
    ui = { togglePause: vi.fn(), showToast: vi.fn() };
    screens = new ScreenManager(ui);
    cleanups = [];
    listeners = vi.spyOn(window, "addEventListener");
  });

  afterEach(() => {
    for (const [type, handler, options] of listeners.mock.calls) {
      window.removeEventListener(type, handler, options);
    }
    listeners.mockRestore();
    cleanups.reverse().forEach((cleanup) => cleanup());
    vi.unstubAllGlobals();
  });

  it("shows just the selected screen, resets its scroll and moves keyboard focus", () => {
    const shop = byId("screen-shop");
    shop.scrollTop = 250;
    screens.showScreen("shop");
    expect([...document.querySelectorAll(".screen.active")]).toEqual([shop]);
    expect(shop.scrollTop).toBe(0);
    expect(document.activeElement).toBe(shop.querySelector("h2"));

    // The matchup has no heading. In battle focus must stay out of the pause dialog.
    for (const id of ["vs", "battle"]) {
      screens.showScreen(id);
      expect(document.activeElement).toBe(byId(`screen-${id}`));
    }
  });

  it("rejects missing screens and elements that are outside the game screen list", () => {
    screens.showScreen("unknown");
    const other = document.createElement("div");
    other.id = "screen-unknown";
    document.body.append(other);
    screens.showScreen("unknown");
    expect(screens.activeScreen).toBe("title");
    expect([...document.querySelectorAll(".screen.active")]).toEqual([byId("screen-title")]);
  });

  it("changes touch controls with device orientation and hides them in the menus", () => {
    provide(navigator, "maxTouchPoints", 1);
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
    screens.init();
    screens.showScreen("battle");
    expect(byId("screen-battle").classList.contains("portrait-mode")).toBe(true);
    expect(byId("touch-controls").classList.contains("active")).toBe(false);

    vi.stubGlobal("innerWidth", 844);
    vi.stubGlobal("innerHeight", 390);
    window.dispatchEvent(new Event("resize"));
    expect(byId("screen-battle").classList.contains("portrait-mode")).toBe(false);
    expect(byId("touch-controls").classList.contains("active")).toBe(true);

    screens.showScreen("title");
    expect(byId("touch-controls").classList.contains("active")).toBe(false);
  });

  it("uses the coarse-pointer media query when touch point counts are unavailable", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("matchMedia", matchMedia);
    vi.stubGlobal("innerWidth", 600);
    vi.stubGlobal("innerHeight", 360);
    screens.showScreen("battle");
    expect(matchMedia).toHaveBeenCalledWith("(any-pointer: coarse)");
    expect(byId("touch-controls").classList.contains("active")).toBe(true);
    matchMedia.mockReturnValue({ matches: false });
    screens.applyBattleTouchLayout();
    expect(byId("touch-controls").classList.contains("active")).toBe(false);
  });

  it("closes help on a backdrop click while leaving clicks on the instructions alone", () => {
    const help = byId("modal-how-to-play");
    help.showModal = vi.fn(() => { help.open = true; });
    help.close = vi.fn(() => { help.open = false; });
    screens.init();
    screens.showModal("how-to-play");
    expect(help.open).toBe(true);
    help.querySelector("h2").click();
    expect(help.open).toBe(true);
    help.click();
    expect(help.open).toBe(false);
    expect(help.close).toHaveBeenCalledOnce();
  });

  it("sends a native pause cancellation through the resume action", () => {
    screens.init();
    const cancel = new Event("cancel", { cancelable: true });
    byId("pause-modal").dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(ui.togglePause).toHaveBeenCalledOnce();
  });

  it("tolerates optional screens, controls and dialogs being absent", () => {
    const title = byId("screen-title");
    document.body.replaceChildren(title);
    byId("fullscreen-btn").remove();
    screens.init();
    screens.showScreen("title");
    screens.showModal("how-to-play");
    screens.closeModal();
    expect(document.activeElement).toBe(title.querySelector("h1"));
  });

  it.each([
    ["fullscreenEnabled", "requestFullscreen", "fullscreenElement", "exitFullscreen"],
    ["webkitFullscreenEnabled", "webkitRequestFullscreen", "webkitFullscreenElement", "webkitExitFullscreen"],
  ])("enters and exits fullscreen when the browser supports %s", async (enabled, enter, element, exit) => {
    const root = document.documentElement;
    provide(document, enabled, true);
    const request = vi.fn();
    const leave = vi.fn();
    provide(root, enter, request);
    provide(document, exit, leave);
    screens.init();
    expect(byId("fullscreen-btn").hidden).toBe(false);
    await screens.toggleFullscreen();
    expect(request).toHaveBeenCalledOnce();
    provide(document, element, root);
    await screens.toggleFullscreen();
    expect(leave).toHaveBeenCalledOnce();
  });

  it("hides the fullscreen control without an API and tolerates unavailable methods", async () => {
    screens.init();
    expect(byId("fullscreen-btn").hidden).toBe(true);
    await screens.toggleFullscreen();
    provide(document, "webkitFullscreenElement", document.documentElement);
    await screens.toggleFullscreen();
    expect(ui.showToast).not.toHaveBeenCalled();
  });

  it("explains when a browser denies fullscreen", async () => {
    provide(document.documentElement, "requestFullscreen", vi.fn().mockRejectedValue(new Error("denied")));
    await screens.toggleFullscreen();
    expect(ui.showToast).toHaveBeenCalledWith("Fullscreen is unavailable in this browser.");
  });
});
