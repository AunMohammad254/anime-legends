import { CHARACTERS, STAT_BOOSTS, WEAPON_SKINS } from "../../constants.js";

const fighters = CHARACTERS.map(({ id }) => id);
const skins = WEAPON_SKINS.map(({ id }) => id);
const boosts = STAT_BOOSTS.map(({ id }) => id);
const fields = [
  "spiritShards", "bestCombo", "unlockedCharacters", "unlockedSkins",
  "activeSkinId", "unlockedBoosts", "activeBoosts", "highScores",
];

function hasFields(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function whole(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function selections(value, catalog) {
  return Array.isArray(value) && value.length <= catalog.length
    && new Set(value).size === value.length && value.every(id => catalog.includes(id));
}

function validText(value, maxLength) {
  // PostgreSQL JSONB cannot represent NUL or a lone UTF-16 surrogate.
  return typeof value === "string" && value.length <= maxLength && !/[\u0000\uD800-\uDFFF]/u.test(value);
}

function score(entry) {
  return hasFields(entry, ["name", "date", "score"]) && whole(entry.score)
    && validText(entry.name, 128) && entry.name.trim().length > 0 && validText(entry.date, 128);
}

// Local saves are normalized by GameState before export. Reject incompatible
// snapshots in full so an unsupported field or ownership record is never lost.
export function isValidProgress(value) {
  return hasFields(value, fields) && whole(value.spiritShards) && whole(value.bestCombo)
    && selections(value.unlockedCharacters, fighters) && value.unlockedCharacters.includes("blaze")
    && selections(value.unlockedSkins, skins) && value.unlockedSkins.includes("default")
    && value.unlockedSkins.includes(value.activeSkinId)
    && selections(value.unlockedBoosts, boosts) && selections(value.activeBoosts, value.unlockedBoosts)
    && value.activeBoosts.length <= 2 && Array.isArray(value.highScores)
    && value.highScores.length <= 10 && value.highScores.every(score);
}
