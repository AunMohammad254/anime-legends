export class Projectile {
  constructor(config) {
    this.x = config.x;
    this.y = config.y;
    this.vx = config.vx || 0;
    this.vy = config.vy || 0;
    this.owner = config.owner;
    this.color = config.color;
    this.dmg = config.dmg || 10;
    this.type = config.type || "default";
    this.pierce = config.pierce || false;
    this.isClone = config.isClone || false;
    this.active = true;
    this.w = 20;
    this.h = 20;
  }

  update(dt) {
    this.x += this.vx * (dt / 16);
    this.y += this.vy * (dt / 16);
  }

  isOffScreen(bounds) {
    return (
      this.x < 0 ||
      this.x > bounds.width ||
      this.y < 0 ||
      this.y > bounds.height
    );
  }

  deactivate() {
    this.active = false;
  }
}
