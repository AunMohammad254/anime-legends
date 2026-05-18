/**
 * ui.js
 * Entry point for the UI system. Orchestrates UIManager and global window bindings.
 */
import { UIManager } from "./src/ui/UIManager.js";

class UIProxy {
  constructor() {
    this.manager = new UIManager();
  }

  init() {
    this.manager.init();
    this.bindEvents();
  }

  bindEvents() {
    // Expose necessary functions to window for HTML onclick handlers
    window.startGame = () => {
      import("./engine.js").then(({ engine }) => engine.initAudio());
      this.manager.screenManager.showScreen("character-select");
    };
    window.showScreen = (id) => this.manager.screenManager.showScreen(id);
    window.showModal = (id) => this.manager.screenManager.showModal(id);
    window.closeModal = (e) => this.manager.screenManager.closeModal(e);
    window.toggleAudio = () => this.toggleAudio();
    window.selectChar = (id) => this.manager.selectChar(id);
    window.setDifficulty = (d) => this.manager.setDifficulty(d);
    window.setHealth = (h) => this.manager.setHealth(h);
    window.preBattleCutscene = () => this.manager.preBattleCutscene();
    window.togglePause = () => this.togglePause();
    window.initBattle = () => this.manager.initBattle();
    window.endUnlimitedMode = () => this.manager.finalizeBattle(); // Or specific survival end
    window.toggleFullscreen = () => this.manager.screenManager.toggleFullscreen();

    window.setShopTab = (tab) => {
      this.manager.shopTab = tab;
      this.manager.renderShop();
    };
    window.buyCharacter = (id) => this.manager.buyCharacter(id);
    window.buySkin = (id) => this.manager.buySkin(id);
    window.toggleBoost = (id) => this.manager.toggleBoost(id);
    window.dismissRotatePrompt = () => this.manager.screenManager.dismissRotatePrompt();
    
    // Specifically for the startGame button on title screen
    window.startGameFlow = () => {
      import("./engine.js").then(({ engine }) => engine.initAudio());
      this.manager.screenManager.showScreen("character-select");
    };
  }

  toggleAudio() {
    import("./engine.js").then(({ engine }) => {
      const enabled = engine.toggleAudio();
      document.querySelector(".audio-toggle").innerText = enabled ? "🔊" : "🔇";
    });
  }

  togglePause() {
    import("./engine.js").then(({ engine }) => {
      const paused = engine.togglePause();
      document.getElementById("pause-modal").style.display = paused ? "flex" : "none";
    });
  }

  // Forwarding common methods for compatibility
  showScreen(id) { this.manager.screenManager.showScreen(id); }
  selectChar(id) { this.manager.selectChar(id); }
  setShopTab(tab) { this.manager.shopTab = tab; this.manager.renderShop(); }
  buyCharacter(id) { this.manager.buyCharacter(id); }
  buySkin(id) { this.manager.buySkin(id); }
  toggleBoost(id) { this.manager.toggleBoost(id); }
}

export const ui = new UIProxy();
