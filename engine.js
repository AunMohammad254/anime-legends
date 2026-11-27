import { state } from "./state.js";
import { CHARACTERS, WEAPONS, STAT_BOOSTS } from "./constants.js";
import { CombatState, resolveCollision } from "./src/combat/CombatSystem.js";
import { AIController } from "./src/ai/AIController.js";
import { KeyboardInput } from "./src/input/KeyboardInput.js";
import { TouchInput } from "./src/input/TouchInput.js";
import { AudioManager } from "./src/audio/AudioManager.js";
import { ParticleSystem } from "./src/vfx/ParticleSystem.js";
import { Character, createFighterHTML } from "./src/entities/Character.js";
import { Projectile } from "./src/entities/Projectile.js";

import { castAbility } from "./src/combat/Abilities.js";

const FRAME = 1000 / 60;

class Engine {
  constructor() {
    this.gameActive = false;
    this.paused = false;
    this.frameId = null;
    this.projectiles = [];
    this.trails = [];
    this.audioManager = new AudioManager();
    this.keyboardInput = new KeyboardInput(this);
    this.touchInput = new TouchInput(this, this.keyboardInput);
    this.battleLoop = this.battleLoop.bind(this);
  }

  init() {
    this.arenaEl = document.getElementById("arena");
    this.arenaObserver?.disconnect();
    this.arenaObserver = new ResizeObserver(() => this.measureArena());
    this.arenaObserver.observe(this.arenaEl);
    this.particleSystem = new ParticleSystem(this.arenaEl);
    this.keyboardInput.init();
    this.touchInput.init();
  }

  initAudio() {
    this.audioManager.init();
  }

  measureArena() {
    this.arenaWidth = this.arenaEl.offsetWidth;
    this.arenaHeight = this.arenaEl.offsetHeight;
  }

  toggleAudio() {
    return this.audioManager.toggle();
  }

  resetInput() {
    this.keyboardInput.reset();
    this.touchInput.reset();
    if (this.p1) {
      this.p1.combatState.guardFrames = 0;
      this.p1.ultCharge = 0;
      this.p1.isBlocking = false;
    }
    this.ultimateCast = false;
  }

  togglePause() {
    if (!this.gameActive) return false;
    this.resetInput();
    this.paused = !this.paused;
    if (this.paused) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
      this.audioManager.stopBGM();
    } else {
      this.lastTime = null;
      this.audioManager.startBGM();
      this.frameId = requestAnimationFrame(this.battleLoop);
    }
    return this.paused;
  }

  clearAttacks() {
    for (const p of this.projectiles) p.destroy();
    this.projectiles = [];
    for (const fighter of [this.p1, this.cpu]) {
      if (fighter) fighter.pendingActions.length = 0;
    }
  }

  stopBattle() {
    this.gameActive = false;
    this.paused = false;
    cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.resetInput();
    this.clearAttacks();
    this.ko = null;
    this.audioManager.stopBGM();
    this.particleSystem?.clear();
    this.activeWeaponDrop?.el.remove();
    this.activeWeaponDrop = null;
    this.trails = [];
    this.arenaEl?.querySelectorAll(".trail-ghost, .ground-crack, .damage-num").forEach(el => el.remove());
  }

  startBattle(playerChar, cpuChar, difficulty, matchHealth) {
    this.stopBattle();
    this.measureArena();
    this.difficulty = difficulty;
    this.matchHealth = matchHealth;
    this.weaponTimer = 8000;
    this.gameActive = true;
    this.bossPhase = false;
    this.survivalKills = 0;
    this.lastTime = null;
    this.accumulator = 0;
    this.announcementTime = 0;
    const baseHp = matchHealth === "unlimited" ? 100 : Number(matchHealth);
    this.timer = baseHp >= 300 ? 120 : baseHp >= 200 ? 99 : 60;

    const options = { maxHp: baseHp, startPower: 0, spdMult: 1, skinId: state.data.activeSkinId };
    for (const boost of STAT_BOOSTS.filter(b => state.data.activeBoosts.includes(b.id))) {
      if (boost.effect.type === "hp") options.maxHp *= boost.effect.value;
      if (boost.effect.type === "power") options.startPower = boost.effect.value;
      if (boost.effect.type === "spd") options.spdMult = boost.effect.value;
    }
    this.p1 = new Character(playerChar, true, this, options);
    this.p1.combatState = new CombatState(this.p1, this);
    this.spawnOpponent(cpuChar, baseHp);
    this.p1.render();
    this.onHUDUpdate?.(this.p1, this.cpu, this.timer);
    this.initAudio();
    this.audioManager.startBGM();
    this.frameId = requestAnimationFrame(this.battleLoop);
  }

  spawnOpponent(data, maxHp, startPower = 0, spdMult = 1) {
    this.cpu = new Character(data, false, this, { maxHp, startPower, spdMult });
    this.cpu.combatState = new CombatState(this.cpu, this);
    this.aiController = new AIController(this.cpu, this.p1, this);
    this.cpu.render();
  }

  battleLoop(time) {
    this.frameId = null;
    if (!this.gameActive || this.paused) return;
    // Simulate at 60 Hz on both high-refresh displays and slower mobile devices.
    this.accumulator += Math.min(100, time - (this.lastTime ?? time));
    this.lastTime = time;
    const advanced = this.accumulator >= FRAME;
    while (this.accumulator >= FRAME && this.gameActive) {
      this.accumulator -= FRAME;
      this.step(FRAME);
    }
    if (this.gameActive && !this.paused) {
      if (advanced) {
        this.particleSystem.render(this.arenaWidth, this.arenaHeight);
        this.onHUDUpdate?.(this.p1, this.cpu, this.timer);
      }
      this.frameId = requestAnimationFrame(this.battleLoop);
    }
  }

  step(dt) {
    this.keyboardInput.advance(dt);
    this.particleSystem.update(dt);
    this.updateTrails();
    if (this.announcementTime > 0) {
      this.announcementTime -= dt;
      if (this.announcementTime <= 0) document.getElementById("round-text").style.opacity = 0;
    }
    if (this.ko) {
      this.ko.time -= dt;
      if (this.ko.time <= 0) this.finishKO();
      return;
    }

    if (this.matchHealth !== "unlimited") {
      this.timer = Math.max(0, this.timer - dt / 1000);
      if (this.timer === 0) {
        const lead = this.p1.hp / this.p1.maxHp - this.cpu.hp / this.cpu.maxHp;
        if (lead > 1e-6 && this.difficulty === "expert" && !this.bossPhase) {
          this.nextRound(false);
        } else {
          this.gameEnd(Math.abs(lead) < 1e-6 ? "DRAW" : lead > 0 ? "VICTORY" : "DEFEAT");
        }
        return;
      }
    }

    const frozen = this.p1.combatState.hitstopFrames > 0 || this.cpu.combatState.hitstopFrames > 0;
    this.p1.combatState.tick();
    this.cpu.combatState.tick();
    if (frozen) return;
    this.handleInput(dt);
    if (this.ko) return;
    this.aiController.update(dt);
    if (this.ko) return;
    this.resolveStrike(this.p1, this.cpu);
    if (this.ko) return;
    this.resolveStrike(this.cpu, this.p1);
    if (this.ko) return;
    this.p1.update(dt, this.cpu);
    if (this.ko) return;
    this.cpu.update(dt, this.p1);
    if (this.ko) return;
    for (const projectile of this.projectiles) {
      projectile.update(dt);
      if (this.ko) return;
    }
    this.projectiles = this.projectiles.filter(p => p.active);
    this.updateWeaponSpawn(dt);
  }

  handleInput(dt) {
    const f = this.p1;
    const input = this.keyboardInput;
    const guardPress = input.consumePress("KeyC");
    const released = input.consumeRelease("KeyV");
    const held = input.isPressed("KeyV");
    if (!held) f.ultCharge = 0;
    if (f.cooldowns.hurt > 0 || f.cooldowns.actionLock > 0 || !f.combatState.canAct) {
      if (released) this.ultimateCast = false;
      return;
    }
    if (guardPress) f.combatState.pressGuard();
    if (f.combatState.counterFrames > 0 && input.consumePress("KeyZ")) {
      this.attack(f, this.cpu, "attack_light");
      return;
    }
    f.isBlocking = input.isPressed("KeyC") || f.combatState.guardFrames > 0;
    if (f.isBlocking) {
      f.setState("block");
      f.vx *= 0.8;
      f.ultCharge = 0;
      this.ultimateCast = false;
      return;
    }

    const direction = Number(input.isPressed("ArrowRight")) - Number(input.isPressed("ArrowLeft"));
    if (direction) {
      f.vx = direction * 6 * f.spdMult;
      f.dir = direction;
      f.setState("run");
    } else {
      f.dir = this.cpu.x < f.x ? -1 : 1;
      f.setState(f.y > 0 ? (f.vy < 0 ? "jump_rise" : "jump_fall") : `idle_${f.data.id}`);
    }
    if (f.y === 0 && input.consumePress("ArrowUp")) {
      f.vy = -18;
      f.setState("jump_rise");
    }
    if (input.consumePress("Space") && f.cooldowns.dash <= 0) {
      f.vx = f.dir * 25;
      f.cooldowns.dash = 800;
      f.dashActive = 200;
      if (f.data.id === "shadow") f.opacity = 0.4;
    }

    if (released) {
      if (!this.ultimateCast && this.useSpecial(f, this.cpu)) return;
      this.ultimateCast = false;
    }
    if (held && !this.ultimateCast && f.power >= 1) {
      f.ultCharge += dt;
      f.setState("special_charge");
      f.vx = 0;
      if (f.ultCharge >= 600 && this.useUltimate(f, this.cpu)) this.ultimateCast = true;
      return;
    }
    if (input.consumePress("KeyX")) this.attack(f, this.cpu, "attack_heavy");
    else if (input.consumePress("KeyZ")) this.attack(f, this.cpu, "attack_light");
  }

  attack(f, target, type) {
    const counterReady = type === "attack_light" && f.combatState.counterFrames > 0;
    if ((f.cooldowns.attack > 0 && !counterReady) || f.cooldowns.hurt > 0 || !f.combatState.canAct) return;
    if (!f.combatState.beginAttack(type)) return;
    this.playSound("swing");
    f.isBlocking = false;
    f.setState(type);
    f.strikeResolved = false;
    const move = f.combatState.activeMove;
    f.cooldowns.actionLock = FRAME * (move.startupFrames + move.activeFrames + move.recoveryFrames);
    if (f.combatState.counterStrike) {
      // Close the small reach gap after parrying a heavy, including against a katana.
      f.dir = target.x >= f.x ? 1 : -1;
      f.vx = f.dir * Math.min(48, Math.max(0, Math.abs(target.x - f.x) - 78) / 2);
    } else if (f.weapon?.id === "blade" && type === "attack_heavy") {
      f.dir = target.x > f.x ? 1 : -1;
      f.x = Math.max(50, Math.min(this.arenaWidth - 50, target.x - f.dir * 75));
      f.weapon.hits--;
      this.spawnParticles(f.x, f.y + 80, 15, f.weaponColor || f.data.color, 40, 500);
    } else if (f.weapon?.id === "bow" && type === "attack_light") {
      this.fireProjectile(f, { vx: f.dir * 23, dmg: 20, pierce: true, type: "arrow" });
      f.weapon.hits--;
      f.strikeResolved = true;
    } else if (f.weapon?.id === "katana") {
      f.weapon.hits--;
    }
  }

  resolveStrike(f, target) {
    if (f.strikeResolved || !f.combatState.isHitboxLive) return;
    const result = resolveCollision(f, target, f.combatState.moveId, this);
    if (result === "whiff") return;
    f.strikeResolved = true;
    let kind;
    if (result === "perfect") {
      target.perfectGuards++;
      // A counter needs a new light input after the guard has connected.
      this.keyboardInput.consumePress("KeyZ");
      this.playSound("block");
      kind = "perfect";
    } else {
      f.power = Math.min(f.maxPower, f.power + 0.4);
      if (result === "blocked") kind = "guard";
      else if (f.combatState.counterStrike) {
        f.countersLanded++;
        kind = "counter";
      } else kind = f.combatState.moveId === "attack_heavy" ? "heavy" : "light";
    }
    const contactY = Math.max(target.y + 35, Math.min(target.y + 130, f.y + 100));
    this.particleSystem.contact(target.x - f.dir * 23, contactY, f.dir, kind);
    f.render();
  }

  fireProjectile(f, config) {
    this.projectiles.push(new Projectile({
      x: f.x + f.dir * 55, y: f.y + 80, owner: f, color: f.weaponColor || f.data.color, ...config,
    }, this));
  }

  useSpecial(f, target) {
    return this.activateAbility(f, target, false);
  }

  useUltimate(f, target) {
    return this.activateAbility(f, target, true);
  }

  activateAbility(f, target, ultimate) {
    const cost = ultimate ? 3 : 1;
    if (f.power < cost || f.cooldowns.attack > 0 || f.cooldowns.hurt > 0 ||
        f.cooldowns.actionLock > 0 || !f.combatState.canAct || (ultimate && f.cooldowns.ult > 0)) return false;
    f.power -= cost;
    f.isBlocking = false;
    f.dir = target.x >= f.x ? 1 : -1;
    f.cooldowns.attack = ultimate ? 1050 : 800;
    f.cooldowns.actionLock = ultimate ? 620 : 400;
    if (ultimate) f.cooldowns.ult = 25000;
    f.setState("special_charge");
    this.playSound("special");
    if (ultimate) this.onShake?.(8);
    const color = f.weaponColor || f.data.color;
    this.spawnParticles(f.x, f.y + 80, ultimate ? 32 : 16, color, 60, 400);
    f.spawnDmg(f.x, f.y + 145, ultimate ? f.data.ultimate : f.data.special, color);
    castAbility(this, f, target, ultimate);
    return true;
  }

  updateTrails() {
    this.trails = this.trails.filter(t => {
      if (!t.el) {
        const el = document.createElement("div");
        el.className = "trail-ghost";
        el.innerHTML = createFighterHTML(t.data);
        el.style.cssText = `position:absolute; width:100px; height:160px; left:${t.x - 50}px; bottom:calc(25% + ${t.y}px); transform:scaleX(${t.dir}); pointer-events:none;`;
        this.arenaEl.appendChild(el);
        t.el = el;
      }
      t.life -= 0.15;
      t.el.style.opacity = Math.max(0, t.life) * 0.3;
      if (t.life <= 0) t.el.remove();
      return t.life > 0;
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
        const wx = 100 + Math.random() * (this.arenaWidth - 200);
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
            f.el.querySelector(".equipped-weapon")?.remove();
            f.el.appendChild(wEl);
          }
        });
      }
    }
  }

  gameEnd(result) {
    if (!this.gameActive) return;
    this.stopBattle();
    this.onGameEnd?.(result, this.p1, this.cpu, this.timer);
  }

  triggerKO(loser) {
    if (!this.gameActive || this.ko) return;
    this.ko = { loser, time: 750 };
    if (loser === this.cpu && this.matchHealth === "unlimited") this.survivalKills++;

    this.announce("K.O.!", 750);
  }

  announce(text, duration) {
    const el = document.getElementById("round-text");
    if (!el) return;
    el.textContent = text;
    el.style.opacity = 1;
    el.style.transform = "";
    this.announcementTime = duration;
  }

  finishKO() {
    const loser = this.ko.loser;
    this.ko = null;
    const survival = this.matchHealth === "unlimited";
    if (loser === this.p1) {
      this.gameEnd(survival ? "SURVIVAL_END" : "DEFEAT");
      return;
    }
    if (!survival && (this.difficulty !== "expert" || this.bossPhase)) {
      this.gameEnd("VICTORY");
      return;
    }

    this.nextRound(survival);
  }

  nextRound(survival) {
    this.clearAttacks();
    this.resetInput();
    this.p1.x = this.arenaWidth * 0.2;
    this.p1.y = this.p1.vx = this.p1.vy = 0;
    this.p1.combatState = new CombatState(this.p1, this);
    this.p1.combo = 0;
    this.onComboUpdate?.(0);
    if (survival) {
      const next = CHARACTERS.filter(c => c.id !== this.cpu.data.id);
      const cpuChar = next[Math.floor(Math.random() * next.length)];
      this.spawnOpponent(cpuChar, 100 + 25 * this.survivalKills, 0, 1 + Math.min(0.5, this.survivalKills * 0.05));
      this.p1.hp = Math.min(this.p1.maxHp, this.p1.hp + this.p1.maxHp * 0.15);
      this.announce(`WAVE ${this.survivalKills + 1}`, 1200);
    } else {
      this.bossPhase = true;
      this.spawnOpponent(this.cpu.data, Number(this.matchHealth) * 2, 4, 1.25);
      this.timer = Math.max(60, this.timer);
      this.announce("FINAL BOSS!", 1200);
    }
    this.spawnParticles(this.cpu.x, 80, 30, this.cpu.data.color, 80, 500);
  }

  playSound(type) {
    this.audioManager.playSound(type);
  }
}

export const engine = new Engine();
