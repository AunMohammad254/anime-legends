export class Character {
  constructor(data, isPlayer, options = {}) {
    this.data = data;
    this.isPlayer = isPlayer;

    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.w = 60;
    this.h = 80;

    this.maxHp = options.maxHp || 100;
    this.hp = this.maxHp;
    this.power = options.startPower || 0;
    this.maxPower = 4;
    this.spdMult = options.spdMult || 1;

    this.state = `idle_${data.id}`;
    this.dir = isPlayer ? 1 : -1;
    this.combo = 0;
    this.comboTimer = 0;
    this.isBlocking = false;
    this.dashActive = 0;
    this.ultCharge = 0;
    this.opacity = 1;

    this.cooldowns = {
      attack: 0,
      dash: 0,
      special: 0,
      hurt: 0,
      ult: 0,
      actionLock: 0,
    };

    this.weapon = null;
    this.skinId = options.skinId || "default";
  }

  update(dt) {
    Object.keys(this.cooldowns).forEach((k) => {
      if (this.cooldowns[k] > 0) this.cooldowns[k] -= dt;
    });

    if (this.dashActive > 0) this.dashActive -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    return this.hp === 0;
  }

  isAlive() {
    return this.hp > 0;
  }

  setState(newState) {
    this.state = newState;
  }

  addPower(amount) {
    this.power = Math.min(this.maxPower, this.power + amount);
  }

  resetCombo() {
    this.combo = 0;
    this.comboTimer = 0;
  }

  incrementCombo() {
    this.combo++;
    this.comboTimer = 2000;
  }
}
