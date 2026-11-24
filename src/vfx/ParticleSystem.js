import { ObjectPool } from "../utils/ObjectPool.js";

const CAPACITY = 180;

export class ParticleSystem {
  constructor(container) {
    this.container = container;
    this.pool = new ObjectPool(() => ({ element: null }), CAPACITY);
  }

  emit(x, y, count, color, spread = 40, duration = 500) {
    for (let i = 0; i < count && this.pool.activeCount < CAPACITY; i++) {
      const p = this.pool.acquire();
      if (!p.element) {
        p.element = document.createElement("div");
        p.element.className = "particle";
        this.container.appendChild(p.element);
      }
      p.x = x;
      p.y = y;
      p.vx = ((Math.random() - 0.5) * spread) / 8;
      p.vy = ((Math.random() - 0.35) * spread) / 8;
      p.life = p.duration = duration;
      p.element.style.cssText = `left:0;bottom:25%;width:4px;height:4px;background:${color};transform:translate(${x}px,${-y}px)`;
    }
  }

  update(dt) {
    const frames = dt / (1000 / 60);
    for (let i = this.pool.active.length - 1; i >= 0; i--) {
      const p = this.pool.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.element.style.display = "none";
        this.pool.release(p);
        continue;
      }
      p.vy -= 0.16 * frames;
      p.x += p.vx * frames;
      p.y += p.vy * frames;
      p.element.style.transform = `translate(${p.x}px,${-p.y}px)`;
      p.element.style.opacity = Math.min(1, p.life / (p.duration * 0.45));
    }
  }

  clear() {
    for (const p of this.pool.active) p.element.style.display = "none";
    this.pool.releaseAll();
  }
}
