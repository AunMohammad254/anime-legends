import { beforeEach, describe, expect, it, vi } from "vitest";
import { Projectile } from "../src/entities/Projectile.js";

describe("Projectile in the battle arena", () => {
  let engine;
  let owner;
  let target;
  let onHit;

  beforeEach(() => {
    const arenaEl = document.createElement("div");
    Object.defineProperties(arenaEl, { offsetWidth: { value: 800 }, offsetHeight: { value: 500 } });
    owner = { x: 130, y: 0, hp: 100, data: { color: "#f00" }, isPlayer: true, dashActive: 0, takeDamage: vi.fn() };
    target = { ...owner, x: 210, isPlayer: false, isBlocking: false, takeDamage: vi.fn() };
    engine = { arenaEl, p1: owner, cpu: target, spawnParticles: vi.fn(), playSound: vi.fn() };
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
});
