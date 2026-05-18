/**
 * TouchInput.js
 * Manages touch-based controls including virtual joysticks and action buttons.
 */
export class TouchInput {
  constructor(engine, keyboardInput) {
    this.engine = engine;
    this.keyboardInput = keyboardInput; // Shared state
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  init() {
    const touchEl = document.getElementById("touch-controls");
    if (!touchEl) return;

    // Landscape joystick
    this.makeJoystick(
      document.getElementById("joystick-outer"),
      document.getElementById("joystick-inner"),
      document.getElementById("joystick-zone"),
    );

    // Portrait joystick
    this.makeJoystick(
      document.getElementById("portrait-joystick-outer"),
      document.getElementById("portrait-joystick-inner"),
      document.getElementById("portrait-joystick-zone"),
    );

    // Action Buttons
    this.setupActionButtons();
  }

  /**
   * Reusable joystick factory.
   */
  makeJoystick(outerEl, innerEl, zoneEl) {
    if (!outerEl || !innerEl || !zoneEl) return;
    let touchId = null;
    let center = { x: 0, y: 0 };

    const getCenter = () => {
      const r = outerEl.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    const move = (cx, cy) => {
      const radius = outerEl.offsetWidth / 2;
      let dx = cx - center.x,
        dy = cy - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) {
        dx = (dx / dist) * radius;
        dy = (dy / dist) * radius;
      }
      innerEl.style.transform = `translate(${dx}px, ${dy}px)`;
      const t = radius * 0.3;
      
      this.keyboardInput.setKeyState("ArrowLeft", dx < -t);
      this.keyboardInput.setKeyState("ArrowRight", dx > t);
      this.keyboardInput.setKeyState("ArrowUp", dy < -t);
    };

    const reset = () => {
      innerEl.style.transform = "translate(0,0)";
      this.keyboardInput.setKeyState("ArrowLeft", false);
      this.keyboardInput.setKeyState("ArrowRight", false);
      this.keyboardInput.setKeyState("ArrowUp", false);
      touchId = null;
    };

    zoneEl.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        touchId = t.identifier;
        center = getCenter();
        move(t.clientX, t.clientY);
      },
      { passive: false },
    );

    zoneEl.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier === touchId) {
            move(t.clientX, t.clientY);
            break;
          }
        }
      },
      { passive: false },
    );

    zoneEl.addEventListener("touchend", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === touchId) {
          reset();
          break;
        }
      }
    });
    
    zoneEl.addEventListener("touchcancel", reset);
  }

  setupActionButtons() {
    document.querySelectorAll(".touch-btn").forEach((btn) => {
      const keyCode = btn.dataset.key;
      if (!keyCode) return;

      btn.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          this.keyboardInput.setKeyState(keyCode, true);
          btn.classList.add("pressed");
        },
        { passive: false },
      );

      btn.addEventListener(
        "touchend",
        (e) => {
          e.preventDefault();
          this.keyboardInput.setKeyState(keyCode, false);
          btn.classList.remove("pressed");
        },
        { passive: false },
      );

      btn.addEventListener("touchcancel", () => {
        this.keyboardInput.setKeyState(keyCode, false);
        btn.classList.remove("pressed");
      });
    });
  }
}
