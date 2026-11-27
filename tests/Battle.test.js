import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engine } from "../engine.js";
import { CHARACTERS, WEAPONS } from "../constants.js";
import { state } from "../state.js";

const frame = 1000 / 60;
let notifyArenaResize;
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
    offsetWidth: { value: 800, configurable: true }, offsetHeight: { value: 450, configurable: true },
  });
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback) { notifyArenaResize = callback; }
    observe() {}
    disconnect() {}
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
  it("keeps fighters inside the resized stage after rotating the phone", () => {
    start();
    engine.cpu.x = 720;
    Object.defineProperties(engine.arenaEl, { offsetWidth: { value: 320 }, offsetHeight: { value: 400 } });
    notifyArenaResize();
    step(1);
    expect(engine.arenaHeight).toBe(400);
    expect(engine.cpu.x).toBe(275);
    expect(engine.cpu.el.style.transform).toContain("translate3d(225px, 0px, 0px)");
  });

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

describe("match configuration and controls", () => {
  it.each([
    [200, ["hp_up", "power_start"], 250, 2, 1, 99],
    [400, ["speed_up"], 400, 0, 1.15, 120],
  ])("applies equipped boosts to the player only in a %i HP match", (health, equipped, hp, power, speed, timer) => {
    const previous = state.data.activeBoosts;
    try {
      state.data.activeBoosts = equipped;
      start(CHARACTERS[0], "normal", health);
      expect(engine.p1.hp).toBe(hp);
      expect(engine.p1.power).toBe(power);
      expect(engine.p1.spdMult).toBeCloseTo(speed);
      expect(engine.cpu.hp).toBe(health);
      expect(engine.cpu.power).toBe(0);
      expect(engine.timer).toBe(timer);
    } finally {
      state.data.activeBoosts = previous;
    }
  });

  it("runs whole simulation steps, limits catch-up after a stall and stops scheduling after timeout", () => {
    start();
    const hud = vi.fn();
    engine.onHUDUpdate = hud;
    try {
      engine.battleLoop(1000);
      engine.battleLoop(1005);
      expect(hud).not.toHaveBeenCalled();
      expect(engine.timer).toBe(60);
      engine.battleLoop(1020);
      expect(engine.timer).toBeCloseTo(60 - frame / 1000, 6);
      engine.battleLoop(2020);
      expect(engine.timer).toBeCloseTo(60 - 7 * frame / 1000, 6);
      expect(hud).toHaveBeenCalledTimes(2);
      expect(hud).toHaveBeenLastCalledWith(engine.p1, engine.cpu, engine.timer);
      engine.timer = 0.001;
      requestAnimationFrame.mockClear();
      engine.battleLoop(2100);
      expect(engine.onGameEnd).toHaveBeenCalledOnce();
      engine.battleLoop(2200);
      expect(requestAnimationFrame).not.toHaveBeenCalled();
      expect(engine.togglePause()).toBe(false);
    } finally {
      engine.onHUDUpdate = null;
    }
  });

  it("returns the audio preference from the audio manager", () => {
    vi.spyOn(engine.audioManager, "toggle").mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(engine.toggleAudio()).toBe(true);
    expect(engine.toggleAudio()).toBe(false);
  });

  it("moves left and right, jumps once while airborne and guards instead of attacking", () => {
    start(opponent);
    const input = engine.keyboardInput;
    const initial = engine.p1.x;
    input.setKeyState("ArrowLeft", true);
    step(1);
    expect(engine.p1.dir).toBe(-1);
    expect(engine.p1.x).toBeLessThan(initial);
    input.setKeyState("ArrowLeft", false);
    input.setKeyState("ArrowRight", true);
    step(2);
    expect(engine.p1.x).toBeGreaterThan(initial);
    input.setKeyState("ArrowRight", false);
    input.setKeyState("ArrowUp", true);
    step(3);
    expect(engine.p1.state).toBe("jump_rise");
    input.setKeyState("ArrowUp", false);
    step(28);
    expect(engine.p1.state).toBe("jump_fall");
    input.setKeyState("KeyC", true);
    tap("KeyX");
    step(1);
    expect(engine.p1.isBlocking).toBe(true);
    expect(engine.p1.combatState.isAttacking).toBe(false);
    input.setKeyState("KeyC", false);
    step(65);
    tap("Space");
    step(1);
    expect(engine.p1.dashActive).toBeGreaterThan(0);
    expect(engine.p1.opacity).toBeLessThan(1);
  });

  it("rejects unavailable or unknown attacks without spending power or starting an action", () => {
    start();
    const { p1, cpu } = engine;
    tap("KeyV");
    step(1);
    expect(p1.power).toBe(0);
    expect(engine.projectiles).toHaveLength(0);
    engine.attack(p1, cpu, "unknown");
    expect(p1.combatState.isAttacking).toBe(false);
    p1.power = 4;
    p1.cooldowns.ult = 1200;
    expect(engine.useUltimate(p1, cpu)).toBe(false);
    expect(p1.power).toBe(4);
  });

  it("blinks into range facing left when the shadow blade attacks from the right", () => {
    start(opponent);
    engine.p1.weapon = { ...WEAPONS.find(w => w.id === "blade") };
    engine.p1.x = 700;
    engine.cpu.x = 45;
    tap("KeyX");
    step(1);
    expect(engine.p1.x).toBeLessThan(155);
    expect(engine.p1.dir).toBe(-1);
  });
});

describe("ability counterplay", () => {
  it("limits soul drain to opponents in reach and heals only on an unblocked hit", () => {
    start(CHARACTERS.find(c => c.id === "soul"));
    const { p1, cpu } = engine;
    p1.hp = 50;
    p1.power = 4;
    cpu.x = 700;
    engine.useSpecial(p1, cpu);
    expect(p1.hp).toBe(50);
    expect(cpu.hp).toBe(100);
    step(55);
    cpu.isBlocking = true;
    engine.useUltimate(p1, cpu);
    expect(p1.x).toBeLessThan(cpu.x);
    expect(p1.hp).toBe(50);
    expect(cpu.hp).toBeLessThan(100);
    expect(cpu.hp).toBeGreaterThan(75);
  });

  it("lets an opponent move out of a marked lightning strike", () => {
    start(CHARACTERS.find(c => c.id === "storm"));
    engine.p1.power = 3;
    engine.useUltimate(engine.p1, engine.cpu);
    engine.cpu.x = 700;
    step(36);
    expect(engine.cpu.hp).toBe(100);
  });

  it("lets a jumping opponent avoid an earthquake pulse", () => {
    start(CHARACTERS.find(c => c.id === "terra"));
    engine.p1.power = 3;
    engine.useUltimate(engine.p1, engine.cpu);
    engine.cpu.vy = -18;
    step(12);
    expect(engine.cpu.y).toBeGreaterThan(75);
    expect(engine.cpu.hp).toBe(100);
  });
});

describe("knockout precedence", () => {
  it("resolves an instant player special before the CPU can retaliate", () => {
    start(opponent);
    engine.cpu.hp = 1;
    engine.p1.power = 1;
    tap("KeyV");
    step(1);
    expect(engine.cpu.hp).toBe(0);
    expect(engine.aiController.update).not.toHaveBeenCalled();
  });

  it("resolves an instant CPU special before an incoming strike", () => {
    start(opponent);
    engine.aiController.update.mockRestore();
    vi.spyOn(Math, "random").mockReturnValue(0);
    engine.aiController.state = "ATTACK";
    engine.cpu.power = 1;
    engine.cpu.hp = 1;
    engine.p1.hp = 1;
    engine.attack(engine.p1, engine.cpu, "attack_light");
    engine.p1.combatState.framesLeft = 1;
    step(1);
    expect(engine.p1.hp).toBe(0);
    expect(engine.cpu.hp).toBe(1);
  });

  it("does not let a knocked-out fighter trade simultaneous melee hits", () => {
    start(opponent);
    engine.cpu.hp = engine.p1.hp = 1;
    engine.attack(engine.p1, engine.cpu, "attack_light");
    engine.attack(engine.cpu, engine.p1, "attack_light");
    step(10);
    expect(engine.cpu.hp).toBe(0);
    expect(engine.p1.hp).toBe(1);
  });

  it.each(["p1", "cpu"])("stops processing drops on a lethal poison tick for %s", side => {
    start(opponent);
    engine[side].hp = 0.01;
    engine[side].poisonTime = 100;
    engine.weaponTimer = 1;
    step(1);
    expect(engine.ko.loser).toBe(engine[side]);
    expect(engine.activeWeaponDrop).toBeNull();
  });

  it("counts a survival KO once even with no announcement element", () => {
    start(opponent, "normal", "unlimited");
    document.getElementById("round-text").remove();
    engine.cpu.takeDamage(200);
    engine.triggerKO(engine.cpu);
    expect(engine.survivalKills).toBe(1);
    engine.stopBattle();
    engine.triggerKO(engine.cpu);
    expect(engine.ko).toBeNull();
  });
});

describe("melee contact feedback", () => {
  it.each([
    ["KeyZ", false, "light", 3], ["KeyX", false, "heavy", 6], ["KeyX", true, "guard", 3],
  ])("confirms %s against guarding=%s for the matching hitstop", (key, guarded, kind, ticks) => {
    start(opponent);
    const impact = engine.arenaEl.querySelector(".melee-impact");
    engine.cpu.isBlocking = guarded;
    tap(key);
    step(1);
    expect(impact.hidden).toBe(true);
    step(engine.p1.combatState.activeMove.startupFrames);
    expect(impact.hidden).toBe(false);
    expect(impact.dataset.kind).toBe(kind);
    expect(engine.cpu.hp).toBeLessThan(100);
    expect(engine.p1.combatState.hitstopFrames).toBe(ticks);
    engine.togglePause();
    engine.battleLoop(5000);
    expect(impact.hidden).toBe(false);
    engine.togglePause();
    step(11);
    expect(impact.hidden).toBe(true);
  });

  it("shows no contact on a miss and clears a live hit marker at rematch", () => {
    start(opponent);
    const impact = engine.arenaEl.querySelector(".melee-impact");
    engine.cpu.x = 700;
    tap("KeyZ");
    step(35);
    expect(impact.hidden).toBe(true);
    expect(engine.cpu.hp).toBe(100);
    engine.cpu.x = engine.p1.x + 90;
    tap("KeyZ");
    step(8);
    expect(impact.hidden).toBe(false);
    start(opponent);
    expect(impact.hidden).toBe(true);
  });

  it("captures a jump tap between frames and requires a new press after landing", () => {
    start(opponent);
    tap("ArrowUp");
    step(1);
    expect(engine.p1.y).toBeGreaterThan(0);
    step(75);
    expect(engine.p1.y).toBe(0);
    engine.keyboardInput.setKeyState("ArrowUp", true);
    step(1);
    expect(engine.p1.y).toBeGreaterThan(0);
    step(75);
    expect(engine.p1.y).toBe(0);
  });
});

describe("perfect guard and counter", () => {
  function incoming(type = "attack_heavy", beforeImpact = 2) {
    engine.attack(engine.cpu, engine.p1, type);
    step(engine.cpu.combatState.activeMove.startupFrames - beforeImpact);
  }

  function keyboard(key, down) {
    window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code: key, bubbles: true, cancelable: true }));
  }

  function pointer(button, down, id) {
    const event = new MouseEvent(down ? "pointerdown" : "pointerup", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: id });
    button.dispatchEvent(event);
  }

  it.each(["keyboard", "touch"])("counters a CPU heavy after a fresh %s guard", control => {
    start(opponent);
    const { p1, cpu } = engine;
    const impact = document.querySelector(".melee-impact");
    const touch = control === "touch";
    const action = (key, down) => {
      if (!touch) return keyboard(key, down);
      pointer(document.querySelector(`[data-key="${key}"]`), down, key === "KeyC" ? 1 : 2);
    };
    if (touch) {
      engine.touchInput.destroy();
      document.body.insertAdjacentHTML("beforeend", '<button class="touch-btn" data-key="KeyC">Block</button><button class="touch-btn" data-key="KeyZ">Light</button>');
      engine.touchInput.init();
    }

    incoming();
    action("KeyC", true);
    if (touch) action("KeyC", false); // A quick lift before the next simulation step still counts.
    step(2);
    expect(p1.hp).toBe(100);
    expect(cpu.power).toBe(0);
    expect(p1.perfectGuards).toBe(1);
    expect(p1.combatState.counterFrames).toBe(27);
    expect(impact.dataset.kind).toBe("perfect");
    expect(cpu.combatState.canAct).toBe(false);
    // A remaining ability cooldown may outlast its action lock; the counter still works.
    p1.cooldowns.attack = 350;
    action("KeyZ", true);
    action("KeyZ", false);
    step(9);
    expect(p1.combatState.counterFrames).toBe(0);
    expect(p1.countersLanded).toBe(1);
    expect(impact.dataset.kind).toBe("counter");
    expect(cpu.hp).toBeCloseTo(100 - 8 * 1.75 * 1.035);
    expect(p1.bestCombo).toBe(1);
    step(30);
    expect(p1.countersLanded).toBe(1);
  });

  it("handles a counter facing left at the far edge of a katana heavy", () => {
    start(opponent);
    engine.p1.x = 600;
    engine.cpu.x = 380;
    engine.cpu.dir = 1;
    engine.cpu.weapon = { ...WEAPONS.find(w => w.id === "katana") };
    engine.p1.weapon = { ...WEAPONS.find(w => w.id === "bow") };
    incoming();
    tap("KeyC");
    step(2);
    expect(engine.p1.perfectGuards).toBe(1);
    tap("KeyZ");
    step(10);
    expect(engine.p1.dir).toBe(-1);
    expect(engine.p1.countersLanded).toBe(1);
    expect(engine.projectiles).toHaveLength(0);
    expect(engine.p1.weapon.hits).toBe(5);
  });

  it.each(["held early", "mashed", "light attack"])("keeps the ordinary guard against an attack when %s", mode => {
    start(opponent);
    if (mode === "light attack") {
      incoming("attack_light");
      keyboard("KeyC", true);
      step(2);
    } else {
      engine.attack(engine.cpu, engine.p1, "attack_heavy");
      keyboard("KeyC", true);
      step(5);
      if (mode === "mashed") {
        keyboard("KeyC", false);
        keyboard("KeyC", true);
        step(5);
        keyboard("KeyC", false);
        keyboard("KeyC", true);
      }
      step(13);
    }
    expect(engine.p1.hp).toBeLessThan(100);
    expect(engine.p1.hp).toBeGreaterThan(90);
    expect(engine.p1.perfectGuards).toBe(0);
    expect(document.querySelector(".melee-impact").dataset.kind).toBe("guard");
  });

  it("drops pre-guard light taps and closes an unused opening; another guard can be earned after rearming", () => {
    start(opponent);
    incoming();
    tap("KeyZ");
    keyboard("KeyC", true);
    step(2);
    expect(engine.p1.perfectGuards).toBe(1);
    keyboard("KeyC", false);
    step(50);
    expect(engine.p1.combatState.counterFrames).toBe(0);
    expect(engine.p1.countersLanded).toBe(0);
    expect(engine.cpu.hp).toBe(100);
    incoming();
    keyboard("KeyC", true);
    step(2);
    expect(engine.p1.perfectGuards).toBe(2);
    engine.togglePause();
    engine.battleLoop(6000);
    expect(engine.p1.combatState.counterFrames).toBe(27);
    engine.togglePause();
    start(opponent);
    expect(engine.p1.perfectGuards).toBe(0);
    expect(engine.p1.countersLanded).toBe(0);
    expect(engine.p1.combatState.counterFrames).toBe(0);
  });
});
