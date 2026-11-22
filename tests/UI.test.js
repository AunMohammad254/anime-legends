import { beforeEach, describe, expect, it, vi } from "vitest";
import gamePage from "../game.html?raw";
import { state } from "../state.js";
import { CHARACTERS } from "../constants.js";
import { engine } from "../engine.js";
import { UIManager } from "../src/ui/UIManager.js";
import { HUDRenderer } from "../src/ui/HUDRenderer.js";

describe("game screens", () => {
  let ui;
  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(gamePage, "text/html").body.innerHTML;
    state.clear();
    ui = new UIManager();
    ui.init();
  });

  it("starts with an unlocked fighter and a different CPU opponent", () => {
    expect(ui.selectedChar.id).toBe("blaze");
    expect(ui.cpuChar.id).not.toBe("blaze");
    expect(document.querySelectorAll("#char-grid button")).toHaveLength(CHARACTERS.length);
    expect(document.querySelector("#fight-btn").disabled).toBe(false);
  });

  it("opens the shop from a locked fighter, then unlocks it through the real purchase flow", () => {
    ui.selectChar("shadow");
    expect(ui.screenManager.activeScreen).toBe("shop");
    expect(document.activeElement.id).toBe("shop-shadow");
    ui.buyCharacter("shadow");
    expect(document.querySelector("#toast-container").textContent).toContain("need more");
    state.addShards(500);
    ui.buyCharacter("shadow");
    expect(document.querySelector("#shop-shadow").disabled).toBe(true);
    ui.showScreen("character-select");
    ui.selectChar("shadow");
    expect(ui.selectedChar.id).toBe("shadow");
    expect(state.spiritShards).toBe(0);
  });

  it("reflects balances and selected rules in each menu", () => {
    ui.updateShards(100);
    expect(document.querySelector("#shard-count").textContent).toBe("100");
    expect(document.querySelector("[data-balance]").textContent).toBe("100");
    ui.setDifficulty("hard");
    ui.setHealth("unlimited");
    expect(document.querySelector('[data-difficulty="hard"]').getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-health="unlimited"]').getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("#match-rules").textContent).toContain("waves");
  });

  it("saves the result and displays it on the leaderboard without interpreting saved names as HTML", () => {
    const player = { data: CHARACTERS[0], hp: 50, maxHp: 100 };
    const opponent = { data: CHARACTERS[1], hp: 0, maxHp: 100 };
    ui.handleGameEnd("VICTORY", player, opponent, 10);
    expect(document.querySelector("#result-char").textContent).toContain("Blaze Warrior wins");
    expect(state.data.highScores).toHaveLength(1);
    expect(state.spiritShards).toBeGreaterThan(0);
    state.data.highScores[0].name = "<i>saved name</i>";
    ui.showScreen("leaderboard");
    expect(document.querySelector("tbody").textContent).toContain("<i>saved name</i>");
    expect(document.querySelector("tbody i")).toBeNull();
  });

  it("abandons the battle when leaving the arena", () => {
    ui.showScreen("battle");
    const stop = vi.spyOn(engine, "stopBattle").mockImplementation(() => {});
    engine.gameActive = true;
    try {
      ui.showScreen("title");
      expect(stop).toHaveBeenCalledOnce();
    } finally {
      engine.gameActive = false;
      stop.mockRestore();
    }
  });

  it("keeps orb elements between frames while health and power change", () => {
    const hud = new HUDRenderer();
    const fighter = { data: CHARACTERS[0], hp: 99, maxHp: 100, power: 1, cooldowns: { ult: 0 } };
    hud.update(fighter, fighter, 59.2, 100);
    const firstOrb = document.querySelector("#p1-orbs .orb");
    fighter.power = 1.5;
    hud.update(fighter, fighter, 59, 100);
    expect(document.querySelector("#p1-orbs .orb")).toBe(firstOrb);
    expect(document.querySelectorAll("#p1-orbs .orb-inner")[1].style.height).toBe("50%");
    expect(document.querySelector("#p1-hp-text").textContent).toBe("99%");
  });
});
