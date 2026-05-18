/**
 * Engine.js
 * Core game loop, physics, and character logic.
 */

import { state } from "./State.js";
import { WEAPONS, STAT_BOOSTS, WEAPON_SKINS } from "./Constants.js";
import { CombatState, resolveCollision } from "./CombatEngine.js";
import { AudioManager } from "./src/audio/AudioManager.js";
import { ParticleSystem } from "./src/vfx/ParticleSystem.js";

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
    this.keyState = {};
    this.difficulty = "normal";
    this.matchHealth = 100;

    this.audioManager = new AudioManager();
    this.particleSystem = null;

    this.onGameEnd = null;
    this.onHUDUpdate = null;
    this.onComboUpdate = null;
    this.onShake = null;
  }

  init() {
    this.arenaEl = document.getElementById("arena");
    this.vfxCanvas = document.getElementById("vfx-layer");
    if (this.vfxCanvas) this.vfxCtx = this.vfxCanvas.getContext("2d");
    this.particlePool = Array(500)
      .fill()
      .map(() => ({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        color: "",
        size: 4,
        noGrav: false,
      }));
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());

    this.particleSystem = new ParticleSystem(this.arenaEl);

    this.preventDefaultBrowserBehaviors();
    this.setupInput();
    this.setupTouchControls();
  }

  resizeCanvas() {
    if (!this.vfxCanvas) return;
    this.vfxCanvas.width = this.arenaEl.offsetWidth;
    this.vfxCanvas.height = this.arenaEl.offsetHeight;
  }

  /**
   * Blocks pull-to-refresh, double-tap zoom, and context menu on long-press.
   * Hook: called once from init() — no UI.js changes needed.
   */
  preventDefaultBrowserBehaviors() {
    // Block pull-to-refresh & overscroll on the whole document
    document.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length > 1) e.preventDefault(); // pinch zoom
      },
      { passive: false },
    );

    // Prevent double-tap zoom
    let lastTap = 0;
    document.addEventListener(
      "touchend",
      (e) => {
        const now = Date.now();
        if (now - lastTap < 300) e.preventDefault();
        lastTap = now;
      },
      { passive: false },
    );

    // Suppress context menu on long-press (prevents iOS "copy" popup)
    document.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  setupInput() {
    window.addEventListener("keydown", (e) => {
      this.keyState[e.code] = true;
      if (e.code === "Escape") {
        if (window.togglePause) window.togglePause();
        else this.togglePause();
      }
      if (["ArrowUp", "ArrowDown", "Space"].includes(e.code))
        e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      this.keyState[e.code] = false;
    });
  }

  setupTouchControls() {
    this.isTouchDevice =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;

    const touchEl = document.getElementById("touch-controls");
    if (!touchEl) return;

    // Reusable joystick factory — works for both landscape overlay and portrait panel
    const makeJoystick = (outerEl, innerEl, zoneEl) => {
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
        this.keyState["ArrowLeft"] = dx < -t;
        this.keyState["ArrowRight"] = dx > t;
        this.keyState["ArrowUp"] = dy < -t;
      };

      const reset = () => {
        innerEl.style.transform = "translate(0,0)";
        this.keyState["ArrowLeft"] =
          this.keyState["ArrowRight"] =
          this.keyState["ArrowUp"] =
            false;
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
    };

    // Landscape joystick
    makeJoystick(
      document.getElementById("joystick-outer"),
      document.getElementById("joystick-inner"),
      document.getElementById("joystick-zone"),
    );

    // Portrait joystick
    makeJoystick(
      document.getElementById("portrait-joystick-outer"),
      document.getElementById("portrait-joystick-inner"),
      document.getElementById("portrait-joystick-zone"),
    );

    // --- Action Buttons (both landscape and portrait panels) ---
    document.querySelectorAll(".touch-btn").forEach((btn) => {
      const keyCode = btn.dataset.key;
      if (!keyCode) return;

      btn.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          this.keyState[keyCode] = true;
          btn.classList.add("pressed");
        },
        { passive: false },
      );

      btn.addEventListener(
        "touchend",
        (e) => {
          e.preventDefault();
          this.keyState[keyCode] = false;
          btn.classList.remove("pressed");
        },
        { passive: false },
      );

      btn.addEventListener("touchcancel", () => {
        this.keyState[keyCode] = false;
        btn.classList.remove("pressed");
      });
    });
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
    this.projectiles = [];
    this.trails = [];
    this.activeWeaponDrop = null;
    this.weaponTimer = 8000;
    this.gameActive = true;
    this.paused = false;

    this.bossPhase = false;
    this.survivalKills = 0;
    this.pendingActions = [];

    let baseHp = matchHealth === "unlimited" ? 100 : parseInt(matchHealth);
    let p1MaxHp = matchHealth === "unlimited" ? 999999 : baseHp;
    let cpuMaxHp = baseHp;

    this.timer =
      matchHealth === "unlimited"
        ? 999
        : baseHp >= 300
          ? 120
          : baseHp >= 200
            ? 99
            : 60;
    this.gameSpeed = 1;
    this.lastTime = 0;

    // Apply Player Boosts
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

    this.p1 = new Fighter(playerChar, true, this, {
      maxHp: p1MaxHp,
      startPower: p1StartPower,
      spdMult: p1SpdMult,
      skinId: state.data.activeSkinId,
    });

    this.cpu = new Fighter(cpuChar, false, this, {
      maxHp: cpuMaxHp,
      startPower: 0,
      spdMult: 1,
      skinId: "default",
    });

    this.aiController = new CPUController(this.cpu, this.p1, this);

    // Attach advanced combat state machines to both fighters
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

    // Tick frame-data state machines (one tick = one 60fps frame)
    this.p1.combatState?.tick();
    this.cpu.combatState?.tick();

    this.p1.update(dt, this.cpu);
    this.cpu.update(dt, this.p1);

    this.pendingActions = this.pendingActions.filter((a) => {
      a.delay -= dt;
      if (a.delay <= 0) {
        a.execute();
        return false;
      }
      return true;
    });

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

    this.p1.isBlocking = this.keyState["KeyC"];
    if (this.p1.isBlocking) {
      this.p1.setState("block");
      this.p1.vx *= 0.8;
      this.p1.ultCharge = 0;
      return;
    }

    const moveSpd = 6 * this.p1.spdMult;
    if (this.keyState["ArrowLeft"]) {
      this.p1.vx = -moveSpd;
      this.p1.dir = -1;
      this.p1.setState("run");
    } else if (this.keyState["ArrowRight"]) {
      this.p1.vx = moveSpd;
      this.p1.dir = 1;
      this.p1.setState("run");
    } else {
      this.p1.setState(`idle_${this.p1.data.id}`);
    }

    if (this.keyState["ArrowUp"] && this.p1.y === 0) {
      this.p1.vy = -18;
      this.p1.setState("jump_rise");
    }
    if (this.keyState["Space"] && this.p1.cooldowns.dash <= 0) {
      this.p1.vx = this.p1.dir * 25;
      this.p1.cooldowns.dash = 800;
      this.p1.dashActive = 200;
      if (this.p1.data.id === "shadow") this.p1.opacity = 0.4;
    }

    if (this.keyState["KeyV"]) {
      this.p1.ultCharge += dt;
      if (
        this.p1.ultCharge > 600 &&
        this.p1.power >= 3 &&
        this.p1.cooldowns.ult <= 0
      ) {
        this.useUltimate(this.p1, this.cpu);
        this.p1.ultCharge = 0;
        return;
      } else if (
        this.p1.power >= 1 &&
        this.p1.ultCharge < 200 &&
        !this.keyState["KeyV_held"]
      ) {
        this.useSpecial(this.p1, this.cpu);
        this.keyState["KeyV_held"] = true;
      }
      this.p1.setState("special_charge");
      this.p1.vx = 0;
    } else {
      this.p1.ultCharge = 0;
      this.keyState["KeyV_held"] = false;
    }

    if (this.keyState["KeyZ"]) {
      this.attack(this.p1, this.cpu, "attack_light");
      this.keyState["KeyZ"] = false;
    }
    if (this.keyState["KeyX"]) {
      this.attack(this.p1, this.cpu, "attack_heavy");
      this.keyState["KeyX"] = false;
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
        this.projectiles.push({
          x: f.x + f.dir * 60,
          y: f.y + 80,
          vx: f.dir * 25,
          owner: f,
          color: projColor,
          dmg: 20,
          pierce: true,
          type: "arrow",
        });
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

    // Startup delay before the hitbox goes live
    f.pendingActions.push({
      delay: type === "attack_light" ? 100 : 200,
      execute: () => {
        if (!this.gameActive || f.state === "ko") return;
        const dist = Math.abs(f.x + f.dir * 50 - target.x);
        if (dist < range && Math.abs(target.y - f.y) < 100) {
          // ── Advanced collision via CombatEngine ──────────────────
          const result = resolveCollision(f, target, type, this);
          if (result !== "whiff") {
            f.power = Math.min(f.maxPower, f.power + 0.4);
            this.spawnParticles(
              target.x,
              target.y + 80,
              type === "attack_light" ? 6 : 12,
              projColor,
              type === "attack_light" ? 30 : 60,
              result === "blocked" ? 250 : 400,
            );
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
      this.projectiles.push({
        x: f.x + f.dir * 60,
        y: f.y + 80,
        vx: f.dir * 12,
        owner: f,
        color: f.data.color,
        dmg: 30,
        type: "fireball",
      });
    else if (f.data.id === "shadow") {
      f.opacity = 0;
      f.pendingActions.push({
        delay: 100,
        execute: () => {
          f.x = target.x - f.dir * 90;
          f.opacity = 1;
          for (let i = 0; i < 5; i++)
            f.pendingActions.push({
              delay: i * 100,
              execute: () => this.attack(f, target, "attack_light"),
            });
        },
      });
    } else if (f.data.id === "storm") {
      f.vy = -22;
      f.setState("jump_rise");
      const checkLand = setInterval(() => {
        if (!this.gameActive || f.state === "ko") {
          clearInterval(checkLand);
          return;
        }
        if (f.y === 0) {
          clearInterval(checkLand);
          this.spawnParticles(f.x, 0, 30, f.data.color, 100, 500);
          if (Math.abs(f.x - target.x) < 200)
            target.takeDamage(28, (target.x - f.x > 0 ? 1 : -1) * 15);
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
    this.pendingActions.push({
      delay: 1000,
      execute: () => {
        this.gameSpeed = 1;
      },
    });

    const ultColor = f.weaponColor || f.data.color;

    if (f.data.id === "blaze") {
      for (let i = 0; i < 12; i++) {
        const angle = ((Math.PI * 2) / 12) * i;
        this.projectiles.push({
          x: f.x,
          y: f.y + 80,
          vx: Math.cos(angle) * 15,
          vy: Math.sin(angle) * 15,
          owner: f,
          color: ultColor,
          dmg: 20,
        });
      }
    } else if (f.data.id === "shadow") {
      for (let i = 0; i < 6; i++) {
        const cx = 100 + Math.random() * (window.innerWidth - 200);
        this.projectiles.push({
          x: cx,
          y: 0,
          vx: (target.x - cx) * 0.05,
          owner: f,
          color: ultColor,
          dmg: 8,
          isClone: true,
        });
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
            if (Math.abs(target.x - (target.x + off)) < 60)
              target.takeDamage(22, 0);
          },
        });
      });
    }
  }

  updateProjectiles() {
    this.projectiles = this.projectiles.filter((p) => {
      p.x += p.vx;
      if (p.vy) p.y += p.vy;
      const target = p.owner.isPlayer ? this.cpu : this.p1;

      if (
        target.weapon &&
        target.weapon.id === "gauntlet" &&
        target.isBlocking &&
        Math.abs(p.x - target.x) < 80
      ) {
        p.vx *= -1;
        p.owner = target;
        this.playSound("block");
        this.spawnParticles(
          target.x,
          target.y + 80,
          5,
          target.weaponColor || "#22d3ee",
          30,
          200,
        );
        return true;
      }

      if (
        Math.abs(p.x - target.x) < 50 &&
        (p.isClone || Math.abs((p.y || 80) - (target.y + 80)) < 100)
      ) {
        if (!p.pierce && target.isBlocking) {
          target.takeDamage(p.dmg, p.vx * 0.5);
          return false;
        }
        target.takeDamage(p.dmg, p.vx * 0.5);
        if (p.type === "fireball")
          this.spawnParticles(target.x, target.y + 80, 15, p.color, 60, 400);
        if (p.type === "arrow") {
          const arrow = document.createElement("div");
          arrow.innerHTML = "➔";
          arrow.style = `position:absolute; left: ${p.vx > 0 ? 10 : 60}px; top: ${40 + Math.random() * 40}px; font-size:24px; color:${p.color}; transform:rotate(${p.vx > 0 ? 15 : 165}deg); z-index: 60; filter: drop-shadow(0 0 5px ${p.color});`;
          target.el.appendChild(arrow);
          setTimeout(() => arrow.remove(), 2000);
        }
        return false;
      }
      return p.x > -100 && p.x < this.arenaEl.offsetWidth + 100;
    });

    document.querySelectorAll(".proj").forEach((el) => el.remove());
    this.projectiles.forEach((p) => {
      const el = document.createElement("div");
      el.className = "proj";
      if (p.type === "arrow") {
        el.innerHTML = "➔";
        el.style = `position:absolute; left:${p.x}px; bottom:${25 + (p.y || 80) / 5}%; color:${p.color}; font-size:40px; filter: drop-shadow(0 0 10px ${p.color}); transform:rotate(${p.vx > 0 ? 0 : 180}deg); display:flex; align-items:center; justify-content:center; margin-bottom:-20px;`;
      } else if (p.isClone) {
        el.style = `left:${p.x - 50}px; bottom:${25}%; width:100px; height:160px; background:${p.color}; opacity:0.5; clip-path: polygon(30% 0, 70% 0, 100% 100%, 0 100%);`;
      } else {
        el.style = `left:${p.x}px; bottom:${25 + (p.y || 80) / 5}%; width:20px; height:2px; background:#fff; box-shadow: 0 0 10px ${p.color}, 0 0 20px ${p.color}; transform:rotate(${Math.atan2(p.vy || 0, p.vx)}rad);`;
      }
      this.arenaEl.appendChild(el);
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
        this.activeWeaponDrop = {
          x: wx,
          data: { ...wData },
          el: el,
          timer: 6000,
        };
        this.weaponTimer = 10000;
      }
    } else {
      this.activeWeaponDrop.timer -= dt;
      if (this.activeWeaponDrop.timer <= 0) {
        this.activeWeaponDrop.el.remove();
        this.activeWeaponDrop = null;
      } else {
        [this.p1, this.cpu].forEach((f) => {
          if (
            this.activeWeaponDrop &&
            Math.abs(f.x - this.activeWeaponDrop.x) < 40 &&
            f.y < 50
          ) {
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

        // Do NOT remove the wrapper element, as Fighter constructor needs it!
        this.cpu = new Fighter(cpuChar, false, this, {
          maxHp: newHp,
          startPower: 0,
          spdMult: 1 + this.survivalKills * 0.1,
          skinId: "default",
        });
        this.cpu.hp = newHp;
        this.cpu.y = 800; // Drop from sky
        this.cpu.vy = -20;

        this.spawnParticles(this.cpu.x, 0, 50, "#ff0000", 200, 1000);
        if (this.onShake) this.onShake(20);
        this.playSound("ko");

        this.aiController = new CPUController(this.cpu, this.p1, this);
        this.gameSpeed = 1;

        const rt = document.getElementById("round-text");
        rt.innerText = `WAVE ${this.survivalKills + 1}`;
        rt.style.opacity = 1;
        rt.style.transform = "scale(2)";
        rt.style.color = "#ff0000";
        setTimeout(() => {
          rt.style.transform = "scale(1)";
        }, 50);
        setTimeout(() => {
          rt.style.opacity = 0;
          rt.style.color = "#fff";
        }, 2000);
      } else if (
        loser === this.cpu &&
        this.difficulty === "expert" &&
        !this.bossPhase
      ) {
        this.bossPhase = true;
        const bossChar = this.cpu.data;

        this.cpu = new Fighter(bossChar, false, this, {
          maxHp: parseInt(this.matchHealth) * 2,
          startPower: 4,
          spdMult: 1.5,
          skinId: "default",
        });
        this.cpu.hp = parseInt(this.matchHealth) * 2;
        this.cpu.y = 800; // Drop from sky
        this.cpu.vy = -20;

        this.spawnParticles(this.cpu.x, 0, 80, "#ff0000", 300, 1500);
        if (this.onShake) this.onShake(30);
        this.playSound("ko");

        this.aiController = new CPUController(this.cpu, this.p1, this);
        this.gameSpeed = 1;

        const rt = document.getElementById("round-text");
        rt.innerText = "FINAL BOSS!";
        rt.style.opacity = 1;
        rt.style.transform = "scale(2)";
        rt.style.color = "#ff0000";
        setTimeout(() => {
          rt.style.transform = "scale(1)";
        }, 50);
        setTimeout(() => {
          rt.style.opacity = 0;
          rt.style.color = "#fff";
        }, 2500);
      } else {
        this.gameEnd(loser.isPlayer ? "DEFEAT" : "VICTORY");
      }
    }, 1500);
  }

  // --- AUDIO ---
  playSound(type) {
    this.audioManager.playSound(type);
  }
}

class Fighter {
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
    this.cooldowns = { attack: 0, dash: 0, special: 0, hurt: 0, ult: 0 };
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
    if (!isPlayer) {
      this.el.style.filter =
        "drop-shadow(0 0 15px #ff0000) drop-shadow(0 0 5px #ff0000)"; // Red border/glow
    } else {
      this.el.style.filter = `drop-shadow(0 0 10px ${data.color})`; // Player gets their normal glow
    }

    this.el.innerHTML =
      this.createFighterHTML(displayColor) + '<div class="aura"></div>';
    this.el.style.color = displayColor;
    this.auraEl = this.el.querySelector(".aura");
    this.auraEl.style.background = `radial-gradient(circle, ${displayColor} 0%, transparent 70%)`;
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
    if (this.x > this.engine.arenaEl.offsetWidth - 50)
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
        this.engine.spawnParticles(
          this.x,
          100,
          10,
          this.weaponColor || this.weapon.color,
          40,
          500,
        );
        this.weapon = null;
        const wEl = this.el.querySelector(".equipped-weapon");
        if (wEl) wEl.remove();
      } else if (this.weapon.id === "orb") {
        if (dist < 80 && opponent.dashActive <= 0 && !opponent.isBlocking) {
          opponent.hp -= (5 * dt) / 1000;
        }
      }
    }

    // Passives
    if (
      this.data.id === "blaze" &&
      (Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1) &&
      Math.random() < 0.2
    ) {
      this.spawnEmber(this.x, this.y);
    } else if (this.data.id === "storm" && dist < 100) {
      opponent.hp -= (1 * dt) / 1000;
      if (Math.random() < 0.1)
        this.engine.spawnParticles(
          this.x + (opponent.x - this.x) / 2,
          100,
          1,
          "#22d3ee",
          10,
          100,
        );
    }

    const pRatio = this.power / this.maxPower;
    this.auraEl.style.transform = `scale(${1 + pRatio})`;
    this.auraEl.style.opacity = 0.15 + pRatio * 0.25;

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

  render() {
    this.el.className = `fighter ${this.state} ${this.cooldowns.hurt > 0 ? "hurt" : ""}`;
    this.el.style.left = `${this.x - 50}px`;
    this.el.style.bottom = `${25 + this.y / 5}%`;
    this.el.style.transform = `scaleX(${this.dir})`;
    this.el.style.opacity = this.opacity;
  }

  setState(s) {
    if (this.state !== "ko") this.state = s;
  }

  takeDamage(dmg, knockback) {
    if (this.dashActive > 0) return;

    let finalDmg = dmg;

    if (this.isPlayer) {
      if (this.engine.difficulty === "easy") finalDmg *= 0.7;
      if (this.engine.difficulty === "hard") finalDmg *= 1.3;
      if (this.engine.difficulty === "expert") finalDmg *= 1.8;

      if (this.engine.matchHealth === "unlimited") {
        finalDmg *= 1 + (this.engine.survivalKills || 0) * 0.4;
      }
    } else {
      if (this.engine.difficulty === "easy") finalDmg *= 1.3;
      if (this.engine.difficulty === "hard") finalDmg *= 0.8;
      if (this.engine.difficulty === "expert") finalDmg *= 0.6;
    }

    let isBlocked = this.isBlocking;

    if (isBlocked) {
      finalDmg *= 0.3;
      knockback *= 0.5;
      this.engine.playSound("block");
      this.engine.spawnParticles(this.x, this.y + 80, 5, "#fff", 30, 300);
      this.spawnDmg(this.x, this.y + 120, "BLOCK", "#888");
    } else {
      this.cooldowns.hurt = 250;
      this.engine.playSound("light");
      const isHeavy = finalDmg > 15;
      this.engine.spawnParticles(
        this.x,
        this.y + 80,
        isHeavy ? 25 : 8,
        this.data.color,
        isHeavy ? 120 : 40,
        isHeavy ? 600 : 400,
      );
      this.spawnDmg(
        this.x,
        this.y + 100,
        Math.floor(finalDmg),
        isHeavy ? "#f97316" : "#fff",
      );

      // Tekken 7 Style Pushback & Shake (Removed game freeze to prevent lag)
      knockback *= isHeavy ? 1.8 : 1.2;
      if (isHeavy && this.engine.onShake) this.engine.onShake(12);
    }

    this.hp = Math.max(0, this.hp - finalDmg);
    this.vx += knockback;
    this.power = Math.min(this.maxPower, this.power + 0.2);

    if (this.hp < 25 && Math.random() < 0.3) {
      const c = document.createElement("div");
      c.className = "ground-crack";
      c.style.left = `${this.x - 15}px`;
      c.style.bottom = `25%`;
      this.engine.arenaEl.appendChild(c);
    }
    if (this.hp <= 0 && this.state !== "ko") this.engine.triggerKO(this);
  }

  spawnEmber(x, y) {
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
    const el = document.createElement("div");
    el.className = "damage-num";
    el.innerText = text;
    el.style.left = `${x}px`;
    el.style.bottom = `${25 + y / 5}%`;
    el.style.color = color;
    el.style.animation =
      text === "BLOCK"
        ? "dmg-float-up 0.6s forwards"
        : color === "#f97316"
          ? "dmg-heavy 0.8s forwards"
          : "dmg-float-up 0.8s forwards";
    this.engine.arenaEl.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
}

class CPUController {
  constructor(cpu, p1, engine) {
    this.cpu = cpu;
    this.p1 = p1;
    this.engine = engine;
    this.state = "APPROACH";
    this.execAt = 0;
  }
  update() {
    if (Date.now() < this.execAt || this.cpu.state === "ko") return;
    const dist = Math.abs(this.p1.x - this.cpu.x);

    let delayBase = 500;
    if (this.engine.difficulty === "normal") delayBase = 250;
    if (this.engine.difficulty === "hard") delayBase = 60;
    if (this.engine.difficulty === "expert") delayBase = 20; // Extremely fast
    const delay = delayBase + Math.random() * (delayBase * 0.5);

    if (this.engine.activeWeaponDrop && this.cpu.hp < this.cpu.maxHp * 0.7) {
      const wDist = Math.abs(this.engine.activeWeaponDrop.x - this.cpu.x);
      const pWDist = Math.abs(this.engine.activeWeaponDrop.x - this.p1.x);
      if (wDist < pWDist) {
        this.cpu.dir = this.engine.activeWeaponDrop.x > this.cpu.x ? 1 : -1;
        this.cpu.vx =
          this.cpu.dir *
          (this.engine.difficulty === "hard" ||
          this.engine.difficulty === "expert"
            ? 5
            : 4);
        this.cpu.setState("run");
        this.execAt = Date.now() + 100;
        return;
      }
    }

    switch (this.state) {
      case "APPROACH":
        if (dist > 120) {
          this.cpu.dir = this.p1.x > this.cpu.x ? 1 : -1;
          this.cpu.vx =
            this.cpu.dir *
            (this.engine.difficulty === "hard" ||
            this.engine.difficulty === "expert"
              ? 5
              : 4);
          this.cpu.setState("run");
          this.execAt = Date.now() + 100;
        } else {
          this.state = "ATTACK";
          this.execAt = Date.now() + delay;
        }
        break;
      case "ATTACK":
        if (
          this.cpu.hp < this.cpu.maxHp * 0.3 &&
          this.engine.difficulty !== "expert"
        ) {
          this.state = "RETREAT";
          this.execAt = Date.now();
          break;
        }
        if (
          this.cpu.power >= 3 &&
          this.cpu.cooldowns.ult <= 0 &&
          this.cpu.hp < this.cpu.maxHp * 0.5
        ) {
          this.state = "ULTIMATE";
          this.execAt = Date.now();
          break;
        }
        if (
          this.cpu.power >= 1 &&
          Math.random() < (this.engine.difficulty === "expert" ? 0.5 : 0.2)
        ) {
          this.state = "SPECIAL";
          this.execAt = Date.now();
          break;
        }
        if (dist <= 130) {
          this.cpu.vx = 0;
          const r = Math.random();

          let lW = 0.7,
            hW = 0.2; // Easy
          if (this.engine.difficulty === "normal") {
            lW = 0.55;
            hW = 0.3;
          }
          if (this.engine.difficulty === "hard") {
            lW = 0.4;
            hW = 0.35;
          }
          if (this.engine.difficulty === "expert") {
            lW = 0.3;
            hW = 0.6;
          } // Extremely aggressive with heavies

          if (r < lW) this.engine.attack(this.cpu, this.p1, "attack_light");
          else if (r < lW + hW)
            this.engine.attack(this.cpu, this.p1, "attack_heavy");
          else {
            this.state = "BLOCK";
            this.execAt = Date.now();
            return;
          }
        }
        this.state = "APPROACH";
        this.execAt = Date.now() + delay * 2;
        break;
      case "RETREAT":
        this.cpu.dir = this.p1.x > this.cpu.x ? -1 : 1;
        this.cpu.vx = (this.p1.x > this.cpu.x ? -1 : 1) * 3;
        this.cpu.setState("walk");
        if (dist > 200) this.state = "APPROACH";
        if (this.p1.state.startsWith("attack") && Math.random() < 0.5)
          this.state = "BLOCK";
        this.execAt = Date.now() + 200;
        break;
      case "BLOCK": {
        this.cpu.isBlocking = true;
        this.cpu.setState("block");
        const bTime = 400 + Math.random() * 400;
        this.execAt = Date.now() + bTime;
        this.cpu.pendingActions.push({
          delay: bTime,
          execute: () => {
            if (this.engine.gameActive) {
              this.cpu.isBlocking = false;
              this.state = "APPROACH";
            }
          },
        });
        break;
      }
      case "SPECIAL":
        this.engine.useSpecial(this.cpu, this.p1);
        this.state = "APPROACH";
        this.execAt = Date.now() + 1000;
        break;
      case "ULTIMATE":
        this.engine.useUltimate(this.cpu, this.p1);
        this.state = "RETREAT";
        this.execAt = Date.now() + 2000;
        break;
    }
  }
}

export const engine = new Engine();
