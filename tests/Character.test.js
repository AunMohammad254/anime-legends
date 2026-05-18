import { describe, it, expect, beforeEach } from "vitest";
import { Character } from "../src/entities/Character.js";

describe("Character", () => {
  let character;

  beforeEach(() => {
    character = new Character({ id: "test", name: "Test Fighter" }, true, {
      maxHp: 100,
    });
  });

  describe("constructor", () => {
    it("initializes with correct properties", () => {
      expect(character.hp).toBe(100);
      expect(character.maxHp).toBe(100);
      expect(character.isPlayer).toBe(true);
      expect(character.power).toBe(0);
    });
  });

  describe("takeDamage", () => {
    it("reduces HP by damage amount", () => {
      character.takeDamage(30);
      expect(character.hp).toBe(70);
    });

    it("does not go below 0 HP", () => {
      character.takeDamage(150);
      expect(character.hp).toBe(0);
    });

    it("returns true when character dies", () => {
      const died = character.takeDamage(100);
      expect(died).toBe(true);
    });

    it("returns false when character survives", () => {
      const died = character.takeDamage(50);
      expect(died).toBe(false);
    });
  });

  describe("isAlive", () => {
    it("returns true when HP > 0", () => {
      expect(character.isAlive()).toBe(true);
    });

    it("returns false when HP = 0", () => {
      character.takeDamage(100);
      expect(character.isAlive()).toBe(false);
    });
  });

  describe("combo system", () => {
    it("increments combo", () => {
      character.incrementCombo();
      expect(character.combo).toBe(1);
    });

    it("resets combo", () => {
      character.incrementCombo();
      character.resetCombo();
      expect(character.combo).toBe(0);
    });
  });

  describe("power system", () => {
    it("adds power", () => {
      character.addPower(2);
      expect(character.power).toBe(2);
    });

    it("caps at maxPower", () => {
      character.addPower(10);
      expect(character.power).toBe(4);
    });
  });
});
