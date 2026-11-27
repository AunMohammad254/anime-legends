import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GameState } from "../src/core/GameState.js";
import { state as browserState } from "../state.js";

describe("State", () => {
  let state;
  beforeEach(() => {
    localStorage.clear();
    state = new GameState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("spiritShards", () => {
    it("starts at 0", () => {
      expect(state.spiritShards).toBe(0);
    });

    it("adds shards correctly", () => {
      state.addShards(100);
      expect(state.spiritShards).toBe(100);
    });

    it("spends shards when sufficient", () => {
      state.addShards(100);
      const success = state.spendShards(50);
      expect(success).toBe(true);
      expect(state.spiritShards).toBe(50);
    });

    it("fails to spend when insufficient", () => {
      state.addShards(30);
      const success = state.spendShards(50);
      expect(success).toBe(false);
      expect(state.spiritShards).toBe(30);
    });
  });

  describe("character unlocking", () => {
    it("starts with blaze unlocked", () => {
      expect(state.isUnlocked("blaze")).toBe(true);
    });

    it("unlocks new characters", () => {
      state.unlockCharacter("shadow");
      expect(state.isUnlocked("shadow")).toBe(true);
    });

    it("does not duplicate unlocks", () => {
      state.unlockCharacter("shadow");
      state.unlockCharacter("shadow");
      const count = state.data.unlockedCharacters.filter(
        (c) => c === "shadow",
      ).length;
      expect(count).toBe(1);
    });
  });

  describe("persistence", () => {
    it("saves to localStorage", () => {
      state.addShards(500);
      state.save();

      const saved = JSON.parse(localStorage.getItem("anime_legends_save"));
      expect(saved.spiritShards).toBe(500);
    });

    it("loads from localStorage", () => {
      localStorage.setItem(
        "anime_legends_save",
        JSON.stringify({
          spiritShards: 999,
          unlockedCharacters: ["blaze", "shadow"],
        }),
      );

      state.load();
      expect(state.spiritShards).toBe(999);
      expect(state.isUnlocked("shadow")).toBe(true);
    });
  });

  describe("skin system", () => {
    it("starts with default skin", () => {
      expect(state.isSkinUnlocked("default")).toBe(true);
    });

    it("unlocks new skins", () => {
      state.unlockSkin("gold");
      expect(state.isSkinUnlocked("gold")).toBe(true);
    });
  });

  it("recovers usable fields from a partial save and migrates equipped boosts", () => {
    localStorage.setItem(state.storageKey, JSON.stringify({
      spiritShards: 350,
      unlockedCharacters: ["shadow", "shadow", null],
      unlockedSkins: "gold",
      activeSkinId: "gold",
      activeBoosts: ["hp_up", "invalid"],
      highScores: [null, { score: -2 }, { name: "Blaze Warrior", date: "2025/11/22", score: 100 }],
    }));
    state.load();
    expect(state.data).toMatchObject({
      spiritShards: 350, unlockedCharacters: ["blaze", "shadow"], unlockedSkins: ["default"],
      activeSkinId: "default", unlockedBoosts: ["hp_up"], activeBoosts: ["hp_up"],
      highScores: [{ name: "Blaze Warrior", date: "2025/11/22", score: 100 }],
    });
    expect(state.toggleBoost("hp_up")).toBe(true);
    expect(state.toggleBoost("hp_up")).toBe(true);
    expect(state.spiritShards).toBe(350);
  });

  it("keeps the player in a usable session if the save is invalid or storage is blocked", () => {
    localStorage.setItem(state.storageKey, "{");
    state = new GameState();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    state.addShards(500);
    expect(state.buyCharacter("shadow")).toBe(true);
    expect(state.isUnlocked("shadow")).toBe(true);
    expect(state.spiritShards).toBe(0);
  });

  it("preserves recent purchases and rewards when two tabs have different snapshots", () => {
    state.addShards(600);
    const secondTab = new GameState();
    expect(state.buyCharacter("shadow")).toBe(true);
    expect(secondTab.toggleBoost("hp_up")).toBe(false);
    expect(secondTab.recordBattle({ name: "Blaze Warrior", score: 10000, date: "11/22/2026" })).toBe(100);
    expect(state.toggleBoost("hp_up")).toBe(true);
    secondTab.load();
    expect(secondTab.data).toEqual(state.data);
    expect(secondTab.spiritShards).toBe(0);
    expect(secondTab.isUnlocked("shadow")).toBe(true);
    expect(secondTab.isBoostActive("hp_up")).toBe(true);
    expect(secondTab.data.highScores).toHaveLength(1);
  });

  it("retries saving in-memory purchases when storage becomes writable", () => {
    state.addShards(800);
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("Quota exceeded");
    });
    expect(state.buyCharacter("shadow")).toBe(true);
    expect(state.spiritShards).toBe(300);
    expect(state.buySkin("gold")).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    const restored = new GameState();
    expect(restored.isUnlocked("shadow")).toBe(true);
    expect(restored.data.activeSkinId).toBe("gold");
    expect(restored.spiritShards).toBe(0);
  });

  it("cannot credit or spend invalid amounts", () => {
    state.addShards(100);
    for (const invalid of [-1, 1.5, "20", Infinity, NaN]) {
      expect(state.addShards(invalid)).toBe(false);
      expect(state.spendShards(invalid)).toBe(false);
    }
    expect(state.spiritShards).toBe(100);
  });

  it("charges once for each fighter or skin and equips purchased skins", () => {
    state.addShards(800);
    const write = vi.spyOn(Storage.prototype, "setItem");
    expect(state.buyCharacter("shadow")).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(state.buyCharacter("shadow")).toBe(false);
    expect(state.buySkin("gold")).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    expect(state.buyCharacter("storm")).toBe(false);
    expect(state.buySkin("default")).toBe(true);
    expect(state.buySkin("gold")).toBe(true);
    const restored = new GameState();
    expect(restored.data.activeSkinId).toBe("gold");
    expect(restored.spiritShards).toBe(0);
    expect(restored.isUnlocked("shadow")).toBe(true);
  });

  it("requires funds to buy boosts and keeps at most two equipped", () => {
    expect(state.toggleBoost("speed_up")).toBe(false);
    expect(state.isBoostUnlocked("speed_up")).toBe(false);
    state.addShards(800);
    for (const id of ["hp_up", "power_start", "speed_up"]) {
      expect(state.toggleBoost(id)).toBe(true);
    }
    expect(state.spiritShards).toBe(0);
    expect(state.data.activeBoosts).toEqual(["power_start", "speed_up"]);
    const restored = new GameState();
    expect(restored.toggleBoost("hp_up")).toBe(true);
    expect(restored.data.activeBoosts).toEqual(["speed_up", "hp_up"]);
    expect(restored.toggleBoost("speed_up")).toBe(true);
    expect(restored.data.activeBoosts).toEqual(["hp_up"]);
  });

  it("restores and persists a full backup without queuing it as another gameplay change", () => {
    const loaded = vi.fn();
    const saved = vi.fn();
    state.on("progressLoaded", loaded);
    state.on("progressSaved", saved);
    state.addShards(60);
    const oldSave = localStorage.getItem(state.storageKey);
    const restored = { ...state.data, spiritShards: 150, bestCombo: 5 };
    expect(state.replaceProgress({})).toBe(false);
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("Storage full"); });
    expect(state.replaceProgress(restored)).toBe(false);
    expect(state.spiritShards).toBe(60);
    expect(localStorage.getItem(state.storageKey)).toBe(oldSave);
    expect(loaded).not.toHaveBeenCalled();
    expect(state.replaceProgress(restored)).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(loaded).toHaveBeenCalledWith(restored);
    expect(new GameState().data).toEqual(restored);
  });

  it("records shards and ranked results together and keeps the ten highest scores", () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    for (let i = 0; i <= 10; i++) {
      expect(state.recordBattle({ name: "Blaze Warrior", score: i * 100, date: "11/22/2026" })).toBe(i);
    }
    expect(state.recordBattle({ name: "Blaze Warrior", score: NaN, date: "" })).toBe(0);
    expect(write).toHaveBeenCalledTimes(11);
    const restored = new GameState();
    expect(restored.spiritShards).toBe(55);
    expect(restored.data.highScores.map((entry) => entry.score)).toEqual(
      [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100],
    );
  });

  it("keeps the longest combo across completed matches, reloads and older saves", () => {
    localStorage.setItem(state.storageKey, JSON.stringify({ spiritShards: 10 }));
    state.load();
    expect(state.data.bestCombo).toBe(0);
    const entry = { name: "Blaze Warrior", score: 100, date: "11/24/2026" };
    const secondTab = new GameState();
    state.recordBattle({ ...entry, bestCombo: 4 });
    for (const bestCombo of [2, -1, "9"]) {
      secondTab.recordBattle({ ...entry, bestCombo });
    }
    const restored = new GameState();
    expect(restored.data.bestCombo).toBe(4);
    expect(restored.spiritShards).toBe(14);
  });

  it("refreshes the browser state on save and clear events from another tab", () => {
    const updates = vi.fn();
    browserState.on("progressLoaded", updates);
    localStorage.setItem(browserState.storageKey, JSON.stringify({ spiritShards: 140 }));
    window.dispatchEvent(new StorageEvent("storage", { key: "anime-audio" }));
    expect(updates).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent("storage", { key: browserState.storageKey }));
    expect(browserState.spiritShards).toBe(140);
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(updates).toHaveBeenCalledTimes(2);
    expect(browserState.spiritShards).toBe(0);
  });

  it("equips unlocked skins and informs listeners only after a successful change", () => {
    const display = vi.fn();
    const preview = vi.fn();
    state.on("skinChanged", display);
    state.on("skinChanged", preview);
    expect(state.setSkin("gold")).toBe(false);
    expect(state.unlockSkin("gold")).toBe(true);
    expect(state.unlockSkin("gold")).toBe(false);
    expect(state.setSkin("gold")).toBe(true);
    expect(new GameState().data.activeSkinId).toBe("gold");
    expect(display.mock.calls).toEqual([["gold"]]);
    expect(preview.mock.calls).toEqual([["gold"]]);
  });

  it("rejects obsolete catalog items and unaffordable skins without changing progress", () => {
    expect(state.buyCharacter("retired")).toBe(false);
    expect(state.unlockCharacter("retired")).toBe(false);
    expect(state.buySkin("retired")).toBe(false);
    expect(state.unlockSkin("retired")).toBe(false);
    expect(state.toggleBoost("retired")).toBe(false);
    expect(state.buySkin("gold")).toBe(false);
    expect(localStorage.getItem(state.storageKey)).toBeNull();
    expect(state.data).toEqual(new GameState().data);
  });

  it("records historical scores without issuing rewards and resets saved progress on clear", () => {
    const score = { name: "Blaze Warrior", score: 220, date: "2026-11-23" };
    const updated = vi.fn();
    const cleared = vi.fn();
    state.on("scoresUpdated", updated);
    state.on("stateCleared", cleared);
    expect(state.addScore({ ...score, name: " " })).toBe(false);
    expect(state.addScore({ ...score, date: null })).toBe(false);
    expect(state.addScore(score)).toBe(true);
    expect(updated.mock.calls).toEqual([[[score]]]);
    expect(new GameState().data.highScores).toEqual([score]);
    expect(state.spiritShards).toBe(0);
    state.addShards(500);
    state.buyCharacter("shadow");
    state.clear();
    const restored = new GameState();
    expect(restored.data).toMatchObject({ spiritShards: 0, unlockedCharacters: ["blaze"], highScores: [] });
    expect(cleared).toHaveBeenCalledOnce();
  });
});
