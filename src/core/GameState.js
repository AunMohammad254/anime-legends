import { CHARACTERS, STAT_BOOSTS, WEAPON_SKINS } from "../../constants.js";
import { isValidProgress } from "../cloud/progressSchema.js";

function validAmount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function knownIds(value, catalog, initial = []) {
  const saved = Array.isArray(value) ? value : [];
  const ids = saved.filter((id) => catalog.some((item) => item.id === id));
  return [...new Set([...initial, ...ids])];
}

function validScore(entry) {
  return typeof entry?.name === "string" && entry.name.trim().length > 0
    && typeof entry.date === "string" && validAmount(entry.score);
}

function topTen(entries) {
  return entries.filter(validScore)
    .map(({ name, score, date }) => ({ name, score, date }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function readProgress(saved) {
  const unlockedSkins = knownIds(saved?.unlockedSkins, WEAPON_SKINS, ["default"]);
  const activeBoosts = knownIds(saved?.activeBoosts, STAT_BOOSTS);
  return {
    spiritShards: validAmount(saved?.spiritShards) ? saved.spiritShards : 0,
    bestCombo: validAmount(saved?.bestCombo) ? saved.bestCombo : 0,
    unlockedCharacters: knownIds(saved?.unlockedCharacters, CHARACTERS, ["blaze"]),
    unlockedSkins,
    activeSkinId: unlockedSkins.includes(saved?.activeSkinId) ? saved.activeSkinId : "default",
    // Earlier versions stored only the equipped boosts. Keep those usable after upgrading.
    unlockedBoosts: knownIds(saved?.unlockedBoosts, STAT_BOOSTS, activeBoosts),
    activeBoosts: activeBoosts.slice(-2),
    highScores: topTen(Array.isArray(saved?.highScores) ? saved.highScores : []),
  };
}

export class GameState {
  constructor() {
    this.events = new Map();
    this.storageKey = "anime_legends_save";
    this.data = readProgress();
    this.lastSnapshot = null;
    this.pendingSave = false;
    this.needsRecovery = true;
    this.load();
  }

  on(event, callback) {
    if (!this.events.has(event)) this.events.set(event, []);
    this.events.get(event).push(callback);
  }

  emit(event, data) {
    this.events.get(event)?.forEach((callback) => callback(data));
  }

  load() {
    // Keep playing with the in-memory balance if a storage write failed.
    if (this.pendingSave) return;
    try {
      const snapshot = localStorage.getItem(this.storageKey);
      if (snapshot === this.lastSnapshot) return;
      const saved = JSON.parse(snapshot);
      this.data = readProgress(saved);
      this.lastSnapshot = snapshot;
      this.needsRecovery = !isValidProgress(saved);
    } catch {
      this.needsRecovery = true;
      return;
    }
    this.emit("progressLoaded", this.data);
  }

  persist(progress) {
    const snapshot = JSON.stringify(progress);
    localStorage.setItem(this.storageKey, snapshot);
    this.lastSnapshot = snapshot;
    this.pendingSave = false;
    this.needsRecovery = false;
  }

  save() {
    try {
      this.persist(this.data);
    } catch {
      const firstFailure = !this.pendingSave;
      this.pendingSave = true;
      this.needsRecovery = false; // New progress still exists in this session.
      if (firstFailure) this.emit("storageUnavailable");
    }
    this.emit("progressSaved", this.data);
    return !this.pendingSave;
  }

  replaceProgress(progress) {
    if (!isValidProgress(progress)) return false;
    const restored = readProgress(progress);
    try {
      this.persist(restored);
    } catch {
      return false;
    }
    this.data = restored;
    this.emit("progressLoaded", restored);
    return true;
  }

  get spiritShards() {
    return this.data.spiritShards;
  }

  addShards(amount) {
    this.load();
    if (!validAmount(amount)) return false;
    this.data.spiritShards = Math.min(Number.MAX_SAFE_INTEGER, this.spiritShards + amount);
    this.save();
    this.emit("shardsChanged", this.spiritShards);
    return true;
  }

  spendShards(amount) {
    this.load();
    if (!validAmount(amount) || amount > this.spiritShards) return false;
    this.data.spiritShards -= amount;
    this.save();
    this.emit("shardsChanged", this.spiritShards);
    return true;
  }

  isUnlocked(id) {
    return this.data.unlockedCharacters.includes(id);
  }

  unlockCharacter(id) {
    this.load();
    if (!CHARACTERS.some((item) => item.id === id) || this.isUnlocked(id)) return false;
    this.data.unlockedCharacters.push(id);
    this.save();
    this.emit("characterUnlocked", id);
    return true;
  }

  isSkinUnlocked(id) {
    return this.data.unlockedSkins.includes(id);
  }

  unlockSkin(id) {
    this.load();
    if (!WEAPON_SKINS.some((item) => item.id === id) || this.isSkinUnlocked(id)) return false;
    this.data.unlockedSkins.push(id);
    this.save();
    this.emit("skinUnlocked", id);
    return true;
  }

  setSkin(id) {
    this.load();
    if (!this.isSkinUnlocked(id)) return false;
    this.data.activeSkinId = id;
    this.save();
    this.emit("skinChanged", id);
    return true;
  }

  buyCharacter(id) {
    this.load();
    const fighter = CHARACTERS.find((item) => item.id === id);
    if (!fighter || this.isUnlocked(id) || fighter.price > this.spiritShards) return false;
    this.data.spiritShards -= fighter.price;
    this.data.unlockedCharacters.push(id);
    this.save();
    this.emit("characterUnlocked", id);
    this.emit("shardsChanged", this.spiritShards);
    return true;
  }

  buySkin(id) {
    this.load();
    const skin = WEAPON_SKINS.find((item) => item.id === id);
    if (!skin) return false;
    const purchased = !this.isSkinUnlocked(id);
    if (purchased) {
      if (skin.price > this.spiritShards) return false;
      this.data.spiritShards -= skin.price;
      this.data.unlockedSkins.push(id);
    }
    this.data.activeSkinId = id;
    this.save();
    if (purchased) {
      this.emit("skinUnlocked", id);
      this.emit("shardsChanged", this.spiritShards);
    }
    this.emit("skinChanged", id);
    return true;
  }

  isBoostUnlocked(id) {
    return this.data.unlockedBoosts.includes(id);
  }

  isBoostActive(id) {
    return this.data.activeBoosts.includes(id);
  }

  toggleBoost(id) {
    this.load();
    const boost = STAT_BOOSTS.find((item) => item.id === id);
    if (!boost) return false;
    const purchased = !this.isBoostUnlocked(id);
    if (purchased) {
      if (boost.price > this.spiritShards) return false;
      this.data.spiritShards -= boost.price;
      this.data.unlockedBoosts.push(id);
    }
    if (this.isBoostActive(id)) {
      this.data.activeBoosts = this.data.activeBoosts.filter((active) => active !== id);
    } else {
      this.data.activeBoosts = [...this.data.activeBoosts, id].slice(-2);
    }
    this.save();
    if (purchased) this.emit("shardsChanged", this.spiritShards);
    this.emit("boostsUpdated", this.data.activeBoosts);
    return true;
  }

  addScore(entry) {
    this.load();
    if (!validScore(entry)) return false;
    this.data.highScores = topTen([...this.data.highScores, entry]);
    this.save();
    this.emit("scoresUpdated", this.data.highScores);
    return true;
  }

  recordBattle(entry) {
    this.load();
    if (!validScore(entry)) return 0;
    const reward = Math.min(Math.floor(entry.score / 100), Number.MAX_SAFE_INTEGER - this.spiritShards);
    this.data.spiritShards += reward;
    if (validAmount(entry.bestCombo)) {
      this.data.bestCombo = Math.max(this.data.bestCombo, entry.bestCombo);
    }
    this.data.highScores = topTen([...this.data.highScores, entry]);
    this.save();
    this.emit("scoresUpdated", this.data.highScores);
    this.emit("shardsChanged", this.spiritShards);
    return reward;
  }

  clear() {
    this.data = readProgress();
    this.save();
    this.emit("stateCleared");
  }
}
