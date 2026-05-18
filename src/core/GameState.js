/**
 * GameState.js
 * Event-driven state manager for Anime Legends.
 * Handles persistence and pub/sub events.
 */

class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
  }

  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach((callback) => callback(data));
    }
  }
}

export class GameState extends EventEmitter {
  constructor() {
    super();
    this.storageKey = "anime_legends_save";
    this.data = {
      spiritShards: 0,
      unlockedCharacters: ["blaze"],
      unlockedSkins: ["default"],
      activeSkinId: "default",
      activeBoosts: [], // Array of boost IDs currently equipped
      highScores: [],
    };
    this.load();
  }

  load() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.data = { ...this.data, ...parsed };

        // Migration: Ensure new fields exist
        if (!this.data.unlockedSkins) this.data.unlockedSkins = ["default"];
        if (!this.data.activeSkinId) this.data.activeSkinId = "default";
        if (!this.data.activeBoosts) this.data.activeBoosts = [];
      }
    } catch (e) {
      console.warn("GameState: Failed to load save data. Using defaults.", e);
    }
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    } catch (e) {
      console.error("GameState: Failed to save data.", e);
    }
  }

  // --- Currency Logic ---
  get spiritShards() {
    return this.data.spiritShards;
  }

  addShards(amount) {
    this.data.spiritShards += amount;
    this.save();
    this.emit("shardsChanged", this.data.spiritShards);
  }

  spendShards(amount) {
    if (this.data.spiritShards >= amount) {
      this.data.spiritShards -= amount;
      this.save();
      this.emit("shardsChanged", this.data.spiritShards);
      return true;
    }
    return false;
  }

  // --- Character Logic ---
  isUnlocked(charId) {
    return this.data.unlockedCharacters.includes(charId);
  }

  unlockCharacter(charId) {
    if (!this.isUnlocked(charId)) {
      this.data.unlockedCharacters.push(charId);
      this.save();
      this.emit("characterUnlocked", charId);
      return true;
    }
    return false;
  }

  // --- Skin Logic ---
  isSkinUnlocked(skinId) {
    return this.data.unlockedSkins.includes(skinId);
  }

  unlockSkin(skinId) {
    if (!this.isSkinUnlocked(skinId)) {
      this.data.unlockedSkins.push(skinId);
      this.save();
      this.emit("skinUnlocked", skinId);
      return true;
    }
    return false;
  }

  setSkin(skinId) {
    if (this.isSkinUnlocked(skinId)) {
      this.data.activeSkinId = skinId;
      this.save();
      this.emit("skinChanged", skinId);
    }
  }

  // --- Boost Logic ---
  isBoostActive(boostId) {
    return this.data.activeBoosts.includes(boostId);
  }

  toggleBoost(boostId) {
    const index = this.data.activeBoosts.indexOf(boostId);
    if (index === -1) {
      // Cap at 2 active boosts for balance
      if (this.data.activeBoosts.length >= 2) {
        this.data.activeBoosts.shift();
      }
      this.data.activeBoosts.push(boostId);
    } else {
      this.data.activeBoosts.splice(index, 1);
    }
    this.save();
    this.emit("boostsUpdated", this.data.activeBoosts);
  }

  // --- Score Logic ---
  addScore(score) {
    this.data.highScores.push(score);
    this.data.highScores.sort((a, b) => b.score - a.score);
    this.data.highScores = this.data.highScores.slice(0, 10);
    this.save();
    this.emit("scoresUpdated", this.data.highScores);
  }

  // --- Utility ---
  clear() {
    this.data = {
      spiritShards: 0,
      unlockedCharacters: ["blaze"],
      unlockedSkins: ["default"],
      activeSkinId: "default",
      activeBoosts: [],
      highScores: [],
    };
    this.save();
    this.emit("stateCleared");
  }
}
