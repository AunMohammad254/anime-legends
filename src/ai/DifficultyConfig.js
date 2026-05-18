/**
 * DifficultyConfig.js
 * Contains parameter scaling based on AI difficulty levels.
 */

export const DIFFICULTY_LEVELS = {
  easy: {
    delayBase: 500,
    speed: 4,
    lightWeight: 0.7,
    heavyWeight: 0.2,
    specialChance: 0.2,
    retreatHpThreshold: 0.3,
  },
  normal: {
    delayBase: 250,
    speed: 4,
    lightWeight: 0.55,
    heavyWeight: 0.3,
    specialChance: 0.2,
    retreatHpThreshold: 0.3,
  },
  hard: {
    delayBase: 60,
    speed: 5,
    lightWeight: 0.4,
    heavyWeight: 0.35,
    specialChance: 0.2,
    retreatHpThreshold: 0.3,
  },
  expert: {
    delayBase: 20,
    speed: 5,
    lightWeight: 0.3,
    heavyWeight: 0.6,
    specialChance: 0.5,
    retreatHpThreshold: 0.0, // Never retreats
  },
};

export function getDifficultyParams(level) {
  return DIFFICULTY_LEVELS[level] || DIFFICULTY_LEVELS.normal;
}
