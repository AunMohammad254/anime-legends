import { UIManager } from "./src/ui/UIManager.js";
import { engine } from "./engine.js";

// Bind the controls shared by the static screens and the generated roster.
class UIProxy {
  constructor() {
    this.manager = new UIManager();
  }

  init() {
    const manager = this.manager;
    Object.assign(window, {
      startGame: () => {
        engine.initAudio();
        manager.showScreen("character-select");
      },
      showScreen: (id) => manager.showScreen(id),
      showModal: (id) => manager.screenManager.showModal(id),
      closeModal: () => manager.screenManager.closeModal(),
      toggleFullscreen: () => manager.screenManager.toggleFullscreen(),
      toggleAudio: () => {
        const enabled = engine.toggleAudio();
        const button = document.querySelector(".audio-toggle");
        button.textContent = enabled ? "Sound on" : "Sound off";
        button.setAttribute("aria-pressed", String(enabled));
      },
      selectChar: (id) => manager.selectChar(id),
      setDifficulty: (id) => manager.setDifficulty(id),
      setHealth: (health) => manager.setHealth(health),
      setShopTab: (tab) => manager.setShopTab(tab),
      buyCharacter: (id) => manager.buyCharacter(id),
      buySkin: (id) => manager.buySkin(id),
      toggleBoost: (id) => manager.toggleBoost(id),
      preBattleCutscene: () => manager.preBattleCutscene(),
      initBattle: () => manager.initBattle(),
      togglePause: () => manager.togglePause(),
      endUnlimitedMode: () => {
        if (engine.gameActive && manager.matchHealth === "unlimited") engine.gameEnd("SURVIVAL_END");
      },
    });
    const audioButton = document.querySelector(".audio-toggle");
    audioButton.textContent = engine.audioManager.enabled ? "Sound on" : "Sound off";
    audioButton.setAttribute("aria-pressed", String(engine.audioManager.enabled));
    manager.init();
  }

  showScreen(id) { this.manager.showScreen(id); }
  selectChar(id) { this.manager.selectChar(id); }
  setShopTab(tab) { this.manager.setShopTab(tab); }
  buyCharacter(id) { this.manager.buyCharacter(id); }
  buySkin(id) { this.manager.buySkin(id); }
  toggleBoost(id) { this.manager.toggleBoost(id); }
}

export const ui = new UIProxy();
