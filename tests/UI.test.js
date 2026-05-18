import { describe, it, expect, beforeEach, vi } from "vitest";
import { UIManager } from "../src/ui/UIManager.js";

describe("UIManager", () => {
  let ui;

  beforeEach(() => {
    // Mock DOM elements
    document.body.innerHTML = `
      <div id="particle-canvas"></div>
      <div id="shard-count"></div>
      <div id="game-wrapper"></div>
      <div id="screen-title"></div>
      <div id="screen-character-select"></div>
      <div id="char-grid"></div>
      <div id="char-details-box"></div>
      <div id="cpu-reveal"></div>
      <div id="fight-btn"></div>
      <div id="shop-grid"></div>
      <div id="toast-container"></div>
      <div id="screen-vs"></div>
      <div id="vs-p1"></div>
      <div id="vs-cpu"></div>
      <div id="vs-text"></div>
      <div id="screen-battle"></div>
      <div id="p1-name"></div>
      <div id="cpu-name"></div>
      <div id="arena"></div>
      <div id="round-text"></div>
      <div id="end-unlimited-btn"></div>
      <div id="p1-hp-fill"></div>
      <div id="p1-hp-text"></div>
      <div id="cpu-hp-fill"></div>
      <div id="cpu-hp-text"></div>
      <div id="game-timer"></div>
      <div id="p1-orbs"></div>
      <div id="cpu-orbs"></div>
      <div id="combo-counter"></div>
      <div id="screen-result"></div>
      <div id="result-text"></div>
      <div id="result-char"></div>
      <div id="final-score"></div>
      <div id="leaderboard-content"></div>
      <div id="rotate-prompt"></div>
      <div id="touch-controls"></div>
      <div id="touch-controls-portrait"></div>
    `;

    ui = new UIManager();
  });

  it("should initialize correctly", () => {
    ui.init();
    expect(ui.screenManager).toBeDefined();
    expect(ui.hudRenderer).toBeDefined();
  });

  it("should update shards text", () => {
    ui.updateShards(100);
    expect(document.getElementById("shard-count").innerText).toBe("100");
  });

  it("should show toast message", () => {
    ui.showToast("Test Message");
    const container = document.getElementById("toast-container");
    expect(container.innerHTML).toContain("Test Message");
  });

  it("should set difficulty", () => {
    ui.setDifficulty("hard");
    expect(ui.difficulty).toBe("hard");
  });

  it("should set match health", () => {
    ui.setHealth(200);
    expect(ui.matchHealth).toBe(200);
  });
});
