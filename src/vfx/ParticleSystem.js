import { ObjectPool } from "../utils/ObjectPool.js";
import "./impacts.css";

const CAPACITY = 96;

export class ParticleSystem {
  constructor(container) {
    this.canvas = container.querySelector("#vfx-layer");
    this.ctx = this.canvas?.getContext("2d");
    this.motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    this.pool = new ObjectPool(() => ({}), CAPACITY);
    this.painted = false;

    this.impact = document.createElement("span");
    this.impact.className = "melee-impact";
    this.impact.setAttribute("aria-hidden", "true");
    this.impact.hidden = true;
    this.impactTime = 0;
    container.append(this.impact);
  }

  contact(x, y, direction, kind) {
    this.impact.dataset.kind = kind;
    this.impact.style.left = `${x}px`;
    this.impact.style.bottom = `calc(25% + ${y}px)`;
    this.impact.style.setProperty("--strike-direction", direction);
    this.impact.hidden = false;
    this.impactTime = kind === "heavy" ? 160 : 120;
  }

  emit(x, y, count, color, spread = 40, duration = 500) {
    if (!this.ctx || this.motion?.matches) return;
    for (let i = 0; i < count && this.pool.activeCount < CAPACITY; i++) {
      const p = this.pool.acquire();
      p.x = x;
      p.y = y;
      p.vx = ((Math.random() - 0.5) * spread) / 8;
      p.vy = ((Math.random() - 0.35) * spread) / 8;
      p.life = p.duration = duration;
      p.color = color;
    }
  }

  update(dt) {
    if (this.impactTime > 0) {
      this.impactTime -= dt;
      if (this.impactTime <= 0) this.impact.hidden = true;
    }
    const frames = dt / (1000 / 60);
    for (let i = this.pool.active.length - 1; i >= 0; i--) {
      const p = this.pool.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.release(p);
        continue;
      }
      p.vy -= 0.16 * frames;
      p.x += p.vx * frames;
      p.y += p.vy * frames;
    }
  }

  // Paint only the final simulation state for this display frame.
  render(width, height) {
    if (!this.pool.activeCount && !this.painted) return;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.ctx.clearRect(0, 0, width, height);
    const floor = height * 0.75;
    for (const p of this.pool.active) {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = Math.min(1, p.life / (p.duration * 0.45));
      this.ctx.fillRect(p.x - 2, floor - p.y - 2, 4, 4);
    }
    this.painted = this.pool.activeCount > 0;
  }

  clear() {
    this.pool.releaseAll();
    this.impact.hidden = true;
    this.impactTime = 0;
    if (this.painted) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.painted = false;
    }
  }
}
