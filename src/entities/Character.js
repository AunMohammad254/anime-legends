import { WEAPON_SKINS } from "../../constants.js";
import { FighterState } from "../combat/MoveRegistry.js";
import "./fighters.css";

export function createFighterHTML(data) {
  return `<div class="fighter-inner fighter-${data.id}" aria-hidden="true" style="color:${data.color}">
    <div class="sprite-part s-arm-l"><span class="s-forearm"></span></div><div class="sprite-part s-leg-l"></div>
    <div class="sprite-part s-leg-r"></div><div class="sprite-part s-body"></div>
    <div class="sprite-part s-head"></div><div class="sprite-part s-arm-r"><span class="s-forearm"></span></div>
  </div>`;
}

export class Character {
  constructor(data, isPlayer, engine, options = {}) {
    this.data = data;
    this.isPlayer = isPlayer;
    this.engine = engine;
    this.x = engine.arenaWidth * (isPlayer ? 0.2 : 0.8);
    this.y = 0;
    this.vx = 0;
    this.vy = 0;

    this.maxHp = options.maxHp ?? engine.matchHealth;
    this.hp = this.maxHp;
    this.maxPower = 4;
    this.power = options.startPower ?? 0;
    this.spdMult = (options.spdMult ?? 1) * (1 + ((data.spd ?? 6) - 6) * 0.045);
    this.skinId = options.skinId ?? "default";
    this.weaponColor = WEAPON_SKINS.find((skin) => skin.id === this.skinId)?.color;
    this.state = `idle_${data.id}`;
    this.dir = isPlayer ? 1 : -1;
    this.cooldowns = { attack: 0, dash: 0, special: 0, hurt: 0, ult: 0, actionLock: 0 };
    this.combo = 0;
    this.bestCombo = 0;
    this.perfectGuards = 0;
    this.countersLanded = 0;
    this.comboTimer = 0;
    this.isBlocking = false;
    this.dashActive = 0;
    this.trailDelay = 0;
    this.weapon = null;
    this.ultCharge = 0;
    this.opacity = 1;
    this.pendingActions = [];
    this.recoveryDelay = 0;
    this.poisonTime = 0;
    this.el = document.getElementById(isPlayer ? "p1-sprite" : "cpu-sprite");

    if (this.el) {
      this.el.style.color = data.color;
      this.el.style.filter = `drop-shadow(0 0 7px ${data.color}80)`;
      this.el.innerHTML = createFighterHTML(data) + '<div class="aura"></div>';
      this.auraEl = this.el.querySelector(".aura");
      this.auraEl.style.background = `radial-gradient(circle, ${data.color}, transparent 70%)`;
      this.render();
    }
  }

  update(dt, opponent) {
    if (this.state === "ko") return;

    const gravity = this.data.id === "aero" ? 0.53 : 0.6;
    this.vy += gravity;
    this.y = Math.max(0, this.y - this.vy);
    const ceiling = Math.max(50, this.engine.arenaHeight * 0.75 - 160);
    if (this.y > ceiling) {
      this.y = ceiling;
      this.vy = Math.max(this.vy, 0);
    }
    if (!this.y) this.vy = 0;
    if (this.y > 0 && this.cooldowns.actionLock <= 0 && this.cooldowns.hurt <= 0) {
      this.setState(this.vy < 0 ? "jump_rise" : "jump_fall");
    }

    this.x += this.vx;
    this.vx *= 0.85;
    const gap = Math.abs(this.x - opponent.x);
    if (gap < 80 && Math.abs(this.y - opponent.y) < 40) {
      const direction = this.x === opponent.x ? (this.isPlayer ? -1 : 1) : Math.sign(this.x - opponent.x);
      this.x += direction * (80 - gap) * 0.5;
    }
    this.x = Math.max(45, Math.min(this.engine.arenaWidth - 45, this.x));

    for (const key in this.cooldowns) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    this.dashActive = Math.max(0, this.dashActive - dt);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // Move due callbacks out of the queue first so a callback can schedule its next strike.
    const due = [];
    this.pendingActions = this.pendingActions.filter((action) => {
      action.delay -= dt;
      if (action.delay > 0) return true;
      due.push(action);
      return false;
    });
    for (const action of due) {
      if (this.hp <= 0 || opponent.hp <= 0) break;
      action.execute();
    }

    if (this.weapon) {
      this.weapon.dur -= dt / 1000;
      if (this.weapon.dur <= 0 || this.weapon.hits <= 0) {
        this.engine.spawnParticles(this.x, this.y + 90, 8, this.weaponColor || this.weapon.color, 40, 400);
        this.weapon = null;
        this.el?.querySelector(".equipped-weapon")?.remove();
      } else if (this.weapon.id === "orb" && gap <= 100 && Math.abs(this.y - opponent.y) < 80 && opponent.dashActive <= 0 && !opponent.isBlocking) {
        opponent.takeDamage(5 * dt / 1000, 0, true);
      }
    }
    this.applyPassives(dt, opponent, gap);
    if (this.auraEl) {
      const ratio = this.power / this.maxPower;
      this.auraEl.style.transform = `scale(${1 + ratio})`;
      this.auraEl.style.opacity = 0.10 + ratio * 0.20;
    }
    this.trailDelay = Math.max(0, this.trailDelay - dt);
    if (this.dashActive > 0 && this.trailDelay === 0 && !this.engine.particleSystem?.motion?.matches) {
      this.trailDelay = 48;
      this.engine.trails.push({ x: this.x, y: this.y, dir: this.dir, data: this.data, life: 1 });
    }
    this.opacity = this.data.id === "shadow" && this.dashActive > 0 ? 0.35 : Math.min(1, this.opacity + dt / 500);
    this.render();
  }

  applyPassives(dt, opponent, gap) {
    this.recoveryDelay = Math.max(0, this.recoveryDelay - dt);
    if (this.poisonTime > 0) {
      const elapsed = Math.min(this.poisonTime, dt);
      this.poisonTime -= elapsed;
      this.takeDamage(2 * elapsed / 1000, 0, true);
    }
    if (this.hp <= 0 || opponent.hp <= 0) return;
    const near = gap <= 105 && Math.abs(this.y - opponent.y) < 85;
    switch (this.data.id) {
      case "blaze":
        if (Math.abs(this.vx) > 2 || this.dashActive > 0) {
          if (Math.random() < 0.22) this.engine.spawnParticles(this.x, this.y + 10, 1, this.data.color, 18, 350);
          if (near && !opponent.isBlocking) opponent.takeDamage(1.5 * dt / 1000, 0, true);
        }
        break;
      case "storm":
        if (near && !opponent.isBlocking) {
          opponent.takeDamage(dt / 1000, 0, true);
          if (Math.random() < 0.1) this.engine.spawnParticles((this.x + opponent.x) / 2, this.y + 80, 1, this.data.color, 16, 120);
        }
        break;
      case "aqua":
        if (this.recoveryDelay === 0) this.hp = Math.min(this.maxHp, this.hp + dt / 1000);
        break;
    }
  }

  render() {
    if (!this.el) return;
    // Freeze the silhouette at the same contact frame as the hitbox during hitstop and pause.
    const combat = this.combatState;
    if (combat?.isAttacking && combat.moveId === this.state) {
      const { state, framesLeft, activeMove } = combat;
      this.el.dataset.strikePhase = state;
      const windup = state === FighterState.STARTUP ? 1 - framesLeft / activeMove.startupFrames : 0;
      const extension = state === FighterState.RECOVERY
        ? (framesLeft / activeMove.recoveryFrames) ** 2
        : Number(state === FighterState.ACTIVE);
      this.el.style.setProperty("--windup", windup);
      this.el.style.setProperty("--extension", extension);
    } else if (this.el.hasAttribute("data-strike-phase")) {
      this.el.removeAttribute("data-strike-phase");
    }
    this.el.className = `fighter ${this.state}${this.cooldowns.hurt > 0 && this.hp > 0 ? " hurt" : ""}`;
    this.el.style.transform = `translate3d(${this.x - 50}px, ${-this.y}px, 0) scaleX(${this.dir})`;
    this.el.style.opacity = this.opacity;
  }

  setState(state) {
    if (this.state !== "ko") this.state = state;
  }

  takeDamage(damage, knockback = 0, isPassive = false, blocked = this.isBlocking, moveId) {
    if (this.hp <= 0 || (this.dashActive > 0 && !isPassive)) return false;
    const attacker = this.isPlayer ? this.engine.cpu : this.engine.p1;
    let amount = damage;
    if (!isPassive) {
      const difficulty = this.engine.difficulty;
      const strength = this.isPlayer
        ? { easy: 0.7, normal: 1, hard: 1.3, expert: 1.8 }
        : { easy: 1.3, normal: 1, hard: 0.8, expert: 0.6 };
      amount *= (strength[difficulty] ?? 1) * (1 - ((this.data.def ?? 5) - 5) * 0.035);
      if (this.data.id === "terra" && !this.y) amount *= 0.93;
      if (this.data.id === "iron") knockback *= 0.6;
      if (blocked) {
        amount *= this.data.id === "frost" ? 0.18 : 0.3;
        knockback *= 0.5;
        this.engine.playSound("block");
        this.engine.spawnParticles(this.x, this.y + 80, 5, "#fff", 30, 300);
        this.spawnDmg(this.x, this.y + 120, "BLOCK", "#cbe6fa");
      } else {
        this.cooldowns.hurt = 250;
        const heavy = amount > 15;
        this.engine.playSound(moveId === "attack_heavy" ? "heavy" : "light");
        this.engine.spawnParticles(this.x, this.y + 80, heavy ? 18 : 7, this.data.color, heavy ? 100 : 40, heavy ? 450 : 320);
        this.spawnDmg(this.x, this.y + 100, Math.max(1, Math.round(amount)), heavy ? "#ffae66" : "#fff");
        knockback *= heavy ? 1.8 : 1.2;
        if (attacker?.data.id === "venom") this.poisonTime = 2000;
        if (attacker?.data.id === "soul") attacker.power = Math.min(attacker.maxPower, attacker.power + 0.12);
      }
      this.power = Math.min(this.maxPower, this.power + 0.2);
    }
    this.recoveryDelay = 3000;
    this.hp = Math.max(0, this.hp - amount);
    this.vx += knockback;
    if (this.hp > 0) return false;

    this.setState("ko");
    this.pendingActions.length = 0;
    this.isBlocking = false;
    this.render();
    this.engine.playSound("ko");
    this.engine.triggerKO(this);
    return true;
  }

  spawnDmg(x, y, text, color = "#fff") {
    const el = document.createElement("div");
    el.className = "damage-num";
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.bottom = `calc(25% + ${y}px)`;
    el.style.color = color;
    el.style.animation = "dmg-float-up 0.75s forwards";
    this.engine.arenaEl.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }
}
