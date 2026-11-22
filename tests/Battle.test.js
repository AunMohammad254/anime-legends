import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engine } from "../engine.js";
import { CHARACTERS } from "../constants.js";

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

  it("determines a timed match by remaining health percentage", () => {
    start();
    engine.cpu.hp = 25;
    engine.timer = 0.01;
    step(1);
    expect(engine.onGameEnd.mock.calls[0][0]).toBe("VICTORY");
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
