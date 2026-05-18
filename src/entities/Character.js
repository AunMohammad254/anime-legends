import { WEAPON_SKINS } from "../../constants.js";

/**
 * Character.js
 * Comprehensive character entity representing players and NPCs.
 */
export class Character {
  constructor(data, isPlayer, engine, options = {}) {
    this.data = data;
    this.isPlayer = isPlayer;
    this.engine = engine;
    this.x = isPlayer
      ? engine.arenaEl.offsetWidth * 0.2
      : engine.arenaEl.offsetWidth * 0.8;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;

    this.maxHp = options.maxHp || engine.matchHealth;
    this.hp = this.maxHp;
    this.power = options.startPower || 0;
    this.spdMult = options.spdMult || 1;
    this.maxPower = 4;

    this.skinId = options.skinId || "default";
    const skin = WEAPON_SKINS.find((s) => s.id === this.skinId);
    this.weaponColor = skin?.color || null;
    if (!isPlayer) this.weaponColor = "#ff0000"; // Ensure CPU projectiles/weapons are red

    this.state = `idle_${data.id}`;
    this.dir = isPlayer ? 1 : -1;
    this.cooldowns = { attack: 0, dash: 0, special: 0, hurt: 0, ult: 0, actionLock: 0 };
    this.combo = 0;
    this.comboTimer = 0;
    this.isBlocking = false;
    this.dashActive = 0;
    this.weapon = null;
    this.ultCharge = 0;
    this.history = [];
    this.opacity = 1;
    this.pendingActions = [];

    this.el = document.getElementById(isPlayer ? "p1-sprite" : "cpu-sprite");

    const displayColor = isPlayer ? data.color : "#ff0000"; // Make enemy character Red
    if (this.el) {
      if (!isPlayer) {
        this.el.style.filter = "drop-shadow(0 0 15px #ff0000) drop-shadow(0 0 5px #ff0000)";
      } else {
        this.el.style.filter = `drop-shadow(0 0 10px ${data.color})`;
      }
      this.el.innerHTML = this.createFighterHTML(displayColor) + '<div class="aura"></div>';
      this.el.style.color = displayColor;
      this.auraEl = this.el.querySelector(".aura");
      if (this.auraEl) {
        this.auraEl.style.background = `radial-gradient(circle, ${displayColor} 0%, transparent 70%)`;
      }
    }
  }

  createFighterHTML(color) {
    return `<div class="fighter-inner" style="color: ${color}"><div class="sprite-part s-head"></div><div class="sprite-part s-body"></div><div class="sprite-part s-arm-l"></div><div class="sprite-part s-arm-r"></div><div class="sprite-part s-leg-l"></div><div class="sprite-part s-leg-r"></div></div>`;
  }

  update(dt, opponent) {
    if (this.hp <= 0 && this.state !== "ko") {
      this.setState("ko");
      this.engine.playSound("ko");
    }
    if (this.state === "ko") {
      if (this.y > 0) {
        this.vy += 0.6;
        this.y -= this.vy;
        if (this.y < 0) this.y = 0;
      }
      this.render();
      return;
    }

    this.vy += 0.6;
    this.y -= this.vy;
    if (this.y <= 0) {
      if (this.y < 0 && this.vy > 10) this.setState(`idle_${this.data.id}`); // land
      this.y = 0;
      this.vy = 0;
    }

    this.x += this.vx;
    this.vx *= 0.85;
    if (this.x < 50) this.x = 50;
    if (this.engine.arenaEl && this.x > this.engine.arenaEl.offsetWidth - 50)
      this.x = this.engine.arenaEl.offsetWidth - 50;

    const dist = Math.abs(this.x - opponent.x);
    if (dist < 80 && this.y === 0 && opponent.y === 0) {
      const push = (80 - dist) * 0.5;
      this.x += this.x < opponent.x ? -push : push;
    }

    Object.keys(this.cooldowns).forEach((k) => {
      if (this.cooldowns[k] > 0) this.cooldowns[k] -= dt;
    });
    if (this.dashActive > 0) this.dashActive -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    this.pendingActions = this.pendingActions.filter((a) => {
      a.delay -= dt;
      if (a.delay <= 0) {
        a.execute();
        return false;
      }
      return true;
    });

    if (this.weapon) {
      this.weapon.dur -= dt / 1000;
      if (this.weapon.dur <= 0 || this.weapon.hits <= 0) {
        this.engine.spawnParticles(this.x, 100, 10, this.weaponColor || this.weapon.color, 40, 500);
        this.weapon = null;
        const wEl = this.el?.querySelector(".equipped-weapon");
        if (wEl) wEl.remove();
      } else if (this.weapon.id === "orb") {
        if (dist < 80 && opponent.dashActive <= 0 && !opponent.isBlocking) {
          opponent.takeDamage((5 * dt) / 1000, 0, true); // True for chip/passive dmg
        }
      }
    }

    // Character Passives
    this.applyPassives(dt, opponent, dist);

    if (this.auraEl) {
      const pRatio = this.power / this.maxPower;
      this.auraEl.style.transform = `scale(${1 + pRatio})`;
      this.auraEl.style.opacity = 0.15 + pRatio * 0.25;
    }

    this.history.unshift({ x: this.x, y: this.y });
    if (this.history.length > 5) this.history.pop();
    if (Math.abs(this.vx) > 5 || this.dashActive > 0) {
      this.engine.trails.push({
        x: this.x,
        y: this.y,
        dir: this.dir,
        color: this.data.color,
        life: 1,
      });
    }

    this.opacity = Math.min(1, this.opacity + dt / 1000);
    this.render();
  }

  applyPassives(dt, opponent, dist) {
    if (this.data.id === "blaze" && (Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1) && Math.random() < 0.2) {
      this.spawnEmber(this.x, this.y);
    } else if (this.data.id === "storm" && dist < 100) {
      opponent.takeDamage((1 * dt) / 1000, 0, true);
      if (Math.random() < 0.1)
        this.engine.spawnParticles(this.x + (opponent.x - this.x) / 2, 100, 1, "#22d3ee", 10, 100);
    }
  }

  render() {
    if (!this.el) return;
    this.el.className = `fighter ${this.state} ${this.cooldowns.hurt > 0 ? "hurt" : ""}`;
    this.el.style.left = `${this.x - 50}px`;
    this.el.style.bottom = `${25 + this.y / 5}%`;
    this.el.style.transform = `scaleX(${this.dir})`;
    this.el.style.opacity = this.opacity;
  }

  setState(s) {
    if (this.state !== "ko") this.state = s;
  }

  takeDamage(dmg, knockback = 0, isPassive = false) {
    if (this.dashActive > 0 && !isPassive) return;

    let finalDmg = dmg;

    if (!isPassive) {
      if (this.isPlayer) {
        if (this.engine.difficulty === "easy") finalDmg *= 0.7;
        if (this.engine.difficulty === "hard") finalDmg *= 1.3;
        if (this.engine.difficulty === "expert") finalDmg *= 1.8;
        if (this.engine.matchHealth === "unlimited") finalDmg *= 1 + (this.engine.survivalKills || 0) * 0.4;
      } else {
        if (this.engine.difficulty === "easy") finalDmg *= 1.3;
        if (this.engine.difficulty === "hard") finalDmg *= 0.8;
        if (this.engine.difficulty === "expert") finalDmg *= 0.6;
      }
    }

    let isBlocked = this.isBlocking && !isPassive;

    if (isBlocked) {
      finalDmg *= 0.3;
      knockback *= 0.5;
      this.engine.playSound("block");
      this.engine.spawnParticles(this.x, this.y + 80, 5, "#fff", 30, 300);
      this.spawnDmg(this.x, this.y + 120, "BLOCK", "#888");
    } else if (!isPassive) {
      this.cooldowns.hurt = 250;
      this.engine.playSound("light");
      const isHeavy = finalDmg > 15;
      this.engine.spawnParticles(this.x, this.y + 80, isHeavy ? 25 : 8, this.data.color, isHeavy ? 120 : 40, isHeavy ? 600 : 400);
      this.spawnDmg(this.x, this.y + 100, Math.floor(finalDmg), isHeavy ? "#f97316" : "#fff");

      knockback *= isHeavy ? 1.8 : 1.2;
      if (isHeavy && this.engine.onShake) this.engine.onShake(12);
    }

    this.hp = Math.max(0, this.hp - finalDmg);
    this.vx += knockback;
    if (!isPassive) this.power = Math.min(this.maxPower, this.power + 0.2);

    if (this.hp < 25 && Math.random() < 0.3 && !isPassive) {
      const c = document.createElement("div");
      c.className = "ground-crack";
      c.style.left = `${this.x - 15}px`;
      c.style.bottom = `25%`;
      this.engine.arenaEl.appendChild(c);
    }
    if (this.hp <= 0 && this.state !== "ko") this.engine.triggerKO(this);
  }

  spawnEmber(x, y) {
    if (!this.engine.particlePool) return;
    for (let i = 0; i < this.engine.particlePool.length; i++) {
      const p = this.engine.particlePool[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = (Math.random() - 0.5) * 2;
        p.vy = Math.random() * 2;
        p.life = 1500 / 16;
        p.color = "#f97316";
        p.size = 6;
        p.noGrav = true;
        break;
      }
    }
  }

  spawnDmg(x, y, text, color = "#fff") {
    if (!this.engine.arenaEl) return;
    const el = document.createElement("div");
    el.className = "damage-num";
    el.innerText = text;
    el.style.left = `${x}px`;
    el.style.bottom = `${25 + y / 5}%`;
    el.style.color = color;
    el.style.animation = text === "BLOCK" ? "dmg-float-up 0.6s forwards" : color === "#f97316" ? "dmg-heavy 0.8s forwards" : "dmg-float-up 0.8s forwards";
    this.engine.arenaEl.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
}
