import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import gamePage from "../game.html?raw";
import { GameState } from "../src/core/GameState.js";
import { CHARACTERS } from "../constants.js";
import { engine } from "../engine.js";
import { UIManager } from "../src/ui/UIManager.js";
import { HUDRenderer } from "../src/ui/HUDRenderer.js";

// Each screen instance subscribes to its own real save state.
let state;
vi.mock("../state.js", () => ({ get state() { return state; } }));

const byId = (id) => document.getElementById(id);

describe("game screens", () => {
  let ui;
  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(gamePage, "text/html").body.innerHTML;
    localStorage.clear();
    state = new GameState();
    vi.useFakeTimers();
    ui = new UIManager();
    ui.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    engine.gameActive = false;
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
    const player = { data: CHARACTERS[0], hp: 50, maxHp: 100, bestCombo: 1 };
    const opponent = { data: CHARACTERS[1], hp: 0, maxHp: 100 };
    ui.handleGameEnd("VICTORY", player, opponent, 10);
    expect(document.querySelector("#result-char").textContent).toContain("Blaze Warrior wins");
    expect(byId("match-combo").textContent).toBe("1 hit");
    expect(byId("personal-combo").textContent).toBe("1 hit");
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

  it("charges for a skin once and offers the previous skin again", () => {
    ui.showScreen("shop");
    ui.setShopTab("skins");
    expect(byId("shop-default").disabled).toBe(true);
    ui.buySkin("gold");
    expect(byId("toast-container").textContent).toMatch(/need more/i);
    state.addShards(300);
    byId("shop-gold").focus();
    ui.buySkin("gold");
    expect(byId("shop-gold").disabled).toBe(true);
    expect(byId("shop-default").textContent).toBe("Equip");
    expect(document.activeElement.dataset.tab).toBe("skins");
    ui.buySkin("default");
    ui.buySkin("gold");
    expect(state.data.activeSkinId).toBe("gold");
    expect(state.spiritShards).toBe(0);
  });

  it("keeps keyboard focus on a boost while buying, unequipping and re-equipping it", () => {
    ui.showScreen("shop");
    ui.setShopTab("boosts");
    byId("shop-hp_up").focus();
    ui.toggleBoost("hp_up");
    expect(byId("toast-container").textContent).toMatch(/need more/i);
    state.addShards(200);
    ui.toggleBoost("hp_up");
    expect(document.activeElement).toBe(byId("shop-hp_up"));
    expect(byId("shop-hp_up").textContent).toBe("Unequip");
    ui.toggleBoost("hp_up");
    expect(byId("shop-hp_up").textContent).toBe("Equip");
    expect(byId("toast-container").textContent).toContain("unequipped");
    ui.toggleBoost("hp_up");
    expect(state.isBoostActive("hp_up")).toBe(true);
    expect(state.spiritShards).toBe(0);
  });

  it("refreshes the open menu after another tab buys a fighter, records a score or resets progress", () => {
    function loadExternalSave(changes) {
      localStorage.setItem(state.storageKey, JSON.stringify({ ...state.data, ...changes }));
      state.load();
    }
    ui.showScreen("shop");
    loadExternalSave({ spiritShards: 300, unlockedCharacters: ["blaze", "shadow"] });
    expect(byId("shop-shadow").textContent).toBe("Owned");
    expect(byId("shard-count").textContent).toBe("300");

    ui.showScreen("leaderboard");
    expect(byId("leaderboard-content").textContent).toContain("first score");
    loadExternalSave({ highScores: [{ name: "Shadow Ninja", score: 2500, date: "2025-01-01" }] });
    expect(byId("leaderboard-content").textContent).toContain("Shadow Ninja");

    ui.showScreen("character-select");
    byId("fighter-shadow").focus();
    ui.selectChar("shadow");
    loadExternalSave({ unlockedCharacters: ["blaze", "shadow", "frost"] });
    expect(document.activeElement).toBe(byId("fighter-shadow"));
    expect(byId("fighter-frost").textContent).toContain("Ice");
    loadExternalSave({ unlockedCharacters: ["blaze"] });
    expect(byId("fighter-blaze").getAttribute("aria-pressed")).toBe("true");
    expect(byId("fighter-shadow").getAttribute("aria-pressed")).toBe("false");
  });

  it("warns once about unavailable storage and dismisses the warning after a few seconds", () => {
    state.emit("storageUnavailable");
    const warning = byId("toast-container").firstElementChild;
    expect(warning.textContent).toContain("this session");
    state.emit("storageUnavailable");
    expect(byId("toast-container").firstElementChild).toBe(warning);
    vi.advanceTimersByTime(3500);
    expect(warning.isConnected).toBe(false);
  });

  it("ignores unknown screens and catalog items and prevents repeat fighter purchases", () => {
    ui.showScreen("missing");
    ui.selectChar("missing");
    ui.buyCharacter("missing");
    ui.buyCharacter("blaze");
    ui.buySkin("missing");
    ui.toggleBoost("missing");
    expect(ui.screenManager.activeScreen).toBe("title");
    expect(ui.selectedChar.id).toBe("blaze");
    expect(state.spiritShards).toBe(0);
    expect(byId("toast-container").textContent).toBe("");
  });

  it("allows roster and settings panels to render before selection or when a panel is absent", () => {
    const setup = new UIManager();
    setup.renderCharSelect();
    expect(byId("char-grid").children.length).toBe(CHARACTERS.length);
    setup.preBattleCutscene();
    expect(setup.screenManager.activeScreen).toBe("title");
    byId("char-grid").remove();
    byId("match-rules").remove();
    setup.selectChar("blaze");
    setup.setHealth(200);
    expect(setup.selectedChar.id).toBe("blaze");
    expect(setup.matchHealth).toBe(200);
  });

  it("shows the matchup once, starts a configured battle and cancels a matchup left early", () => {
    const start = vi.spyOn(engine, "startBattle").mockImplementation(() => {});
    ui.setDifficulty("expert");
    expect(byId("match-rules").textContent).toContain("final boss");
    ui.preBattleCutscene();
    expect(byId("vs-p1").textContent).toContain(ui.selectedChar.name);
    expect(byId("vs-cpu").textContent).toContain(ui.cpuChar.name);
    ui.showScreen("title");
    vi.advanceTimersByTime(1200);
    expect(start).not.toHaveBeenCalled();

    ui.setHealth("unlimited");
    ui.preBattleCutscene();
    vi.advanceTimersByTime(500);
    ui.preBattleCutscene();
    vi.advanceTimersByTime(500);
    expect(start).toHaveBeenCalledExactlyOnceWith(ui.selectedChar, ui.cpuChar, "expert", "unlimited");
    expect(byId("end-unlimited-btn").hidden).toBe(false);
    expect(byId("round-text").textContent).toBe("Fight!");
    vi.advanceTimersByTime(850);
    expect(byId("round-text").style.opacity).toBe("0");
  });

  it("opens and closes the pause dialog only in an active battle and restores focus on resume", () => {
    const dialog = byId("pause-modal");
    dialog.showModal = vi.fn(() => { dialog.open = true; });
    dialog.close = vi.fn(() => { dialog.open = false; });
    const toggle = vi.spyOn(engine, "togglePause");
    ui.togglePause();
    engine.gameActive = true;
    ui.togglePause();
    expect(toggle).not.toHaveBeenCalled();
    ui.showScreen("battle");

    toggle.mockReturnValue(true);
    ui.togglePause();
    ui.togglePause();
    expect(dialog.open).toBe(true);
    expect(dialog.showModal).toHaveBeenCalledOnce();
    toggle.mockReturnValue(false);
    ui.togglePause();
    ui.togglePause();
    expect(dialog.close).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(byId("screen-battle"));

    toggle.mockReturnValue(true);
    ui.togglePause();
    const stop = vi.spyOn(engine, "stopBattle").mockImplementation(() => {});
    ui.showScreen("title");
    expect(dialog.open).toBe(false);
    expect(stop).toHaveBeenCalledOnce();
  });

  it("displays the stage, remaining time, weapon life and combo reported by the engine", () => {
    const fighter = {
      data: CHARACTERS[0], hp: 60, maxHp: 100, power: 2, cooldowns: { ult: 15 },
      weapon: { name: "Katana", dur: 3.2 },
    };
    engine.bossPhase = false;
    engine.onHUDUpdate(fighter, fighter, 9.5);
    expect(byId("round-label").textContent).toBe("");
    expect(byId("game-timer").classList.contains("low")).toBe(true);
    expect(byId("cpu-weapon").textContent).toBe("Katana · 4s");
    engine.bossPhase = true;
    engine.onHUDUpdate(fighter, fighter, 8);
    expect(byId("round-label").textContent).toBe("Final boss");
    ui.setHealth("unlimited");
    engine.survivalKills = 2;
    engine.onHUDUpdate(fighter, fighter, 59);
    expect(byId("game-timer").textContent).toBe("∞");
    expect(byId("round-label").textContent).toBe("Wave 3");
    expect(byId("game-timer").classList.contains("low")).toBe(false);
    expect(byId("p1-orbs").classList.contains("on-cooldown")).toBe(true);

    engine.onComboUpdate(3);
    expect(byId("combo-counter").textContent).toBe("3 hit combo!");
    vi.advanceTimersByTime(600);
    engine.onComboUpdate(4);
    vi.advanceTimersByTime(300);
    expect(byId("combo-counter").style.opacity).toBe("1");
    vi.advanceTimersByTime(600);
    expect(byId("combo-counter").style.opacity).toBe("0");
  });

  it("skips missing HUD elements, and caps or suppresses screen shake for motion preferences", () => {
    const fighter = { data: CHARACTERS[0], hp: 0, maxHp: 100, power: 0, cooldowns: { ult: 0 } };
    byId("p1-orbs").remove();
    byId("p1-hp-fill").remove();
    byId("combo-counter").remove();
    engine.onHUDUpdate(fighter, fighter, -1);
    engine.onComboUpdate(3);
    expect(byId("game-timer").textContent).toBe("0");

    const animate = vi.fn();
    byId("arena").animate = animate;
    const media = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("matchMedia", media);
    engine.onShake(12);
    expect(animate).not.toHaveBeenCalled();
    media.mockReturnValue({ matches: false });
    engine.onShake(12);
    expect(animate).toHaveBeenCalledWith([
      { transform: "translateX(5px)" }, { transform: "translateX(-5px)" }, { transform: "translateX(0)" },
    ], 100);
  });

  it("telegraphs a heavy, prompts Light only during the opening, and confirms a landed counter", () => {
    const player = { data: CHARACTERS[0], hp: 100, maxHp: 100, power: 1, cooldowns: { ult: 0 }, countersLanded: 0, combatState: { counterFrames: 0 } };
    const cpu = { ...player, data: CHARACTERS[1], combatState: { state: "STARTUP", moveId: "attack_light" } };
    const cue = byId("guard-cue");
    const screen = byId("screen-battle");
    engine.onHUDUpdate(player, cpu, 59);
    expect(cue.textContent).toBe("");
    cpu.combatState.moveId = "attack_heavy";
    engine.onHUDUpdate(player, cpu, 59);
    expect(screen.dataset.guardCue).toBe("windup");
    expect(cue.textContent).toContain("Heavy windup");
    cpu.combatState.state = "RECOVERY";
    player.combatState.counterFrames = 27;
    engine.onHUDUpdate(player, cpu, 58);
    expect(screen.dataset.guardCue).toBe("opening");
    expect(cue.textContent).toContain("Light (Z)");
    player.combatState.counterFrames = 0;
    engine.onHUDUpdate(player, cpu, 58);
    expect(cue.textContent).toBe("");

    player.countersLanded++;
    engine.onHUDUpdate(player, cpu, 58);
    expect(cue.textContent).toBe("Counter hit!");
    vi.advanceTimersByTime(801);
    engine.onHUDUpdate(player, cpu, 57);
    expect(cue.textContent).toBe("");
    // A knockout has its own banner, and a rematch starts with a fresh player.
    player.countersLanded++;
    cpu.hp = 0;
    engine.onHUDUpdate(player, cpu, 57);
    expect(cue.textContent).toBe("");
    cpu.hp = 100;
    engine.onHUDUpdate({ ...player, countersLanded: 0 }, cpu, 60);
    expect(cue.textContent).toBe("");
  });

  it.each([
    [0, 0, "before impact"],
    [3, 1, "right away"],
    [2, 2, "Every perfect guard became a counter"],
  ])("explains the next rematch after %i perfect guards and %i landed counters", (guards, counters, advice) => {
    const fighter = { data: CHARACTERS[0], hp: 40, maxHp: 100, bestCombo: 2, perfectGuards: guards, countersLanded: counters };
    const opponent = { data: CHARACTERS[1], hp: 0, maxHp: 100 };
    engine.onGameEnd("VICTORY", fighter, opponent, 25);
    expect(byId("perfect-guards").textContent).toBe(String(guards));
    expect(byId("counters-landed").textContent).toBe(String(counters));
    expect(byId("rematch-insight").textContent).toContain(advice);
  });

  it.each([
    ["DRAW", 0, "tied", 500],
    ["DEFEAT", 0, "Shadow Ninja wins", 500],
    ["SURVIVAL_END", 1, "cleared 1 wave.", 3000],
    ["SURVIVAL_END", 2, "cleared 2 waves.", 5500],
  ])("records %s with %i cleared waves", (result, kills, text, score) => {
    engine.survivalKills = kills;
    state.data.bestCombo = 4;
    engine.onGameEnd(result, { data: CHARACTERS[0], hp: 50, maxHp: 100, bestCombo: 0 }, { data: CHARACTERS[1], hp: 50, maxHp: 100 }, 0);
    expect(byId("result-char").textContent).toContain(text);
    expect(byId("match-combo").textContent).toBe("0 hits");
    expect(byId("personal-combo").textContent).toBe("4 hits");
    expect(state.data.highScores[0].score).toBe(score);
    expect(state.spiritShards).toBe(Math.floor(score / 100));
  });
});
