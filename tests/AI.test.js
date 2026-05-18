import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AIController } from "../src/ai/AIController.js";
import { getDifficultyParams, DIFFICULTY_LEVELS } from "../src/ai/DifficultyConfig.js";

describe("DifficultyConfig", () => {
  it("should return correct params for easy", () => {
    expect(getDifficultyParams("easy")).toBe(DIFFICULTY_LEVELS.easy);
  });
  
  it("should return normal params as default", () => {
    expect(getDifficultyParams("unknown")).toBe(DIFFICULTY_LEVELS.normal);
  });
});

describe("AIController", () => {
  let ai;
  let cpu;
  let p1;
  let engine;

  beforeEach(() => {
    cpu = {
      x: 500,
      y: 0,
      hp: 100,
      maxHp: 100,
      power: 0,
      state: "idle",
      cooldowns: { ult: 0 },
      setState: vi.fn(),
      pendingActions: []
    };
    p1 = { x: 100, y: 0, state: "idle" };
    engine = {
      difficulty: "normal",
      activeWeaponDrop: null,
      gameActive: true,
      attack: vi.fn(),
      useSpecial: vi.fn(),
      useUltimate: vi.fn()
    };

    ai = new AIController(cpu, p1, engine);
    // Mock Date.now to return 0 to bypass execution delay
    vi.spyOn(Date, "now").mockReturnValue(0);
    // Mock Math.random for predictable behavior
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should approach when far away", () => {
    ai.state = "APPROACH";
    ai.update();
    expect(cpu.setState).toHaveBeenCalledWith("run");
    expect(cpu.vx).toBeLessThan(0); // Approaching player at x: 100
  });

  it("should transition to ATTACK when close", () => {
    cpu.x = 200; // Close to player at x: 100
    ai.state = "APPROACH";
    ai.update();
    expect(ai.state).toBe("ATTACK");
  });

  it("should perform light attack if random is low", () => {
    cpu.x = 150; // dist <= 130
    ai.state = "ATTACK";
    // For normal difficulty, lightWeight is 0.55
    vi.spyOn(Math, "random").mockReturnValue(0.1); 
    ai.update();
    expect(engine.attack).toHaveBeenCalledWith(cpu, p1, "attack_light");
  });

  it("should block when random is high", () => {
    cpu.x = 150; // dist <= 130
    ai.state = "ATTACK";
    vi.spyOn(Math, "random").mockReturnValue(0.9); 
    ai.update();
    expect(ai.state).toBe("BLOCK");
  });

  it("should retreat if HP is low and not expert", () => {
    cpu.hp = 20; // < 30%
    ai.state = "ATTACK";
    ai.update();
    expect(ai.state).toBe("RETREAT");
  });

  it("should go for weapon drop if present and hp < 70%", () => {
    cpu.hp = 60;
    engine.activeWeaponDrop = { x: 800 };
    ai.update(); // Any state
    expect(cpu.setState).toHaveBeenCalledWith("run");
    expect(cpu.vx).toBeGreaterThan(0); // Moving towards weapon at x: 800
  });

  it("should use ultimate if conditions met", () => {
    cpu.hp = 40; // < 50%
    cpu.power = 3;
    ai.state = "ATTACK";
    ai.update();
    expect(ai.state).toBe("ULTIMATE");
  });
});
