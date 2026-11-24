import { getDifficultyParams } from "./DifficultyConfig.js";

export class AIController {
  constructor(cpu, p1, engine) {
    this.cpu = cpu;
    this.p1 = p1;
    this.engine = engine;
    this.state = "APPROACH";
    this.wait = 0;
    this.retreatCooldown = 0;
  }

  update(dt = 1000 / 60) {
    const cpu = this.cpu;
    const player = this.p1;
    if (!cpu.hp || !player.hp) return;
    this.wait -= dt;
    this.retreatCooldown = Math.max(0, this.retreatCooldown - dt);
    if (this.wait > 0) return;
    if (cpu.cooldowns.hurt > 0 || cpu.cooldowns.actionLock > 0 || !cpu.combatState.canAct) return;

    const params = getDifficultyParams(this.engine.difficulty);
    const delay = params.delayBase * (1 + Math.random() * 0.5);
    const dist = Math.abs(player.x - cpu.x);
    const face = player.x >= cpu.x ? 1 : -1;
    cpu.dir = face;
    cpu.isBlocking = false;

    if (this.state === "BLOCK" || this.state === "RETREAT") this.state = "APPROACH";
    const drop = this.engine.activeWeaponDrop;
    if (!cpu.weapon && drop && cpu.hp < cpu.maxHp * 0.7 && Math.abs(drop.x - cpu.x) < Math.abs(drop.x - player.x)) {
      this.moveToward(drop.x, params.speed);
      return;
    }

    if (this.state === "APPROACH") {
      if (dist > 106) {
        this.moveToward(player.x, params.speed);
      } else {
        cpu.vx = 0;
        cpu.setState(`idle_${cpu.data.id}`);
        this.state = "ATTACK";
        this.wait = delay;
      }
      return;
    }

    this.state = "APPROACH";
    this.wait = delay;
    if (cpu.power >= 3 && cpu.cooldowns.ult <= 0 && cpu.hp <= cpu.maxHp * 0.5) {
      this.engine.useUltimate(cpu, player);
      return;
    }
    if (cpu.power >= 1 && Math.random() < params.specialChance) {
      this.engine.useSpecial(cpu, player);
      return;
    }
    if (dist > 140) {
      this.moveToward(player.x, params.speed);
      return;
    }
    if (cpu.hp < cpu.maxHp * params.retreatHpThreshold && this.retreatCooldown <= 0) {
      // One retreat at low health gives the player room to chase; the next exchange is forced.
      this.state = "RETREAT";
      this.retreatCooldown = 2500;
      cpu.vx = -face * 7;
      cpu.setState("walk");
      this.wait = 220;
      return;
    }
    if (player.y > cpu.y + 100 && cpu.y === 0) {
      cpu.vy = -16;
    }
    const roll = Math.random();
    if (roll < params.lightWeight) this.engine.attack(cpu, player, "attack_light");
    else if (roll < params.lightWeight + params.heavyWeight) this.engine.attack(cpu, player, "attack_heavy");
    else {
      this.state = "BLOCK";
      cpu.vx = 0;
      cpu.isBlocking = true;
      cpu.setState("block");
      this.wait = 300 + Math.random() * 260;
    }
  }

  moveToward(x, speed) {
    this.cpu.dir = x >= this.cpu.x ? 1 : -1;
    this.cpu.vx = this.cpu.dir * speed * this.cpu.spdMult;
    this.cpu.setState("run");
    this.wait = 60;
  }
}
