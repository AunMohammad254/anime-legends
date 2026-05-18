/**
 * Engine.js
 * Finalized Game Loop Orchestrator.
 * Integrates modular systems for Combat, AI, Input, and Entities.
 */

import { state } from "./state.js";
import { WEAPONS, STAT_BOOSTS } from "./constants.js";
import { CombatState, resolveCollision } from "./src/combat/CombatSystem.js";
import { AIController } from "./src/ai/AIController.js";
import { KeyboardInput } from "./src/input/KeyboardInput.js";
import { TouchInput } from "./src/input/TouchInput.js";
import { AudioManager } from "./src/audio/AudioManager.js";
import { ParticleSystem } from "./src/vfx/ParticleSystem.js";
import { Character } from "./src/entities/Character.js";
import { Projectile } from "./src/entities/Projectile.js";

class Engine {
  constructor() {
    this.gameActive = false;
    this.paused = false;
    this.lastTime = 0;
    this.timer = 60;
    this.gameSpeed = 1;
    this.arenaEl = null;
    this.p1 = null;
    this.cpu = null;
    this.aiController = null;
    this.projectiles = [];
    this.trails = [];
    this.activeWeaponDrop = null;
    this.weaponTimer = 0;
    this.difficulty = "normal";
    this.matchHealth = 100;

    this.audioManager = new AudioManager();
    this.particleSystem = null;
    this.keyboardInput = new KeyboardInput(this);
    this.touchInput = new TouchInput(this, this.keyboardInput);

    this.onGameEnd = null;
    this.onHUDUpdate = null;
    this.onComboUpdate = null;
    this.onShake = null;
  }

  init() {
    this.arenaEl = document.getElementById("arena");
    this.vfxCanvas = document.getElementById("vfx-layer");
    if (this.vfxCanvas) this.vfxCtx = this.vfxCanvas.getContext("2d");
    
    // Legacy pool for backward compatibility in entities (embers)
    this.particlePool = Array(500).fill().map(() => ({
        active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, color: "", size: 4, noGrav: false
    }));

    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());

    this.particleSystem = new ParticleSystem(this.arenaEl);

    this.preventDefaultBrowserBehaviors();
    this.keyboardInput.init();
    this.touchInput.init();
  }

  resizeCanvas() {
    if (!this.vfxCanvas || !this.arenaEl) return;
    this.vfxCanvas.width = this.arenaEl.offsetWidth;
    this.vfxCanvas.height = this.arenaEl.offsetHeight;
  }

  preventDefaultBrowserBehaviors() {
    document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    let lastTap = 0;
    document.addEventListener("touchend", (e) => {
      const now = Date.now();
      if (now - lastTap < 300) e.preventDefault();
      lastTap = now;
    }, { passive: false });
    document.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  initAudio() {
    this.audioManager.init();
  }

  toggleAudio() {
    return this.audioManager.toggle();
  }

  togglePause() {
    if (!this.gameActive) return;
    this.paused = !this.paused;
    if (!this.paused) {
      this.lastTime = performance.now();
      requestAnimationFrame((t) => this.battleLoop(t));
    }
    return this.paused;
  }

  startBattle(playerChar, cpuChar, difficulty, matchHealth) {
    this.difficulty = difficulty;
    this.matchHealth = matchHealth;
    this.projectiles.forEach(p => p.destroy());
    this.projectiles = [];
    this.trails = [];
    this.activeWeaponDrop = null;
    this.weaponTimer = 8000;
    this.gameActive = true;
    this.paused = false;
    this.bossPhase = false;
    this.survivalKills = 0;

    let baseHp = matchHealth === "unlimited" ? 100 : parseInt(matchHealth);
    let p1MaxHp = matchHealth === "unlimited" ? 999999 : baseHp;
    
    this.timer = matchHealth === "unlimited" ? 999 : baseHp >= 300 ? 120 : baseHp >= 200 ? 99 : 60;
    this.gameSpeed = 1;
    this.lastTime = 0;

    let p1StartPower = 0;
    let p1SpdMult = 1;

    state.data.activeBoosts.forEach((id) => {
      const boost = STAT_BOOSTS.find((b) => b.id === id);
      if (boost) {
        if (boost.effect.type === "hp") p1MaxHp *= boost.effect.value;
        if (boost.effect.type === "power") p1StartPower = boost.effect.value;
        if (boost.effect.type === "spd") p1SpdMult = boost.effect.value;
      }
    });

    this.p1 = new Character(playerChar, true, this, {
      maxHp: p1MaxHp, startPower: p1StartPower, spdMult: p1SpdMult, skinId: state.data.activeSkinId
    });

    this.cpu = new Character(cpuChar, false, this, {
      maxHp: baseHp, startPower: 0, spdMult: 1, skinId: "default"
    });

    this.aiController = new AIController(this.cpu, this.p1, this);
    this.p1.combatState = new CombatState(this.p1, this);
    this.cpu.combatState = new CombatState(this.cpu, this);

    this.initAudio();
    if (this.audioManager.enabled) this.audioManager.startBGM();

    requestAnimationFrame((t) => this.battleLoop(t));
  }

  battleLoop(time) {
    if (!this.gameActive || this.paused) return;
    if (!this.lastTime) this.lastTime = time;
    const dt = (time - this.lastTime) * this.gameSpeed;
    this.lastTime = time;

    if (dt > 100) {
      requestAnimationFrame((t) => this.battleLoop(t));
      return;
    }

    this.handleInput(dt);
    this.aiController.update();

    this.p1.combatState?.tick();
    this.cpu.combatState?.tick();

    this.p1.update(dt, this.cpu);
    this.cpu.update(dt, this.p1);

    this.updateProjectiles(dt);
    this.updateTrails(dt);
    this.updateWeaponSpawn(dt);

    if (this.onHUDUpdate) this.onHUDUpdate(this.p1, this.cpu, this.timer);

    if (this.matchHealth !== "unlimited") {
      this.timer -= dt / 1000;
      if (this.timer <= 0) this.gameEnd("DRAW");
    }

    requestAnimationFrame((t) => this.battleLoop(t));
  }

  handleInput(dt) {
    if (this.p1.state === "ko") return;
    if (this.p1.cooldowns.hurt > 0 || this.p1.cooldowns.actionLock > 0) return;

    this.p1.isBlocking = this.keyboardInput.isPressed("KeyC");
    if (this.p1.isBlocking) {
      this.p1.setState("block");
      this.p1.vx *= 0.8;
      this.p1.ultCharge = 0;
      return;
    }

    const moveSpd = 6 * this.p1.spdMult;
    if (this.keyboardInput.isPressed("ArrowLeft")) {
      this.p1.vx = -moveSpd;
      this.p1.dir = -1;
      this.p1.setState("run");
    } else if (this.keyboardInput.isPressed("ArrowRight")) {
      this.p1.vx = moveSpd;
      this.p1.dir = 1;
      this.p1.setState("run");
    } else {
      this.p1.setState(`idle_${this.p1.data.id}`);
    }

    if (this.keyboardInput.isPressed("ArrowUp") && this.p1.y === 0) {
      this.p1.vy = -18;
      this.p1.setState("jump_rise");
    }
    if (this.keyboardInput.isPressed("Space") && this.p1.cooldowns.dash <= 0) {
      this.p1.vx = this.p1.dir * 25;
      this.p1.cooldowns.dash = 800;
      this.p1.dashActive = 200;
      if (this.p1.data.id === "shadow") this.p1.opacity = 0.4;
    }

    if (this.keyboardInput.isPressed("KeyV")) {
      this.p1.ultCharge += dt;
      if (this.p1.ultCharge > 600 && this.p1.power >= 3 && this.p1.cooldowns.ult <= 0) {
        this.useUltimate(this.p1, this.cpu);
        this.p1.ultCharge = 0;
        return;
      } else if (this.p1.power >= 1 && this.p1.ultCharge < 200 && !this.keyboardInput.isPressed("KeyV_held")) {
        this.useSpecial(this.p1, this.cpu);
        this.keyboardInput.setKeyState("KeyV_held", true);
      }
      this.p1.setState("special_charge");
      this.p1.vx = 0;
    } else {
      this.p1.ultCharge = 0;
      this.keyboardInput.setKeyState("KeyV_held", false);
    }

    if (this.keyboardInput.isPressed("KeyZ")) {
      this.attack(this.p1, this.cpu, "attack_light");
      this.keyboardInput.setKeyState("KeyZ", false);
    }
    if (this.keyboardInput.isPressed("KeyX")) {
      this.attack(this.p1, this.cpu, "attack_heavy");
      this.keyboardInput.setKeyState("KeyX", false);
    }
  }

  attack(f, target, type) {
    if (f.cooldowns.attack > 0) return;
    this.playSound("swing");
    f.setState(type);
    f.cooldowns.attack = type === "attack_light" ? 250 : 500;
    f.cooldowns.actionLock = type === "attack_light" ? 200 : 400;

    let range = type === "attack_light" ? 100 : 130;
    let projColor = f.weaponColor || f.data.color;

    if (f.weapon) {
      if (f.weapon.id === "katana") {
        range = 140;
        f.weapon.hits--;
      } else if (f.weapon.id === "bow" && type === "attack_light") {
        this.projectiles.push(new Projectile({ x: f.x + f.dir * 60, y: f.y + 80, vx: f.dir * 25, owner: f, color: projColor, dmg: 20, pierce: true, type: "arrow" }, this));
        f.weapon.hits--;
        return;
      } else if (f.weapon.id === "blade" && type === "attack_heavy") {
        f.x = target.x;
        f.weapon.hits--;
        f.cooldowns.attack = 1500;
        f.cooldowns.actionLock = 800;
        this.spawnParticles(f.x, f.y + 80, 15, projColor, 40, 500);
      }
    }

    f.pendingActions.push({
      delay: type === "attack_light" ? 100 : 200,
      execute: () => {
        if (!this.gameActive || f.state === "ko") return;
        const dist = Math.abs(f.x + f.dir * 50 - target.x);
        if (dist < range && Math.abs(target.y - f.y) < 100) {
          const result = resolveCollision(f, target, type, this);
          if (result !== "whiff") {
            f.power = Math.min(f.maxPower, f.power + 0.4);
            this.spawnParticles(target.x, target.y + 80, type === "attack_light" ? 6 : 12, projColor, type === "attack_light" ? 30 : 60, result === "blocked" ? 250 : 400);
          }
        }
      },
    });
  }

  useSpecial(f, target) {
    if (f.power < 1 || f.cooldowns.attack > 0) return;
    f.power -= 1;
    f.setState("special_charge");
    f.cooldowns.attack = 800;
    f.cooldowns.actionLock = 500;
    this.playSound("special");
    this.spawnParticles(f.x, f.y + 80, 20, f.data.color, 50, 400);

    if (f.data.id === "blaze")
      this.projectiles.push(new Projectile({ x: f.x + f.dir * 60, y: f.y + 80, vx: f.dir * 12, owner: f, color: f.data.color, dmg: 30, type: "fireball" }, this));
    else if (f.data.id === "shadow") {
      f.opacity = 0;
      f.pendingActions.push({
        delay: 100,
        execute: () => {
          f.x = target.x - f.dir * 90;
          f.opacity = 1;
          for (let i = 0; i < 5; i++)
            f.pendingActions.push({ delay: i * 100, execute: () => this.attack(f, target, "attack_light") });
        },
      });
    } else if (f.data.id === "storm") {
      f.vy = -22;
      f.setState("jump_rise");
      const checkLand = setInterval(() => {
        if (!this.gameActive || f.state === "ko") { clearInterval(checkLand); return; }
        if (f.y === 0) {
          clearInterval(checkLand);
          this.spawnParticles(f.x, 0, 30, f.data.color, 100, 500);
          if (Math.abs(f.x - target.x) < 200) target.takeDamage(28, (target.x - f.x > 0 ? 1 : -1) * 15);
        }
      }, 16);
    }
  }

  useUltimate(f, target) {
    if (f.power < 3 || f.cooldowns.ult > 0) return;
    f.power -= 3;
    f.cooldowns.ult = 25000;
    f.setState("special_charge");
    this.playSound("special");

    if (this.onShake) this.onShake(8);
    this.gameSpeed = 0.2;
    setTimeout(() => { this.gameSpeed = 1; }, 1000);

    const ultColor = f.weaponColor || f.data.color;

    if (f.data.id === "blaze") {
      for (let i = 0; i < 12; i++) {
        const angle = ((Math.PI * 2) / 12) * i;
        this.projectiles.push(new Projectile({ x: f.x, y: f.y + 80, vx: Math.cos(angle) * 15, vy: Math.sin(angle) * 15, owner: f, color: ultColor, dmg: 20 }, this));
      }
    } else if (f.data.id === "shadow") {
      for (let i = 0; i < 6; i++) {
        const cx = 100 + Math.random() * (window.innerWidth - 200);
        this.projectiles.push(new Projectile({ x: cx, y: 0, vx: (target.x - cx) * 0.05, owner: f, color: ultColor, dmg: 8, isClone: true }, this));
      }
    } else if (f.data.id === "storm") {
      [-80, 0, 80].forEach((off, i) => {
        f.pendingActions.push({
          delay: i * 150,
          execute: () => {
            const bolt = document.createElement("div");
            bolt.style = `position:absolute; left:0px; bottom:25%; transform:translate3d(${target.x + off}px, 0, 0); width:8px; height:100vh; background:#fff; box-shadow:0 0 20px ${ultColor}; z-index:150`;
            this.arenaEl.appendChild(bolt);
            setTimeout(() => bolt.remove(), 100);
            if (Math.abs(target.x - (target.x + off)) < 60) target.takeDamage(22, 0);
          },
        });
      });
    }
  }

  updateProjectiles(dt) {
    this.projectiles = this.projectiles.filter((p) => {
      p.update(dt);
      return p.active;
    });
  }

  updateTrails() {
    document.querySelectorAll(".trail-ghost").forEach((el) => el.remove());
    this.trails = this.trails.filter((t) => {
      t.life -= 0.1;
      if (t.life <= 0) return false;
      const el = document.createElement("div");
      el.className = "trail-ghost fighter-inner";
      el.innerHTML = `<div class="sprite-part s-head"></div><div class="sprite-part s-body"></div><div class="sprite-part s-arm-l"></div><div class="sprite-part s-arm-r"></div><div class="sprite-part s-leg-l"></div><div class="sprite-part s-leg-r"></div>`;
      el.style = `position:absolute; left:0px; bottom:25%; transform:translate3d(${t.x - 50}px, ${-t.y}px, 0) scaleX(${t.dir}); color:${t.color}; opacity:${t.life * 0.3}`;
      this.arenaEl.appendChild(el);
      return true;
    });
  }

  spawnParticles(x, y, count, color, spread, dur) {
    this.particleSystem.emit(x, y, count, color, spread, dur);
  }

  updateWeaponSpawn(dt) {
    if (!this.activeWeaponDrop) {
      this.weaponTimer -= dt;
      if (this.weaponTimer <= 0) {
        const wData = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
        const wx = 100 + Math.random() * (this.arenaEl.offsetWidth - 200);
        const el = document.createElement("div");
        el.className = "weapon-drop";
        el.style.left = `${wx}px`;
        el.style.bottom = "25%";
        el.style.color = wData.color;
        el.innerText = wData.icon;
        this.arenaEl.appendChild(el);
        this.activeWeaponDrop = { x: wx, data: { ...wData }, el: el, timer: 6000 };
        this.weaponTimer = 10000;
      }
    } else {
      this.activeWeaponDrop.timer -= dt;
      if (this.activeWeaponDrop.timer <= 0) {
        this.activeWeaponDrop.el.remove();
        this.activeWeaponDrop = null;
      } else {
        [this.p1, this.cpu].forEach((f) => {
          if (this.activeWeaponDrop && Math.abs(f.x - this.activeWeaponDrop.x) < 40 && f.y < 50) {
            f.weapon = this.activeWeaponDrop.data;
            this.playSound("block");
            this.activeWeaponDrop.el.remove();
            this.activeWeaponDrop = null;
            const wEl = document.createElement("div");
            wEl.className = "equipped-weapon";
            wEl.innerText = f.weapon.icon;
            wEl.style.color = f.weaponColor || f.weapon.color;
            f.el.appendChild(wEl);
          }
        });
      }
    }
  }

  gameEnd(result) {
    this.gameActive = false;
    this.audioManager.stopBGM();
    if (this.onGameEnd) this.onGameEnd(result, this.p1, this.cpu, this.timer);
  }

  triggerKO(loser) {
    this.gameSpeed = 0.1;
    setTimeout(() => {
      if (loser === this.cpu && this.matchHealth === "unlimited") {
        this.survivalKills = (this.survivalKills || 0) + 1;
        const cpuChar = this.cpu.data;
        const newHp = 100 + this.survivalKills * 50;

        this.cpu = new Character(cpuChar, false, this, {
          maxHp: newHp, startPower: 0, spdMult: 1 + this.survivalKills * 0.1, skinId: "default"
        });
        this.cpu.hp = newHp;
        this.cpu.y = 800;
        this.cpu.vy = -20;

        this.spawnParticles(this.cpu.x, 0, 50, "#ff0000", 200, 1000);
        if (this.onShake) this.onShake(20);
        this.playSound("ko");

        this.aiController = new AIController(this.cpu, this.p1, this);
        this.gameSpeed = 1;

        const rt = document.getElementById("round-text");
        rt.innerText = `WAVE ${this.survivalKills + 1}`;
        rt.style.opacity = 1;
        rt.style.transform = "scale(2)";
        rt.style.color = "#ff0000";
        setTimeout(() => { rt.style.transform = "scale(1)"; }, 50);
        setTimeout(() => { rt.style.opacity = 0; rt.style.color = "#fff"; }, 2000);
      } else if (loser === this.cpu && this.difficulty === "expert" && !this.bossPhase) {
        this.bossPhase = true;
        const bossChar = this.cpu.data;
        this.cpu = new Character(bossChar, false, this, {
          maxHp: parseInt(this.matchHealth) * 2, startPower: 4, spdMult: 1.5, skinId: "default"
        });
        this.cpu.hp = parseInt(this.matchHealth) * 2;
        this.cpu.y = 800;
        this.cpu.vy = -20;

        this.spawnParticles(this.cpu.x, 0, 80, "#ff0000", 300, 1500);
        if (this.onShake) this.onShake(30);
        this.playSound("ko");

        this.aiController = new AIController(this.cpu, this.p1, this);
        this.gameSpeed = 1;

        const rt = document.getElementById("round-text");
        rt.innerText = "FINAL BOSS!";
        rt.style.opacity = 1;
        rt.style.transform = "scale(2)";
        rt.style.color = "#ff0000";
        setTimeout(() => { rt.style.transform = "scale(1)"; }, 50);
        setTimeout(() => { rt.style.opacity = 0; rt.style.color = "#fff"; }, 2500);
      } else {
        this.gameEnd(loser.isPlayer ? "DEFEAT" : "VICTORY");
      }
    }, 1500);
  }

  playSound(type) {
    this.audioManager.playSound(type);
  }
}

export const engine = new Engine();
