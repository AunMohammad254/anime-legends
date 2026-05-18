/**
 * Projectile.js
 * Handles individual projectile behavior and DOM representation.
 */
export class Projectile {
  constructor(config, engine) {
    this.x = config.x;
    this.y = config.y || 80;
    this.vx = config.vx || 0;
    this.vy = config.vy || 0;
    this.owner = config.owner;
    this.color = config.color;
    this.dmg = config.dmg || 10;
    this.type = config.type || "default";
    this.pierce = config.pierce || false;
    this.isClone = config.isClone || false;
    this.engine = engine;
    this.active = true;

    this.el = document.createElement("div");
    this.el.className = "proj";
    this.render();
    this.engine.arenaEl.appendChild(this.el);
  }

  update(dt) {
    this.x += this.vx;
    if (this.vy) this.y += this.vy;

    const target = this.owner.isPlayer ? this.engine.cpu : this.engine.p1;

    // Reflection Logic (Gauntlet)
    if (
      target.weapon &&
      target.weapon.id === "gauntlet" &&
      target.isBlocking &&
      Math.abs(this.x - target.x) < 80
    ) {
      this.vx *= -1;
      this.owner = target;
      this.engine.playSound("block");
      this.engine.spawnParticles(target.x, target.y + 80, 5, target.weaponColor || "#22d3ee", 30, 200);
      return;
    }

    // Collision Logic
    if (Math.abs(this.x - target.x) < 50 && (this.isClone || Math.abs(this.y - (target.y + 80)) < 100)) {
      if (!this.pierce && target.isBlocking) {
        target.takeDamage(this.dmg * 0.5, this.vx * 0.5);
        this.destroy();
        return;
      }
      target.takeDamage(this.dmg, this.vx * 0.5);
      if (this.type === "fireball") this.engine.spawnParticles(target.x, target.y + 80, 15, this.color, 60, 400);
      if (this.type === "arrow") {
        const arrow = document.createElement("div");
        arrow.innerHTML = "➔";
        arrow.style = `position:absolute; left: ${this.vx > 0 ? 10 : 60}px; top: ${40 + Math.random() * 40}px; font-size:24px; color:${this.color}; transform:rotate(${this.vx > 0 ? 15 : 165}deg); z-index: 60; filter: drop-shadow(0 0 5px ${this.color});`;
        target.el.appendChild(arrow);
        setTimeout(() => arrow.remove(), 2000);
      }
      this.destroy();
      return;
    }

    // Bounds Check
    if (this.x < -100 || this.x > this.engine.arenaEl.offsetWidth + 100) {
      this.destroy();
      return;
    }

    this.render();
  }

  render() {
    if (this.type === "arrow") {
      this.el.innerHTML = "➔";
      this.el.style = `position:absolute; left:${this.x}px; bottom:${25 + this.y / 5}%; color:${this.color}; font-size:40px; filter: drop-shadow(0 0 10px ${this.color}); transform:rotate(${this.vx > 0 ? 0 : 180}deg); display:flex; align-items:center; justify-content:center; margin-bottom:-20px;`;
    } else if (this.isClone) {
      this.el.style = `left:${this.x - 50}px; bottom:${25}%; width:100px; height:160px; background:${this.color}; opacity:0.5; clip-path: polygon(30% 0, 70% 0, 100% 100%, 0 100%);`;
    } else {
      this.el.style = `left:${this.x}px; bottom:${25 + this.y / 5}%; width:20px; height:2px; background:#fff; box-shadow: 0 0 10px ${this.color}, 0 0 20px ${this.color}; transform:rotate(${Math.atan2(this.vy || 0, this.vx)}rad);`;
    }
  }

  destroy() {
    this.active = false;
    this.el.remove();
  }
}
