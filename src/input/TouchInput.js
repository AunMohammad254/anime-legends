const actionSelector = ".touch-btn[data-key]";
const thumbSlop = 10;

export class TouchInput {
  constructor(engine, keyboardInput) {
    this.engine = engine;
    this.keyboardInput = keyboardInput;
    this.activePointers = new Map();
    this.pressedButtons = new Map();
    this.listeners = null;
  }

  init() {
    if (this.listeners) return;
    this.listeners = new AbortController();
    const options = { signal: this.listeners.signal };
    for (const prefix of ["", "portrait-"]) {
      this.makeJoystick(
        document.getElementById(prefix + "joystick-outer"),
        document.getElementById(prefix + "joystick-inner"),
        document.getElementById(prefix + "joystick-zone"),
      );
    }

    for (const button of document.querySelectorAll(actionSelector)) {
      this.bindControl(button, event => this.setButton(event.pointerId, button),
        event => this.slideButton(event),
        (id, cancelled) => this.setButton(id, null, cancelled));
    }

    window.addEventListener("blur", () => this.reset(), options);
    window.addEventListener("orientationchange", () => this.reset(), options);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    }, options);
  }

  slideButton(event) {
    const { pointerId, clientX, clientY } = event;
    const next = document.elementFromPoint(clientX, clientY)?.closest(actionSelector);
    const previous = this.pressedButtons.get(pointerId);
    if (!next && previous) {
      // Let a thumb drift over the lip of a held button without breaking guard or charge.
      const rect = previous.getBoundingClientRect();
      if (clientX >= rect.left - thumbSlop && clientX <= rect.right + thumbSlop &&
          clientY >= rect.top - thumbSlop && clientY <= rect.bottom + thumbSlop) return;
    }
    // A slide away from Power cancels the charge. Only a deliberate lift casts a special.
    this.setButton(pointerId, next, previous?.dataset.key === "KeyV");
  }

  setButton(id, button, cancelled = false) {
    const previous = this.pressedButtons.get(id);
    if (previous === button) return;
    if (previous) {
      this.pressedButtons.delete(id);
      if (cancelled) this.keyboardInput.cancelSource(id);
      else this.keyboardInput.setKeyState(previous.dataset.key, false, id);
      if (![...this.pressedButtons.values()].includes(previous)) previous.classList.remove("pressed");
    }
    if (button) {
      this.pressedButtons.set(id, button);
      this.keyboardInput.setKeyState(button.dataset.key, true, id);
      button.classList.add("pressed");
    }
  }

  makeJoystick(outer, inner, zone) {
    if (!outer || !inner || !zone) return;
    let rect, radius, travel;
    const move = (event) => {
      if (radius <= 0) return;
      const dx = (event.clientX - rect.left - rect.width / 2) / radius;
      const dy = (event.clientY - rect.top - rect.height / 2) / radius;
      const scale = Math.max(1, Math.hypot(dx, dy));
      const x = dx / scale, y = dy / scale;
      inner.style.transform = `translate(${x * travel}px, ${y * travel}px)`;

      // A smaller release threshold prevents thumb jitter from interrupting movement.
      // Jump takes a deeper tilt so a shallow diagonal still walks forward.
      const left = x < -(zone.dataset.horizontal === "left" ? .14 : .24);
      const right = x > (zone.dataset.horizontal === "right" ? .14 : .24);
      const jump = y < -(zone.dataset.jump ? .38 : .58);
      if (left || right) zone.dataset.horizontal = left ? "left" : "right";
      else delete zone.dataset.horizontal;
      if (jump) zone.dataset.jump = "true";
      else delete zone.dataset.jump;
      this.keyboardInput.setKeyState("ArrowLeft", left, zone);
      this.keyboardInput.setKeyState("ArrowRight", right, zone);
      this.keyboardInput.setKeyState("ArrowUp", jump, zone);
    };

    this.bindControl(zone, event => {
      rect = outer.getBoundingClientRect();
      radius = Math.min(rect.width, rect.height) / 2;
      travel = Math.max(0, radius - inner.offsetWidth / 2);
      move(event);
    }, move, (_id, cancelled) => {
      if (cancelled) this.keyboardInput.cancelSource(zone);
      else {
        // Keep a short upward flick buffered even if it starts and ends between frames.
        for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp"]) this.keyboardInput.setKeyState(key, false, zone);
      }
      delete zone.dataset.horizontal;
      delete zone.dataset.jump;
      inner.style.transform = "";
    }, true);
  }

  bindControl(element, start, move, release, singlePointer = false) {
    const options = { signal: this.listeners.signal };
    const pointers = new Set();
    const finish = (id, cancelled) => {
      pointers.delete(id);
      this.activePointers.delete(id);
      release(id, cancelled);
      if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
    };

    element.addEventListener("pointerdown", (event) => {
      if (!this.engine.gameActive || this.engine.paused || event.button !== 0 || (singlePointer && pointers.size)) return;
      event.preventDefault();
      const id = event.pointerId;
      pointers.add(id);
      this.activePointers.set(id, () => finish(id, true));
      element.setPointerCapture?.(id);
      start(event);
    }, options);

    element.addEventListener("pointermove", (event) => {
      if (pointers.has(event.pointerId)) move(event);
    }, options);

    const end = (event) => {
      if (pointers.has(event.pointerId)) finish(event.pointerId, event.type !== "pointerup");
    };
    element.addEventListener("pointerup", end, options);
    element.addEventListener("pointercancel", end, options);
    element.addEventListener("lostpointercapture", end, options);
  }

  reset() {
    for (const finish of this.activePointers.values()) finish();
  }

  destroy() {
    this.reset();
    this.listeners?.abort();
    this.listeners = null;
  }
}
