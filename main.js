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
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      document.body.classList.add("mobile-optimized");
    }

    // --- State Synchronization ---
    
    // Update UI when shards change
    state.on("shardsChanged", (shards) => {
      ui.manager.updateShards(shards);
    });

    // Refresh character grid when a new character is unlocked
    state.on("characterUnlocked", () => {
      ui.manager.renderCharSelect();
    });

    // --- System Initialization ---

    // Initialize Engine (Inputs, Arena, VFX)
    engine.init();

    // Initialize UI (Screen Manager, HUD, Global Bindings)
    ui.init();

    // Link Engine to UI for HUD updates (already handled via engine.onHUDUpdate callbacks in UIManager)

    this.setupGlobalHandlers();
  }

  setupGlobalHandlers() {
    // Make modules accessible for debugging and legacy global triggers
    window.gameDebug = {
      state,
      ui: ui.manager,
      engine,
      addShards: (n) => state.addShards(n),
      unlockAll: () => ["shadow", "storm"].forEach((c) => state.unlockCharacter(c)),
    };

    console.log("Anime Legends: Systems Modularized and Initialized.");
  }
}

// Start the application when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.app = new GameApp();
});
