const FIGHT_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyZ", "KeyX", "KeyC", "KeyV"]);
const INPUT_BUFFER_MS = 160;

export class KeyboardInput {
  constructor(engine) {
    this.engine = engine;
    this.held = new Map();
    this.presses = new Map();
    this.releases = new Map();
    this.listeners = null;
  }

  init() {
    if (this.listeners) return;
    this.listeners = new AbortController();
    const options = { signal: this.listeners.signal };
    window.addEventListener("keydown", (event) => this.handleKeyDown(event), options);
    window.addEventListener("keyup", (event) => this.handleKeyUp(event), options);
    window.addEventListener("blur", () => this.reset(), options);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.reset();
        if (this.engine.gameActive && !this.engine.paused) this.togglePause();
      }
    }, options);
  }

  destroy() {
    this.listeners?.abort();
    this.listeners = null;
    this.reset();
  }

  togglePause() {
    if (window.togglePause) window.togglePause();
    else this.engine.togglePause();
  }

  handleKeyDown(event) {
    if (!this.engine.gameActive || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target?.closest?.("input, textarea, select, [contenteditable=true]")) return;

    if (event.code === "Escape") {
      event.preventDefault();
      if (!event.repeat) this.togglePause();
      return;
    }

    if (this.engine.paused || !FIGHT_KEYS.has(event.code)) return;
    // Preserve native Space activation for players navigating the battle menu by keyboard.
    if (event.code === "Space" && event.target?.closest?.("button, a[href]")) return;
    event.preventDefault();
    if (!event.repeat) this.setKeyState(event.code, true);
  }

  handleKeyUp(event) {
    this.setKeyState(event.code, false);
  }

  isPressed(code) {
    return this.held.has(code);
  }

  setKeyState(code, pressed, source = "keyboard") {
    const sources = this.held.get(code);
    if (pressed) {
      if (sources) {
        sources.add(source);
      } else {
        this.held.set(code, new Set([source]));
        this.presses.set(code, performance.now());
      }
    } else if (sources?.delete(source) && sources.size === 0) {
      this.held.delete(code);
      this.releases.set(code, performance.now());
    }
  }

  // Capture a tap that starts and ends between two simulation steps.
  consumePress(code) {
    return this.consume(this.presses, code);
  }

  consumeRelease(code) {
    return this.consume(this.releases, code);
  }

  consume(buffer, code) {
    const time = buffer.get(code);
    buffer.delete(code);
    return time !== undefined && performance.now() - time <= INPUT_BUFFER_MS;
  }

  cancelSource(source) {
    for (const [code, sources] of this.held) {
      if (sources.delete(source) && sources.size === 0) {
        this.held.delete(code);
        this.presses.delete(code);
        this.releases.delete(code);
      }
    }
  }

  reset() {
    this.held.clear();
    this.presses.clear();
    this.releases.clear();
  }
}
