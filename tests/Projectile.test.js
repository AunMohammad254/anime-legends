import { beforeEach, describe, expect, it, vi } from "vitest";
import { Projectile } from "../src/entities/Projectile.js";

describe("Projectile in the battle arena", () => {
  let engine;
  let owner;
  let target;
  let onHit;

  beforeEach(() => {
    const arenaEl = document.createElement("div");
    owner = { x: 130, y: 0, hp: 100, data: { color: "#f00" }, isPlayer: true, dashActive: 0, takeDamage: vi.fn() };
    target = { ...owner, x: 210, isPlayer: false, isBlocking: false, takeDamage: vi.fn() };
    engine = { arenaEl, arenaWidth: 800, arenaHeight: 500, p1: owner, cpu: target, spawnParticles: vi.fn(), playSound: vi.fn() };
    onHit = vi.fn();
  });

  function fire(config = {}) {
    return new Projectile({ x: 175, y: 80, vx: 12, owner, dmg: 20, onHit, ...config }, engine);
  }

  it("applies a special on contact and removes the projectile", () => {
    const shot = fire();
    shot.update(16);
    expect(target.takeDamage).toHaveBeenCalledWith(20, 6, false, false);
    expect(onHit).toHaveBeenCalledWith(target, owner);
    expect(shot.active).toBe(false);
    expect(engine.arenaEl.children).toHaveLength(0);
  });

  it("delegates guard mitigation to the fighter and suppresses secondary effects", () => {
    target.isBlocking = true;
    fire().update(16);
    expect(target.takeDamage).toHaveBeenCalledWith(20, 6, false, true);
    expect(onHit).not.toHaveBeenCalled();
  });

  it("reflects a shot toward the original caster when the defender blocks with a gauntlet", () => {
    target.isBlocking = true;
    target.weapon = { id: "gauntlet" };
    const shot = fire();
    shot.update(16);
    expect(shot.owner).toBe(target);
    expect(shot.vx).toBeLessThan(0);
    shot.update(16);
    expect(owner.takeDamage).toHaveBeenCalledOnce();
    expect(onHit).toHaveBeenCalledWith(owner, target);
  });

  it("doesn't collide at a different height or during a dash", () => {
    const shot = fire({ y: 0 });
    target.y = 150;
    shot.update(16);
    target.y = 0;
    target.dashActive = 40;
    shot.update(16);
    expect(shot.active).toBe(true);
    expect(target.takeDamage).not.toHaveBeenCalled();
  });

  it("expires stationary shots and removes offscreen shots", () => {
    const stationary = fire({ x: 500, y: 0, vx: 0 });
    stationary.update(4100);
    expect(stationary.active).toBe(false);
    const stray = fire({ x: 925 });
    stray.update(16);
    expect(stray.active).toBe(false);
  });

  it("casts a stationary shadow double with default damage and hits above its normal range", () => {
    const clone = new Projectile({x: target.x, owner, isClone:true}, engine);
    target.y = 300;
    expect(clone.el.classList.contains("shadow-double")).toBe(true);
    clone.update(16);
    expect(target.takeDamage).toHaveBeenCalledWith(10, 0, false, false);
    clone.update(16);
    expect(target.takeDamage).toHaveBeenCalledOnce();
    expect(clone.active).toBe(false);
  });

  it("allows the player to reflect an incoming vertical shot back to the CPU's side", () => {
    owner.weapon = {id: "gauntlet"};
    owner.weaponColor = "#ffd700";
    owner.isBlocking = true;
    const shot = fire({x: owner.x, owner:target, vx:0, vy:1});
    shot.update(16);
    expect(shot.owner).toBe(owner);
    expect(shot.vx).toBeGreaterThan(0);
    expect(engine.spawnParticles).toHaveBeenCalledWith(owner.x, 80, 5, "#ffd700", 30, 200);
  });

});
