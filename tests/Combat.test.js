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

describe("combat timing and defensive options", () => {
  function fighter(x, isPlayer) {
    const f = { x, y: 0, dir: isPlayer ? 1 : -1, isPlayer, hp: 100, takeDamage: vi.fn() };
    f.combatState = new CombatState(f, {});
    return f;
  }

  function advance(state, frames) {
    for (let i = 0; i < frames; i++) state.tick();
  }

  it("deduplicates repeat inputs and clears the buffer when a sequence ends", () => {
    const buffer = new InputBuffer();
    buffer.push("attack_light");
    buffer.push("attack_light");
    expect(buffer.consume()).toBe("attack_light");
    expect(buffer.consume()).toBeNull();
    buffer.push("attack_heavy");
    buffer.clear();
    expect(buffer.hasPending()).toBe(false);
  });

  it("cancels a recovering light attack into a special or starts the buffered heavy after recovery", () => {
    const state = fighter(0, true).combatState;
    const light = MOVE_DATA.attack_light;
    expect(state.isAttacking).toBe(false);
    expect(state.beginAttack("missing-move")).toBe(false);
    state.beginAttack("attack_light");
    expect(state.isAttacking).toBe(true);
    expect(state.getHitbox()).toBeNull();
    advance(state, light.startupFrames);
    expect(state.getHitbox()).toBeTruthy();
    expect(state.isAttacking).toBe(true);
    advance(state, light.activeFrames);
    expect(state.isAttacking).toBe(true);
    expect(state.beginAttack("special")).toBe(true);
    expect(state.moveId).toBe("special");

    const special = MOVE_DATA.special;
    advance(state, special.startupFrames + special.activeFrames + special.recoveryFrames - 1);
    expect(state.beginAttack("attack_heavy")).toBe(false);
    state.tick();
    expect(state.moveId).toBe("attack_heavy");
    expect(state.state).toBe(FighterState.STARTUP);
  });

  it.each([
    [AttackLevel.HIGH, false, "blocked"], [AttackLevel.HIGH, true, "hit"],
    [AttackLevel.LOW, false, "hit"], [AttackLevel.LOW, true, "blocked"],
  ])("resolves %s against a crouching=%s guard as %s", (level, crouching, outcome) => {
    const state = fighter(0, false).combatState;
    state.isCrouching = crouching;
    expect(state.applyHit({ ...MOVE_DATA.attack_light, hitLevel: level }, true, false)).toBe(outcome);
  });

  it("avoids startup contact and lets a dashing defender pass through a live hitbox", () => {
    const a = fighter(10, true);
    const d = fighter(100, false);
    d.combatState.state = FighterState.WALK;
    expect(d.combatState.canAct).toBe(true);
    a.combatState.beginAttack("attack_light");
    expect(resolveCollision(a, d, "attack_light")).toBe("whiff");
    advance(a.combatState, MOVE_DATA.attack_light.startupFrames);
    d.combatState.state = FighterState.DASH;
    expect(d.combatState.canAct).toBe(true);
    expect(resolveCollision(a, d, "attack_light")).toBe("whiff");
    expect(d.takeDamage).not.toHaveBeenCalled();
  });

  it("scales airborne follow-ups, awards the combo, then returns control after knockdown", () => {
    const a = fighter(0, true);
    const d = fighter(95, false);
    const events = { onShake: vi.fn(), onComboUpdate: vi.fn() };
    a.combatState.beginAttack("special");
    advance(a.combatState, MOVE_DATA.special.startupFrames);
    expect(resolveCollision(a, d, "special", events)).toBe("launched");
    expect(d.vy).toBe(-16);
    expect(events.onShake).toHaveBeenLastCalledWith(10);

    d.y = 40;
    expect(resolveCollision(a, d, "special", events)).toBe("juggled");
    expect(d.vy).toBeCloseTo(-16 / 1.4);
    expect(d.takeDamage.mock.lastCall[0]).toBeCloseTo(MOVE_DATA.special.damage / 1.4);
    expect(events.onShake).toHaveBeenLastCalledWith(6);
    expect(events.onComboUpdate).toHaveBeenLastCalledWith(2);
    advance(d.combatState, d.combatState.hitstopFrames + d.combatState.framesLeft);
    expect(d.combatState.state).toBe(FighterState.KNOCKDOWN);
    expect(d.combatState.canAct).toBe(false);
    advance(d.combatState, d.combatState.framesLeft);
    expect(d.combatState.canAct).toBe(true);
    expect(d.combatState.juggleGravity).toBe(1);
  });

  it("accepts simple fighters without frame data and signals a lighter impact on guard", () => {
    const attacker = { dir: -1 };
    const defender = { isBlocking: true, takeDamage: vi.fn() };
    const onShake = vi.fn();
    expect(resolveCollision(attacker, defender, "attack_light", { onShake })).toBe("blocked");
    expect(onShake).toHaveBeenCalledWith(1.5);
    expect(attacker.combo).toBeUndefined();
    defender.isBlocking = false;
    expect(resolveCollision(attacker, defender, "attack_light")).toBe("hit");
    expect(attacker.combo).toBe(1);
  });
});
