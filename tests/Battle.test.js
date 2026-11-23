import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engine } from "../engine.js";
import { CHARACTERS, WEAPONS } from "../constants.js";

const frame = 1000 / 60;
const opponent = CHARACTERS.find(c => c.id === "shadow");

function start(fighter = CHARACTERS[0], difficulty = "normal", health = 100) {
  engine.startBattle(fighter, opponent, difficulty, health);
  engine.p1.x = 220;
  engine.cpu.x = 315;
  vi.spyOn(engine.aiController, "update").mockImplementation(() => {});
}

function step(frames) {
  for (let i = 0; i < frames && engine.gameActive; i++) engine.step(frame);
}

function tap(key) {
  engine.keyboardInput.setKeyState(key, true);
  engine.keyboardInput.setKeyState(key, false);
}

beforeEach(() => {
  document.body.innerHTML = '<div id="arena"><div id="p1-sprite"></div><div id="cpu-sprite"></div><div id="round-text"></div></div>';
  Object.defineProperties(document.getElementById("arena"), {
    offsetWidth: { value: 800 }, offsetHeight: { value: 450 },
  });
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 123));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(engine.audioManager, "init").mockImplementation(() => {});
  engine.init();
  engine.onGameEnd = vi.fn();
});

afterEach(() => {
  engine.stopBattle();
  engine.keyboardInput.destroy();
  engine.touchInput.destroy();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fighter abilities", () => {
  for (const fighter of CHARACTERS) {
    it.each([false, true])(`${fighter.name} resolves its ability (ultimate=%s)`, ultimate => {
      start(fighter);
      engine.p1.power = 4;
      const result = ultimate ? engine.useUltimate(engine.p1, engine.cpu) : engine.useSpecial(engine.p1, engine.cpu);
      expect(result).toBe(true);
      const hitGain = fighter.id === "soul" ? 0.12 : 0;
      expect(engine.p1.power).toBeCloseTo((ultimate ? 1 : 3) + hitGain);
      step(60);
      expect(engine.cpu.hp).toBeLessThan(90);
    });
  }

  it("casts a tap special and reserves all three orbs for a charged ultimate", () => {
    start();
    engine.p1.power = 4;
    tap("KeyV");
    step(1);
    expect(engine.p1.power).toBe(3);
    step(50);
    engine.keyboardInput.setKeyState("KeyV", true);
    step(30);
    expect(engine.p1.power).toBe(3);
    step(10);
    expect(engine.p1.power).toBe(0);
    engine.keyboardInput.setKeyState("KeyV", false);
    step(1);
    expect(engine.p1.cooldowns.ult).toBeGreaterThan(0);
  });
});

describe("arena weapons", () => {
  // Fast-forward the drop timer and choose a weapon at the center of the arena.
  // Pickup, attack startup, impacts and expiry still run on normal simulation steps.
  function spawnDrop(id) {
    const index = WEAPONS.findIndex(weapon => weapon.id === id);
    expect(index).toBeGreaterThanOrEqual(0);
    const random = vi.spyOn(Math, "random").mockReturnValueOnce((index + 0.5) / WEAPONS.length).mockReturnValueOnce(0.5);
    engine.updateWeaponSpawn(engine.weaponTimer);
    random.mockRestore();
    return engine.activeWeaponDrop;
  }

  function collect(id, fighter = engine.p1) {
    const drop = spawnDrop(id);
    fighter.x = drop.x;
    step(1);
    expect(fighter.weapon.id).toBe(id);
    expect(drop.el.isConnected).toBe(false);
  }

  it("lets an unclaimed drop expire, then replaces equipped gear with the next pickup", () => {
    start(opponent);
    const abandoned = spawnDrop("orb");
    engine.p1.x = abandoned.x;
    engine.p1.y = 90;
    step(1);
    expect(engine.p1.weapon).toBeNull();
    engine.updateWeaponSpawn(abandoned.timer);
    expect(engine.activeWeaponDrop).toBeNull();
    expect(abandoned.el.isConnected).toBe(false);

    engine.p1.y = 0;
    collect("bow");
    const firstIcon = engine.p1.el.querySelector(".equipped-weapon");
    collect("blade");
    expect(firstIcon.isConnected).toBe(false);
    expect(engine.p1.el.querySelectorAll(".equipped-weapon")).toHaveLength(1);
    expect(engine.cpu.weapon).toBeNull();
  });

  it("retains katana reach on the last swing, then returns to unarmed reach", () => {
    start(opponent);
    collect("katana");
    engine.p1.weapon.hits = 1;
    engine.cpu.x = engine.p1.x + 165;
    tap("KeyZ");
    step(32);
    expect(engine.cpu.hp).toBeLessThan(100);
    expect(engine.p1.weapon).toBeNull();
    expect(engine.p1.el.querySelector(".equipped-weapon")).toBeNull();

    const hpAfterKatana = engine.cpu.hp;
    engine.cpu.x = engine.p1.x + 165;
    engine.cpu.vx = 0;
    tap("KeyZ");
    step(32);
    expect(engine.cpu.hp).toBe(hpAfterKatana);
    expect(WEAPONS.find(w => w.id === "katana").hits).toBe(8);
  });

  it("pierces normal guard with the bow but a guarding gauntlet can return a lethal arrow", () => {
    start(opponent);
    collect("bow");
    engine.p1.x = 140;
    engine.cpu.x = 600;
    engine.cpu.isBlocking = true;
    tap("KeyZ");
    step(45);
    expect(engine.cpu.hp).toBeCloseTo(100 - 20 * 1.035);
    expect(engine.p1.weapon.hits).toBe(4);
    expect(engine.p1.hp).toBe(100);

    collect("gauntlet", engine.cpu);
    const guardedHp = engine.cpu.hp;
    engine.p1.hp = 10;
    tap("KeyZ");
    step(120);
    expect(engine.cpu.hp).toBe(guardedHp);
    expect(engine.p1.hp).toBe(0);
    expect(engine.onGameEnd).toHaveBeenCalledTimes(1);
    expect(engine.onGameEnd.mock.calls[0][0]).toBe("DEFEAT");
    expect(engine.arenaEl.querySelector(".proj")).toBeNull();
  });

  it("uses the shadow blade for a heavy blink strike from across the arena", () => {
    start(opponent);
    collect("blade");
    engine.p1.x = 100;
    engine.cpu.x = 700;
    tap("KeyZ");
    step(25);
    expect(engine.p1.x).toBe(100);
    expect(engine.cpu.hp).toBe(100);
    expect(engine.p1.weapon.hits).toBe(3);

    tap("KeyX");
    step(1);
    expect(Math.abs(engine.cpu.x - engine.p1.x)).toBeLessThan(100);
    expect(engine.cpu.hp).toBe(100);
    step(25);
    expect(engine.cpu.hp).toBeLessThan(80);
    expect(engine.p1.weapon.hits).toBe(2);
  });

  it("deals proximity damage from the chaos orb only while the target is exposed and the orb lasts", () => {
    start(opponent);
    collect("orb");
    engine.cpu.x = engine.p1.x - 90;
    engine.cpu.isBlocking = true;
    step(30);
    expect(engine.cpu.hp).toBe(100);
    engine.cpu.isBlocking = false;
    engine.cpu.dashActive = 600;
    step(30);
    expect(engine.cpu.hp).toBe(100);
    engine.cpu.dashActive = 0;
    step(60);
    expect(engine.cpu.hp).toBeCloseTo(95);
    engine.p1.weapon.dur = frame / 1000;
    step(30);
    expect(engine.p1.weapon).toBeNull();
    expect(engine.cpu.hp).toBeCloseTo(95);
  });
});

describe("match simulation", () => {
  it.each([1, -1])("connects an active melee hit once when facing %i", direction => {
    start(opponent);
    engine.p1.x = engine.cpu.x - direction * 95;
    tap("KeyZ");
    step(2);
    expect(engine.cpu.hp).toBe(100);
    step(30);
    expect(engine.cpu.hp).toBeGreaterThan(88);
    expect(engine.cpu.hp).toBeLessThan(94);
    expect(engine.p1.combo).toBe(1);
  });

  it("applies the block modifier once and ignores a strike during a dash", () => {
    start(opponent);
    engine.cpu.isBlocking = true;
    tap("KeyZ");
    step(30);
    expect(engine.cpu.hp).toBeCloseTo(100 - 8 * 1.035 * 0.3);
    const guardedHp = engine.cpu.hp;
    engine.cpu.x = engine.p1.x + 95;
    engine.cpu.dashActive = 500;
    tap("KeyX");
    step(23);
    expect(engine.cpu.hp).toBeCloseTo(guardedHp);
  });

  it("discards buffered taps on pause and at the start of a new match", () => {
    start();
    tap("Space");
    engine.togglePause();
    engine.togglePause();
    step(1);
    expect(engine.p1.dashActive).toBe(0);

    tap("Space");
    start();
    step(1);
    expect(engine.p1.dashActive).toBe(0);
    tap("Space");
    step(1);
    expect(engine.p1.dashActive).toBeGreaterThan(0);
  });

  it("freezes a pending knockout on pause and discards it on restart", () => {
    start();
    engine.cpu.takeDamage(500);
    engine.togglePause();
    const remaining = engine.ko.time;
    engine.battleLoop(2500);
    expect(engine.ko.time).toBe(remaining);
    start();
    step(60);
    expect(engine.ko).toBeNull();
    expect(engine.onGameEnd).not.toHaveBeenCalled();
  });

  it("lets the CPU approach and defeat a stationary player through normal attacks", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    engine.startBattle(CHARACTERS[0], opponent, "normal", 100);
    step(2200);
    expect(engine.onGameEnd).toHaveBeenCalledTimes(1);
    expect(engine.onGameEnd.mock.calls[0][0]).toBe("DEFEAT");
    expect(engine.p1.hp).toBe(0);
  });

  it("ends a knockout exactly once", () => {
    start();
    engine.cpu.takeDamage(500);
    step(55);
    engine.gameEnd("VICTORY");
    expect(engine.onGameEnd).toHaveBeenCalledTimes(1);
    expect(engine.onGameEnd.mock.calls[0][0]).toBe("VICTORY");
  });

  it.each([
    [126, 62, "VICTORY"], [126, 63, "DRAW"], [126, 64, "DEFEAT"],
  ])("compares health percentages at timeout (%i / 200 vs. %i / 100 gives %s)", (playerHp, cpuHp, outcome) => {
    start();
    engine.p1.maxHp = 200;
    engine.p1.hp = playerHp;
    engine.cpu.hp = cpuHp;
    engine.timer = 0.01;
    step(1);
    expect(engine.onGameEnd.mock.calls[0][0]).toBe(outcome);
  });

  it("starts the expert boss on a first-round time advantage and can lose the second round on time", () => {
    start(opponent, "expert");
    engine.cpu.hp = 20;
    engine.timer = 0.01;
    step(1);
    expect(engine.bossPhase).toBe(true);
    expect(engine.cpu.hp).toBe(engine.cpu.maxHp);
    expect(engine.timer).toBeGreaterThan(0);
    expect(engine.onGameEnd).not.toHaveBeenCalled();
    engine.p1.hp = 50;
    engine.timer = 0.01;
    step(1);
    expect(engine.onGameEnd).toHaveBeenCalledTimes(1);
    expect(engine.onGameEnd.mock.calls[0][0]).toBe("DEFEAT");
  });

  it("requires the expert boss to fall before awarding victory", () => {
    start(CHARACTERS[0], "expert");
    engine.cpu.takeDamage(500);
    step(48);
    expect(engine.bossPhase).toBe(true);
    expect(engine.cpu.maxHp).toBe(200);
    expect(engine.cpu.combatState).toBeDefined();
    expect(engine.onGameEnd).not.toHaveBeenCalled();
    engine.cpu.takeDamage(500);
    step(50);
    expect(engine.onGameEnd.mock.calls[0][0]).toBe("VICTORY");
  });

  it("advances survival and retains the run total when the player falls", () => {
    start(CHARACTERS[0], "normal", "unlimited");
    engine.p1.hp = 35;
    engine.cpu.takeDamage(500);
    step(48);
    expect(engine.survivalKills).toBe(1);
    expect(engine.cpu.maxHp).toBeGreaterThan(100);
    expect(engine.cpu.data.id).not.toBe(opponent.id);
    expect(engine.p1.hp).toBeLessThan(engine.p1.maxHp);
    engine.p1.takeDamage(500);
    step(50);
    expect(engine.onGameEnd.mock.calls[0][0]).toBe("SURVIVAL_END");
  });
});
