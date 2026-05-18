import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { state } from "../State.js";

describe("State", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset state data
    state.data = {
      spiritShards: 0,
      unlockedCharacters: ["blaze"],
      unlockedSkins: ["default"],
      activeSkinId: "default",
      activeBoosts: [],
      highScores: [],
    };
  });

  afterEach(() => {
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
});
