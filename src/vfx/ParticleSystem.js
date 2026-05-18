import { ObjectPool } from "../utils/ObjectPool.js";

export class ParticleSystem {
  constructor(container) {
    this.container = container;
    this.pool = new ObjectPool(
      () => ({
        active: false,
        element: null,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        color: "",
        intervalId: null,
      }),
      500,
    );
  }

  emit(x, y, count, color, spread = 40, duration = 500) {
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();

      if (!p.element) {
        p.element = document.createElement("div");
        p.element.className = "particle";
        this.container.appendChild(p.element);
      }

      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = ((Math.random() - 0.5) * spread) / 5;
      p.vy = ((Math.random() - 0.5) * spread) / 5;
      p.color = color;
      p.life = duration;

      p.element.style.cssText = `left:${x}px; bottom:${25 + y / 5}%; width:4px; height:4px; background:${color}; display:block;`;

      let elapsed = 0;
      p.intervalId = setInterval(() => {
        elapsed += 16;
        p.x += p.vx;
        p.y += p.vy;
        p.y -= 2;
        p.element.style.left = `${p.x}px`;
        p.element.style.bottom = `${25 + p.y / 5}%`;

        if (elapsed >= duration) {
          clearInterval(p.intervalId);
          p.element.style.display = "none";
          p.active = false;
          this.pool.release(p);
        }
      }, 16);
    }
  }

  clear() {
    this.pool.active.forEach((p) => {
      if (p.intervalId) clearInterval(p.intervalId);
      if (p.element) p.element.style.display = "none";
    });
    this.pool.releaseAll();
  }
}
