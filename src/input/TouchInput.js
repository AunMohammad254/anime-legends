export class TouchInput {
  constructor(engine, keyboardInput) {
    this.engine = engine;
    this.keyboardInput = keyboardInput;
    this.activePointers = new Map();
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

    for (const button of document.querySelectorAll(".touch-btn[data-key]")) {
      const key = button.dataset.key;
      this.bindControl(button, () => {
        this.keyboardInput.setKeyState(key, true, button);
        button.classList.add("pressed");
      }, () => {
        this.keyboardInput.setKeyState(key, false, button);
        button.classList.remove("pressed");
      });
    }

    window.addEventListener("blur", () => this.reset(), options);
    window.addEventListener("orientationchange", () => this.reset(), options);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    }, options);
  }

  makeJoystick(outer, inner, zone) {
    if (!outer || !inner || !zone) return;
    this.bindControl(zone, (event) => {
      const rect = outer.getBoundingClientRect();
      const radius = Math.min(rect.width, rect.height) / 2;
      if (radius <= 0) return;
      const dx = (event.clientX - rect.left - rect.width / 2) / radius;
      const dy = (event.clientY - rect.top - rect.height / 2) / radius;
      const scale = Math.max(1, Math.hypot(dx, dy));
      const travel = Math.max(0, radius - inner.offsetWidth / 2);
      inner.style.transform = `translate(${dx / scale * travel}px, ${dy / scale * travel}px)`;
      this.keyboardInput.setKeyState("ArrowLeft", dx / scale < -0.3, zone);
      this.keyboardInput.setKeyState("ArrowRight", dx / scale > 0.3, zone);
      this.keyboardInput.setKeyState("ArrowUp", dy / scale < -0.3, zone);
    }, () => {
      this.keyboardInput.cancelSource(zone);
      inner.style.transform = "";
    });
  }

  bindControl(element, update, release) {
    const options = { signal: this.listeners.signal };
    let pointerId = null;
    const finish = (cancelled) => {
      const id = pointerId;
      pointerId = null;
      this.activePointers.delete(id);
      if (cancelled) this.keyboardInput.cancelSource(element);
      release();
      if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
    };

    element.addEventListener("pointerdown", (event) => {
      if (!this.engine.gameActive || this.engine.paused || event.button !== 0 || pointerId !== null) return;
      event.preventDefault();
      pointerId = event.pointerId;
      this.activePointers.set(pointerId, finish);
      element.setPointerCapture?.(pointerId);
      update(event);
    }, options);

    element.addEventListener("pointermove", (event) => {
      if (event.pointerId === pointerId) update(event);
    }, options);

    const end = (event) => {
      if (event.pointerId === pointerId) finish(event.type !== "pointerup");
    };
    element.addEventListener("pointerup", end, options);
    element.addEventListener("pointercancel", end, options);
    element.addEventListener("lostpointercapture", end, options);
  }

  reset() {
    for (const finish of this.activePointers.values()) finish(true);
  }

  destroy() {
    this.reset();
    this.listeners?.abort();
    this.listeners = null;
  }
}
