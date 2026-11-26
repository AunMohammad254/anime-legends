/**
 * MoveRegistry.js
 * Frame data and state definitions for the combat system.
 */

export const FighterState = Object.freeze({
  IDLE: "IDLE",
  WALK: "WALK",
  DASH: "DASH",
  STARTUP: "STARTUP", // Pre-active frames of an attack
  ACTIVE: "ACTIVE", // Hitbox is live
  RECOVERY: "RECOVERY", // Post-active — vulnerable, can cancel into specials
  HITSTUN: "HITSTUN", // Taking a hit
  BLOCKSTUN: "BLOCKSTUN", // Blocked a hit
  JUGGLED: "JUGGLED", // Airborne after a launcher
  KNOCKDOWN: "KNOCKDOWN", // Knocked to the ground
});

export const AttackLevel = Object.freeze({
  HIGH: "HIGH", // Blocked by standing block; crouching goes under
  MID: "MID", // Blocked by both standing and crouching block
  LOW: "LOW", // Only blocked by crouching block
});

/** Frame Data catalog — all timings in frames at 60fps (1 frame = ~16.67ms) */
export const MOVE_DATA = {
  attack_light: {
    startupFrames: 5,
    activeFrames: 3,
    recoveryFrames: 8,
    damage: 8,
    knockback: 5,
    hitstunFrames: 12,
    blockstunFrames: 6,
    hitLevel: AttackLevel.MID,
    cancelable: true, // Can cancel recovery into specials
    hitstop: 3, // Frames both fighters freeze on hit
    hitbox: { xOffset: 20, yOffset: 60, width: 90, height: 60 },
    hurtbox: { xOffset: -30, yOffset: 20, width: 60, height: 120 },
  },
  attack_heavy: {
    startupFrames: 12,
    activeFrames: 5,
    recoveryFrames: 20,
    damage: 22,
    knockback: 14,
    hitstunFrames: 24,
    blockstunFrames: 14,
    hitLevel: AttackLevel.HIGH,
    cancelable: false,
    hitstop: 6,
    hitbox: { xOffset: 25, yOffset: 30, width: 125, height: 90 },
    hurtbox: { xOffset: -30, yOffset: 20, width: 60, height: 120 },
  },
  special: {
    startupFrames: 8,
    activeFrames: 4,
    recoveryFrames: 18,
    damage: 28,
    knockback: 18,
    hitstunFrames: 30,
    blockstunFrames: 16,
    hitLevel: AttackLevel.MID,
    cancelable: false,
    hitstop: 8,
    isLauncher: true, // Sends opponent into JUGGLED state
    hitbox: { xOffset: 20, yOffset: 40, width: 140, height: 80 },
    hurtbox: { xOffset: -30, yOffset: 20, width: 60, height: 120 },
  },
};
