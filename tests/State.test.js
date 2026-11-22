import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GameState } from "../src/core/GameState.js";

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
});
