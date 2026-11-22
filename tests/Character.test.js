import { beforeEach, describe, expect, it, vi } from "vitest";
import { Character } from "../src/entities/Character.js";
import { CHARACTERS } from "../constants.js";

describe("Character in the battle arena", () => {
  let engine;
  let fighter;
  let enemy;

  beforeEach(() => {
    document.body.innerHTML = '<div id="arena"><div id="p1-sprite"></div><div id="cpu-sprite"></div></div>';
    const arenaEl = document.getElementById("arena");
    Object.defineProperties(arenaEl, { offsetWidth: { value: 800 }, offsetHeight: { value: 500 } });
    engine = { arenaEl, difficulty: "normal", matchHealth: 100, trails: [], playSound: vi.fn(), spawnParticles: vi.fn(), triggerKO: vi.fn() };
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
});
