/**
 * KeyboardInput.js
 * Manages keyboard event listeners and state.
 */
export class KeyboardInput {
  constructor(engine) {
    this.engine = engine;
    this.keyState = {};
    this.onKeyDown = this.handleKeyDown.bind(this);
    this.onKeyUp = this.handleKeyUp.bind(this);
  }

  init() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  handleKeyDown(e) {
    this.keyState[e.code] = true;
    
    if (e.code === "Escape") {
      if (window.togglePause) window.togglePause();
      else if (this.engine.togglePause) this.engine.togglePause();
    }
    
    if (["ArrowUp", "ArrowDown", "Space"].includes(e.code)) {
      e.preventDefault();
    }
  }

  handleKeyUp(e) {
    this.keyState[e.code] = false;
  }

  isPressed(code) {
    return !!this.keyState[code];
  }

  setKeyState(code, value) {
    this.keyState[code] = value;
  }
}
