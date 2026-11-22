import { SCREENS } from "../../constants.js";

export class ScreenManager {
  constructor(ui) {
    this.ui = ui;
    this.activeScreen = "title";
  }

  init() {
    window.addEventListener("resize", () => this.applyBattleTouchLayout());
    document.getElementById("modal-how-to-play")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) this.closeModal();
    });
    document.getElementById("pause-modal")?.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.ui.togglePause();
    });
    const fullscreenButton = document.getElementById("fullscreen-btn");
    if (fullscreenButton) fullscreenButton.hidden = !document.fullscreenEnabled && !document.webkitFullscreenEnabled;
  }

  showScreen(id) {
    const target = document.getElementById(`screen-${id}`);
    if (!target || !SCREENS.includes(id)) return;
    this.activeScreen = id;
    SCREENS.forEach((screen) => {
      document.getElementById(`screen-${screen}`)?.classList.toggle("active", screen === id);
    });
    this.applyBattleTouchLayout();
    target.scrollTop = 0;
    const heading = id === "battle" ? target : target.querySelector("h1, h2") || target;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }

  applyBattleTouchLayout() {
    const isTouch = navigator.maxTouchPoints > 0 || window.matchMedia?.("(any-pointer: coarse)").matches;
    const showControls = this.activeScreen === "battle" && isTouch;
    const portrait = window.innerHeight > window.innerWidth;
    document.getElementById("screen-battle")?.classList.toggle("portrait-mode", Boolean(showControls && portrait));
    document.getElementById("touch-controls")?.classList.toggle("active", Boolean(showControls && !portrait));
  }

  showModal(id) {
    document.getElementById(`modal-${id}`)?.showModal();
  }

  closeModal() {
    document.getElementById("modal-how-to-play")?.close();
  }

  async toggleFullscreen() {
    try {
      const doc = document.documentElement;
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else document.webkitExitFullscreen?.();
      } else if (doc.requestFullscreen) await doc.requestFullscreen();
      else doc.webkitRequestFullscreen?.();
    } catch {
      this.ui.showToast("Fullscreen is unavailable in this browser.");
    }
  }
}
