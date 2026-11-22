export class Projectile {
  constructor(config, engine) {
    this.engine = engine;
    this.x = config.x;
    this.y = config.y ?? 80;
    this.vx = config.vx ?? 0;
    this.vy = config.vy ?? 0;
    this.owner = config.owner;
    this.color = config.color ?? this.owner.data.color;
    this.dmg = config.dmg ?? 10;
    this.type = config.type ?? "default";
    this.pierce = config.pierce ?? false;
    this.isClone = config.isClone ?? false;
    this.onHit = config.onHit;
    this.life = 4000;
    this.active = true;

    this.el = document.createElement("div");
    this.el.className = "proj";
    this.el.style.color = this.color;
    if (this.isClone) {
      this.el.classList.add("shadow-double");
    } else if (this.type === "arrow") {
      this.el.textContent = "➜";
      this.el.classList.add("arrow-shot");
    } else {
      this.el.classList.add("spirit-shot");
    }
    this.render();
    this.engine.arenaEl.appendChild(this.el);
  }

  update(dt) {
    if (!this.active) return;
    this.life -= dt;
    this.x += this.vx;
    this.y += this.vy;
    const arena = this.engine.arenaEl;
    if (this.life <= 0 || this.x < -100 || this.x > arena.offsetWidth + 100 || this.y < -100 || this.y > arena.offsetHeight + 100) {
      this.destroy();
      return;
    }

    const target = this.owner.isPlayer ? this.engine.cpu : this.engine.p1;
    const aligned = this.isClone || Math.abs(this.y - (target.y + 80)) < 86;
    const gap = Math.abs(this.x - target.x);
    if (target.hp > 0 && aligned && gap < 75 && target.weapon?.id === "gauntlet" && target.isBlocking) {
      this.owner = target;
      // Aim back at the shooter even if the projectile was almost vertical.
      this.vx = (target.isPlayer ? this.engine.cpu.x - target.x : this.engine.p1.x - target.x) >= 0
        ? Math.max(6, Math.abs(this.vx))
        : -Math.max(6, Math.abs(this.vx));
      this.x = target.x + Math.sign(this.vx) * 45;
      this.engine.playSound("block");
      this.engine.spawnParticles(target.x, target.y + 80, 5, target.weaponColor || "#22d3ee", 30, 200);
    } else if (target.hp > 0 && aligned && gap < 50 && target.dashActive <= 0) {
      const blocked = target.isBlocking;
      target.takeDamage(this.dmg, this.vx * 0.5, false, blocked && !this.pierce);
      if (!blocked && target.hp > 0) this.onHit?.(target, this.owner);
      this.engine.spawnParticles(this.x, this.y, 8, this.color, 45, 250);
      this.destroy();
      return;
    }
    this.render();
  }

  render() {
    this.el.style.left = `${this.x}px`;
    this.el.style.bottom = `calc(25% + ${this.y}px)`;
    if (!this.isClone) {
      this.el.style.transform = `translate(-50%, 50%) rotate(${Math.atan2(-this.vy, this.vx)}rad)`;
    }
  }

  destroy() {
    this.active = false;
    this.el.remove();
  }
}
