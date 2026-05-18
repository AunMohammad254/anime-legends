import { getDifficultyParams } from "./DifficultyConfig.js";

/**
 * AIController.js
 * Handles the state machine and decision logic for the CPU opponent.
 */
export class AIController {
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
    
    const params = getDifficultyParams(this.engine.difficulty);
    const delay = params.delayBase + Math.random() * (params.delayBase * 0.5);

    if (this.engine.activeWeaponDrop && this.cpu.hp < this.cpu.maxHp * 0.7) {
      const wDist = Math.abs(this.engine.activeWeaponDrop.x - this.cpu.x);
      const pWDist = Math.abs(this.engine.activeWeaponDrop.x - this.p1.x);
      if (wDist < pWDist) {
        this.cpu.dir = this.engine.activeWeaponDrop.x > this.cpu.x ? 1 : -1;
        this.cpu.vx = this.cpu.dir * params.speed;
        this.cpu.setState("run");
        this.execAt = Date.now() + 100;
        return;
      }
    }

    switch (this.state) {
      case "APPROACH":
        if (dist > 120) {
          this.cpu.dir = this.p1.x > this.cpu.x ? 1 : -1;
          this.cpu.vx = this.cpu.dir * params.speed;
          this.cpu.setState("run");
          this.execAt = Date.now() + 100;
        } else {
          this.state = "ATTACK";
          this.execAt = Date.now() + delay;
        }
        break;
      case "ATTACK":
        if (
          this.cpu.hp < this.cpu.maxHp * params.retreatHpThreshold &&
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
          Math.random() < params.specialChance
        ) {
          this.state = "SPECIAL";
          this.execAt = Date.now();
          break;
        }
        if (dist <= 130) {
          this.cpu.vx = 0;
          const r = Math.random();

          if (r < params.lightWeight) {
            this.engine.attack(this.cpu, this.p1, "attack_light");
          } else if (r < params.lightWeight + params.heavyWeight) {
            this.engine.attack(this.cpu, this.p1, "attack_heavy");
          } else {
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
