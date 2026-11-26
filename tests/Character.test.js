import { beforeEach, describe, expect, it, vi } from "vitest";
import { CombatState } from "../src/combat/CombatSystem.js";
import { Character } from "../src/entities/Character.js";
import { CHARACTERS } from "../constants.js";

describe("Character in the battle arena", () => {
  let engine;
  let fighter;
  let enemy;

  beforeEach(() => {
    document.body.innerHTML = '<div id="arena"><div id="p1-sprite"></div><div id="cpu-sprite"></div></div>';
    const arenaEl = document.getElementById("arena");
    engine = { arenaEl, arenaWidth: 800, arenaHeight: 500, difficulty: "normal", matchHealth: 100, trails: [], playSound: vi.fn(), spawnParticles: vi.fn(), triggerKO: vi.fn() };
    fighter = engine.p1 = new Character(CHARACTERS[0], true, engine);
    enemy = engine.cpu = new Character(CHARACTERS[1], false, engine);
  });

  it("renders fighters in their own colors at opposite ends of the arena", () => {
    expect(fighter.el.querySelector(".fighter-blaze .s-head")).toBeTruthy();
    expect(enemy.el.querySelector(".fighter-shadow .s-head")).toBeTruthy();
    expect(fighter.el.style.color).not.toBe(enemy.el.style.color);
    expect(fighter.x).toBe(160);
    expect(enemy.x).toBe(640);
  });

  it("honors health, starting meter, speed and equipped skin", () => {
    const boosted = new Character(CHARACTERS[0], true, engine, { maxHp: 125, startPower: 2, spdMult: 1.15, skinId: "gold" });
    expect(boosted.hp).toBe(125);
    expect(boosted.power).toBe(2);
    expect(boosted.spdMult).toBeCloseTo(1.15);
    expect(boosted.weaponColor).toBe("#ffd700");
  });

  it("applies block damage once and dash immunity until the dash expires", () => {
    fighter.isBlocking = true;
    fighter.takeDamage(20, 3);
    expect(fighter.hp).toBe(94);
    fighter.dashActive = 20;
    fighter.takeDamage(20, 3);
    expect(fighter.hp).toBe(94);
  });

  it("enters KO once and clears queued moves on lethal damage", () => {
    fighter.pendingActions.push({ delay: 20, execute: vi.fn() });
    expect(fighter.takeDamage(200)).toBe(true);
    expect(fighter.takeDamage(1)).toBe(false);
    expect(fighter.hp).toBe(0);
    expect(fighter.state).toBe("ko");
    expect(fighter.el.classList.contains("ko")).toBe(true);
    expect(fighter.pendingActions).toHaveLength(0);
    expect(engine.triggerKO).toHaveBeenCalledTimes(1);
  });

  it("preserves a follow-up strike scheduled by an earlier strike", () => {
    const followUp = vi.fn();
    fighter.pendingActions.push({ delay: 5, execute: () => fighter.pendingActions.push({ delay: 15, execute: followUp }) });
    fighter.update(16, enemy);
    expect(followUp).not.toHaveBeenCalled();
    fighter.update(16, enemy);
    expect(followUp).toHaveBeenCalledOnce();
  });

  it("keeps a pushed fighter inside the arena", () => {
    fighter.x = 45;
    enemy.x = 46;
    fighter.vx = -10;
    fighter.update(16, enemy);
    expect(fighter.x).toBe(45);
  });

  function choose(id) {
    return new Character(CHARACTERS.find(c => c.id === id), true, engine);
  }

  it("separates overlapped opponents in consistent directions and keeps jumps in view", () => {
    for (const actor of [fighter, enemy]) {
      const opponent = actor === fighter ? enemy : fighter;
      actor.x = opponent.x = 200;
      actor.update(16, opponent);
      expect(Math.sign(actor.x - opponent.x)).toBe(actor.isPlayer ? -1 : 1);
    }
    fighter.vy = -300;
    fighter.update(16, enemy);
    expect(fighter.y + 160).toBeLessThanOrEqual(engine.arenaHeight * .75);
    expect(fighter.vy).toBe(0);
    fighter.update(16, enemy);
    expect(fighter.state).toBe("jump_fall");
  });

  it("stops pending follow-up hits and passive damage when the first hit ends the round", () => {
    fighter.dashActive = 100;
    const followUp = vi.fn();
    fighter.pendingActions.push({ delay: 0, execute: () => enemy.takeDamage(200) }, {delay: 1, execute: followUp});
    fighter.update(16, enemy);
    expect(followUp).not.toHaveBeenCalled();
    expect(engine.triggerKO).toHaveBeenCalledOnce();
    enemy.setState("run");
    const x = enemy.x;
    enemy.update(16, fighter);
    expect(enemy.state).toBe("ko");
    expect(enemy.x).toBe(x);
  });

  it("uses baseline stats for a fighter without a sprite or difficulty modifiers", () => {
    fighter.el.remove();
    engine.difficulty = undefined;
    const actor = new Character({id:"guest",color:"#fff"}, true, engine);
    expect(actor.spdMult).toBe(1);
    actor.vx = 5;
    actor.update(16, enemy);
    actor.takeDamage(10);
    expect(actor.x).toBe(165);
    expect(actor.hp).toBe(90);
    const label = engine.arenaEl.querySelector(".damage-num");
    expect(label.textContent).toBe("10");
    label.dispatchEvent(new Event("animationend"));
    expect(engine.arenaEl.querySelector(".damage-num")).toBeNull();
  });

  it.each(["blaze", "storm"])("emits %s contact sparks while applying proximity damage", id => {
    const actor = choose(id);
    actor.vx = 5;
    actor.x = enemy.x - 90;
    const random = vi.spyOn(Math, "random");
    try {
      random.mockReturnValue(0);
      actor.update(16, enemy);
      expect(engine.spawnParticles).toHaveBeenCalledOnce();
      expect(enemy.hp).toBeLessThan(enemy.maxHp);
      random.mockReturnValue(1);
      enemy.isBlocking = true;
      const hp = enemy.hp;
      actor.update(16, enemy);
      expect(enemy.hp).toBe(hp);
      expect(engine.spawnParticles).toHaveBeenCalledOnce();
    } finally {
      random.mockRestore();
    }
  });

  it("grants Terra's additional guard on the ground and Iron's knockback resistance", () => {
    const terra = choose("terra");
    terra.takeDamage(10);
    const groundedDamage = 100 - terra.hp;
    terra.y = 25;
    terra.hp = 100;
    terra.takeDamage(10);
    expect(100 - terra.hp).toBeGreaterThan(groundedDamage);
    const iron = choose("iron");
    iron.takeDamage(8, 10);
    fighter.takeDamage(8, 10);
    expect(iron.vx).toBeCloseTo(fighter.vx * .6);
  });

  it("mitigates chip damage with Frost armor and delays Aqua healing after damage", () => {
    const frost = choose("frost");
    frost.isBlocking = true;
    frost.takeDamage(10);
    expect(frost.hp).toBeCloseTo(100 - 10 * .825 * .18);
    const aqua = choose("aqua");
    aqua.takeDamage(12);
    const wounded = aqua.hp;
    aqua.update(1000, enemy);
    expect(aqua.hp).toBe(wounded);
    aqua.update(2000, enemy);
    expect(aqua.hp).toBeGreaterThan(wounded);
  });

  it.each(["attack_light", "attack_heavy"])("holds the %s fist at contact through hitstop, then retracts", moveId => {
    const combat = fighter.combatState = new CombatState(fighter, engine);
    combat.beginAttack(moveId);
    fighter.setState(moveId);
    combat.tick();
    fighter.render();
    expect(fighter.el.dataset.strikePhase).toBe("STARTUP");
    expect(Number(fighter.el.style.getPropertyValue("--windup"))).toBeGreaterThan(0);
    expect(Number(fighter.el.style.getPropertyValue("--extension"))).toBe(0);
    while (!combat.isHitboxLive) combat.tick();
    combat.applyHitstop(3);
    for (let frame = 0; frame < 3; frame++) {
      combat.tick();
      fighter.render();
      expect(fighter.el.dataset.strikePhase).toBe("ACTIVE");
      expect(Number(fighter.el.style.getPropertyValue("--extension"))).toBe(1);
    }
    while (combat.isHitboxLive) combat.tick();
    combat.tick();
    fighter.render();
    expect(fighter.el.dataset.strikePhase).toBe("RECOVERY");
    expect(Number(fighter.el.style.getPropertyValue("--extension"))).toBeLessThan(1);
    fighter.setState("ko");
    fighter.render();
    expect(fighter.el.hasAttribute("data-strike-phase")).toBe(false);
  });

  it("spaces dash afterimages and respects the player's reduced-motion setting", () => {
    fighter.dashActive = 200;
    engine.particleSystem = { motion: { matches: true } };
    fighter.update(16, enemy);
    expect(engine.trails).toHaveLength(0);
    engine.particleSystem.motion.matches = false;
    for (let frame = 0; frame < 4; frame++) fighter.update(16, enemy);
    expect(engine.trails).toHaveLength(2);
  });

  it("uses the move's impact sound even when armor or difficulty changes its damage", () => {
    fighter.takeDamage(6, 0, false, false, "attack_heavy");
    expect(engine.playSound).toHaveBeenLastCalledWith("heavy");
    fighter.takeDamage(22, 0, false, false, "attack_light");
    expect(engine.playSound).toHaveBeenLastCalledWith("light");
    fighter.takeDamage(22, 0, false, true, "attack_heavy");
    expect(engine.playSound).toHaveBeenLastCalledWith("block");
  });

});
