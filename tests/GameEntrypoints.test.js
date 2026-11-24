import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import gamePage from "../game.html?raw";
import { CHARACTERS } from "../constants.js";

const touchEventProperty = Object.getOwnPropertyDescriptor(window, "ontouchstart");

beforeEach(() => {
  delete window.ontouchstart;
  vi.resetModules();
  localStorage.clear();
  document.body.className = "";
  document.body.innerHTML = new DOMParser().parseFromString(gamePage, "text/html").body.innerHTML;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete window.gameDebug;
  if (touchEventProperty) Object.defineProperty(window, "ontouchstart", touchEventProperty);
});

async function start(development, touchPoints = 0) {
  vi.stubEnv("DEV", development);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
    maxTouchPoints: touchPoints,
  }));
  const { engine } = await import("../engine.js");
  const { ui } = await import("../ui.js");
  const { state } = await import("../state.js");
  const initialize = vi.spyOn(engine, "init").mockImplementation(() => {});
  await import("../main.js");
  expect(initialize).toHaveBeenCalledOnce();
  return { engine, ui, state };
}

describe("game startup", () => {
  it("keeps the release menu in sync with saved purchases", async () => {
    const { state } = await start(false);
    expect(window.gameDebug).toBeUndefined();
    expect(document.body.classList.contains("mobile-optimized")).toBe(false);
    state.addShards(500);
    expect(document.querySelector("#shard-count").textContent).toBe("500");
    expect(state.buyCharacter("shadow")).toBe(true);
    expect(document.getElementById("fighter-shadow").textContent).toContain("Dark");
    expect(document.querySelector("#shard-count").textContent).toBe("0");
  });

  it("provides touch layout and the roster tools in development", async () => {
    const { engine, ui, state } = await start(true, 3);
    expect(document.body.classList.contains("mobile-optimized")).toBe(true);
    expect(window.gameDebug).toMatchObject({ engine, state, ui: ui.manager });
    window.gameDebug.addShards(75);
    expect(state.spiritShards).toBe(75);
    window.gameDebug.unlockAll();
    expect(CHARACTERS.every(({ id }) => state.isUnlocked(id))).toBe(true);
  });

  it("recognizes browsers exposing legacy touch events", async () => {
    vi.stubGlobal("ontouchstart", null);
    await start(false);
    expect(document.body.classList.contains("mobile-optimized")).toBe(true);
  });
});

describe("game controls", () => {
  it.each([true, false])("reflects the saved audio preference and toggles it, initially %s", async (enabled) => {
    localStorage.setItem("anime-audio", String(enabled));
    const { engine } = await start(false);
    const audio = document.querySelector(".audio-toggle");
    expect(audio.textContent).toBe(enabled ? "Sound on" : "Sound off");
    expect(audio.getAttribute("aria-pressed")).toBe(String(enabled));
    vi.spyOn(engine, "toggleAudio").mockReturnValue(!enabled);
    window.toggleAudio();
    expect(audio.textContent).toBe(enabled ? "Sound off" : "Sound on");
    expect(audio.getAttribute("aria-pressed")).toBe(String(!enabled));
  });

  it("routes page controls and the module interface to the active game manager", async () => {
    const { engine, ui } = await start(false);
    const audio = vi.spyOn(engine, "initAudio").mockImplementation(() => {});
    window.startGame();
    expect(audio).toHaveBeenCalledOnce();
    expect(ui.manager.screenManager.activeScreen).toBe("character-select");
    for (const [command, args] of [
      ["showScreen", ["shop"]], ["selectChar", ["blaze"]], ["setShopTab", ["skins"]],
      ["buyCharacter", ["shadow"]], ["buySkin", ["gold"]], ["toggleBoost", ["hp_up"]],
      ["setDifficulty", ["expert"]], ["setHealth", [200]], ["preBattleCutscene", []],
      ["initBattle", []], ["togglePause", []],
    ]) {
      const call = vi.spyOn(ui.manager, command).mockImplementation(() => {});
      window[command](...args);
      expect(call).toHaveBeenCalledExactlyOnceWith(...args);
      if (typeof ui[command] === "function") {
        call.mockClear();
        ui[command](...args);
        expect(call).toHaveBeenCalledExactlyOnceWith(...args);
      }
    }
    for (const [command, args] of [
      ["showModal", ["how-to-play"]], ["closeModal", []], ["toggleFullscreen", []],
    ]) {
      const call = vi.spyOn(ui.manager.screenManager, command).mockImplementation(() => {});
      window[command](...args);
      expect(call).toHaveBeenCalledExactlyOnceWith(...args);
    }
  });

  it("finishes survival only while a survival match is running", async () => {
    const { engine, ui } = await start(false);
    const finish = vi.spyOn(engine, "gameEnd").mockImplementation(() => {});
    window.endUnlimitedMode();
    engine.gameActive = true;
    window.endUnlimitedMode();
    expect(finish).not.toHaveBeenCalled();
    ui.manager.setHealth("unlimited");
    window.endUnlimitedMode();
    expect(finish).toHaveBeenCalledExactlyOnceWith("SURVIVAL_END");
  });
});
