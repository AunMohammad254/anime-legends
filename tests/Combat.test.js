import { describe, it, expect, beforeEach, vi } from "vitest";
import { FighterState, AttackLevel, MOVE_DATA } from "../src/combat/MoveRegistry.js";
import { InputBuffer } from "../src/combat/ComboDetector.js";
import { CombatState, resolveCollision } from "../src/combat/CombatSystem.js";

describe("MoveRegistry", () => {
  it("should have expected states and attack levels", () => {
    expect(FighterState.IDLE).toBe("IDLE");
    expect(AttackLevel.HIGH).toBe("HIGH");
  });

  it("should have MOVE_DATA for light, heavy and special attacks", () => {
    expect(MOVE_DATA.attack_light).toBeDefined();
    expect(MOVE_DATA.attack_heavy).toBeDefined();
    expect(MOVE_DATA.special).toBeDefined();
  });
});

describe("InputBuffer", () => {
  let buffer;

  beforeEach(() => {
    buffer = new InputBuffer(5);
  });

  it("should push and consume actions", () => {
    buffer.push("attack_light");
    expect(buffer.hasPending()).toBe(true);
    expect(buffer.consume()).toBe("attack_light");
    expect(buffer.hasPending()).toBe(false);
  });

  it("should respect priority", () => {
    buffer.push("attack_light");
    buffer.push("special");
    buffer.push("attack_heavy");
    expect(buffer.consume()).toBe("special");
    expect(buffer.consume()).toBe("attack_heavy");
    expect(buffer.consume()).toBe("attack_light");
  });

  it("should expire actions after tick", () => {
    buffer.push("attack_light");
    for (let i = 0; i < 5; i++) {
      buffer.tick();
    }
    expect(buffer.hasPending()).toBe(false);
  });
});

describe("CombatState", () => {
  let fighter;
  let engine;
  let combatState;

  beforeEach(() => {
    fighter = { x: 0, y: 0, dir: 1 };
    engine = {};
    combatState = new CombatState(fighter, engine);
  });

  it("should start in IDLE state", () => {
    expect(combatState.state).toBe(FighterState.IDLE);
  });

  it("should transition to STARTUP on attack", () => {
    const started = combatState.beginAttack("attack_light");
    expect(started).toBe(true);
    expect(combatState.state).toBe(FighterState.STARTUP);
    expect(combatState.framesLeft).toBe(MOVE_DATA.attack_light.startupFrames);
  });

  it("should buffer attack if already attacking", () => {
    combatState.beginAttack("attack_light");
    const started = combatState.beginAttack("attack_heavy");
    expect(started).toBe(false);
    expect(combatState.inputBuffer.hasPending()).toBe(true);
  });

  it("should advance through attack phases on tick", () => {
    combatState.beginAttack("attack_light");
    
    // STARTUP -> ACTIVE
    for (let i = 0; i < MOVE_DATA.attack_light.startupFrames; i++) {
      combatState.tick();
    }
    expect(combatState.state).toBe(FighterState.ACTIVE);
    
    // ACTIVE -> RECOVERY
    for (let i = 0; i < MOVE_DATA.attack_light.activeFrames; i++) {
      combatState.tick();
    }
    expect(combatState.state).toBe(FighterState.RECOVERY);
    
    // RECOVERY -> IDLE
    for (let i = 0; i < MOVE_DATA.attack_light.recoveryFrames; i++) {
      combatState.tick();
    }
    expect(combatState.state).toBe(FighterState.IDLE);
  });

  it("should apply hitstun", () => {
    const move = MOVE_DATA.attack_light;
    combatState.applyHit(move, false, false);
    expect(combatState.state).toBe(FighterState.HITSTUN);
    expect(combatState.framesLeft).toBe(move.hitstunFrames);
  });

  it("should apply blockstun if blocking correctly", () => {
    const move = MOVE_DATA.attack_light; // MID level
    combatState.applyHit(move, true, false);
    expect(combatState.state).toBe(FighterState.BLOCKSTUN);
  });

  it("should handle juggles", () => {
    const move = MOVE_DATA.attack_light;
    combatState.applyHit(move, false, true); // Airborne
    expect(combatState.state).toBe(FighterState.JUGGLED);
    expect(combatState.juggleHits).toBe(1);
    expect(combatState.juggleGravity).toBeGreaterThan(1.0);
  });
});

describe("resolveCollision", () => {
  it("should resolve a hit between attacker and defender", () => {
    const attacker = {
      x: 0, y: 0, dir: 1,
      combatState: {
        isHitboxLive: true,
        activeMove: MOVE_DATA.attack_light,
        getHitbox: () => ({ x: 50, y: 50, width: 100, height: 100, level: AttackLevel.MID }),
        applyHitstop: vi.fn()
      }
    };
    const defender = {
      x: 100, y: 0, isBlocking: false,
      takeDamage: vi.fn(),
      combatState: {
        getHurtbox: () => ({ x: 100, y: 50, width: 50, height: 100 }),
        applyHit: vi.fn().mockReturnValue("hit"),
        applyHitstop: vi.fn()
      }
    };
    const engine = { onShake: vi.fn() };

    const result = resolveCollision(attacker, defender, "attack_light", engine);

    expect(result).toBe("hit");
    expect(defender.takeDamage).toHaveBeenCalled();
    expect(engine.onShake).toHaveBeenCalled();
  });

  it("should return whiff if no overlap", () => {
    const attacker = {
      x: 0, y: 0, dir: 1,
      combatState: {
        isHitboxLive: true,
        activeMove: MOVE_DATA.attack_light,
        getHitbox: () => ({ x: 0, y: 0, width: 10, height: 10, level: AttackLevel.MID }),
        applyHitstop: vi.fn()
      }
    };
    const defender = {
      x: 100, y: 0, isBlocking: false,
      takeDamage: vi.fn(),
      combatState: {
        getHurtbox: () => ({ x: 100, y: 100, width: 10, height: 10 }),
        applyHit: vi.fn(),
        applyHitstop: vi.fn()
      }
    };

    const result = resolveCollision(attacker, defender, "attack_light", {});
    expect(result).toBe("whiff");
  });
});
