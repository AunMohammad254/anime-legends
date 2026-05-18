/**
 * main.js
 * Entry point for Anime Legends.
 * Orchestrates State, UI, and Engine modules.
 */

import { state } from "./state.js";
import { ui } from "./ui.js";
import { engine } from "./engine.js";

class GameApp {
  constructor() {
    this.init();
  }

  init() {
    // Detect mobile to apply performance optimizations
    const isTouchDevice =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      document.body.classList.add("mobile-optimized");
    }

    // Initialize State

    // Listen for state changes
    state.on("shardsChanged", (shards) => {
      ui.updateShards(shards);
    });

    state.on("characterUnlocked", () => {
      ui.renderCharSelect();
    });

    // Initialize Engine
    engine.init();

    // Initialize UI
    ui.init();

    this.setupGlobalHandlers();
  }

  setupGlobalHandlers() {
    window.addEventListener("resize", () => {
      // UI already handles window resize for particles
    });

    // Make modules accessible for debugging
    window.gameDebug = {
      state,
      ui,
      engine,
      addShards: (n) => state.addShards(n),
      unlockAll: () =>
        ["shadow", "storm"].forEach((c) => state.unlockCharacter(c)),
    };
  }
}

// Start the application when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.app = new GameApp();
});
