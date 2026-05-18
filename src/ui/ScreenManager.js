import { SCREENS } from "../../constants.js";

/**
 * ScreenManager.js
 * Handles screen transitions, modals, orientation, and full-screen logic.
 */
export class ScreenManager {
  constructor(ui) {
    this.ui = ui;
    this.activeScreen = "title";
    this.rotatePromptDismissed = false;
  }

  init() {
    this.setupResponsiveScaling();
  }

  setupResponsiveScaling() {
    const wrapper = document.getElementById("game-wrapper");
    if (!wrapper) return;

    const scaleWrapper = () => {
      wrapper.style.width = "100dvw";
      wrapper.style.height = "100dvh";
    };

    const handleOrientation = () => {
      const rotatePrompt = document.getElementById("rotate-prompt");
      const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const isPortrait = window.innerHeight > window.innerWidth;

      if (!isPortrait) {
        this.rotatePromptDismissed = false;
      }

      if (rotatePrompt) {
        if (isTouchDevice && isPortrait && !this.rotatePromptDismissed) {
          rotatePrompt.style.display = "flex";
        } else {
          rotatePrompt.style.display = "none";
        }
      }

      this.applyBattleTouchLayout();
    };

    window.addEventListener("resize", scaleWrapper);
    window.addEventListener("resize", handleOrientation);
    window.addEventListener("orientationchange", handleOrientation);

    scaleWrapper();
    handleOrientation();
  }

  showScreen(id) {
    SCREENS.forEach((s) => {
      const el = document.getElementById(`screen-${s}`);
      if (el) el.classList.remove("active");
    });
    const target = document.getElementById(`screen-${id}`);
    if (target) target.classList.add("active");
    
    this.activeScreen = id;
    this.applyBattleTouchLayout();
  }

  applyBattleTouchLayout() {
    const battleScreen = document.getElementById("screen-battle");
    const touchEl = document.getElementById("touch-controls");
    const portraitEl = document.getElementById("touch-controls-portrait");
    if (!battleScreen || !touchEl || !portraitEl) return;

    const isActive = this.activeScreen === "battle";
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isPortrait = window.innerHeight > window.innerWidth;

    battleScreen.classList.remove("portrait-mode");
    touchEl.classList.remove("active");

    if (isActive && isTouch) {
      if (isPortrait) {
        battleScreen.classList.add("portrait-mode");
      } else {
        touchEl.classList.add("active");
      }
    }
  }

  showModal(id) {
    const el = document.getElementById(`modal-${id}`);
    if (el) el.style.display = "flex";
  }

  closeModal(e) {
    if (e && e.target.classList.contains("pause-overlay")) {
      e.target.style.display = "none";
    } else if (!e) {
      document.querySelectorAll(".pause-overlay").forEach((m) => {
        if (m.id.startsWith("modal")) m.style.display = "none";
      });
    }
  }

  toggleFullscreen() {
    const doc = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (doc.requestFullscreen) doc.requestFullscreen();
      else if (doc.webkitRequestFullscreen) doc.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  }

  dismissRotatePrompt() {
    this.rotatePromptDismissed = true;
    const rotatePrompt = document.getElementById("rotate-prompt");
    if (rotatePrompt) {
      rotatePrompt.style.display = "none";
    }
  }
}
