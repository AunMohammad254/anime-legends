// Ability delays use the fighter's simulation clock so pausing freezes every hit.
export function castAbility(engine, fighter, target, ultimate) {
  const color = fighter.weaponColor || fighter.data.color;
  const burst = (x, y, count = 18) => engine.spawnParticles(x, y, count, color, 60, 400);
  const later = (delay, execute) => fighter.pendingActions.push({ delay, execute });
  const shoot = (speed, damage, extras = {}) => engine.fireProjectile(fighter, {
    vx: fighter.dir * speed, dmg: damage, color, ...extras,
  });
  const strike = (reach, damage, push, lift = 0) => {
    if (Math.abs(fighter.x - target.x) > reach || Math.abs(fighter.y - target.y) > 160 || target.dashActive > 0) return false;
    target.takeDamage(damage, push * fighter.dir);
    burst(target.x, target.y + 70);
    if (target.isBlocking) return false;
    if (lift && target.hp > 0) target.vy = -lift;
    return true;
  };
  const blink = () => {
    burst(fighter.x, fighter.y + 70);
    const width = engine.arenaEl.offsetWidth;
    const side = target.x > width / 2 ? -1 : 1;
    fighter.x = Math.max(50, Math.min(width - 50, target.x + side * 78));
    fighter.y = target.y;
    fighter.dir = -side;
    fighter.vx = 0;
  };

  switch (fighter.data.id) {
    case "blaze":
      shoot(13, ultimate ? 25 : 30, { type: "fireball" });
      if (ultimate) {
        later(125, () => shoot(16, 20, { type: "fireball" }));
        later(250, () => shoot(20, 20, { type: "fireball" }));
      }
      break;
    case "shadow":
      blink();
      fighter.opacity = 0.4;
      if (ultimate) {
        for (let i = 0; i < 5; i++) {
          later(i * 100, () => {
            blink();
            strike(120, 12, 2);
          });
        }
      } else {
        strike(120, 27, 7);
      }
      break;
    case "storm": {
      const impactX = ultimate ? target.x : fighter.x + fighter.dir * 90;
      const range = ultimate ? 140 : 170;
      burst(impactX, 14, 32);
      const bolt = () => {
        for (let h = 20; h <= 180; h += 35) burst(impactX, h, 4);
        if (Math.abs(impactX - target.x) < range) target.takeDamage(ultimate ? 21 : 30, 4 * fighter.dir);
      };
      later(180, bolt);
      if (ultimate) {
        later(330, bolt);
        later(480, bolt);
      }
      break;
    }
    case "frost":
      shoot(ultimate ? 18 : 12, ultimate ? 55 : 22, {
        onHit(victim) {
          victim.cooldowns.hurt = Math.max(victim.cooldowns.hurt, ultimate ? 1100 : 600);
        },
      });
      break;
    case "terra":
      burst(fighter.x, 8, 32);
      if (ultimate) {
        for (let i = 1; i <= 3; i++) {
          later(i * 130, () => {
            burst(target.x, 10);
            if (target.y < 75) target.takeDamage(20, fighter.dir * 3);
          });
        }
      } else {
        strike(245, 33, 10, 10);
      }
      break;
    case "aero":
      shoot(18, ultimate ? 20 : 25, { onHit(victim) { victim.vy = -12; } });
      if (ultimate) {
        later(120, () => shoot(17, 18, { y: fighter.y + 115 }));
        later(240, () => shoot(20, 23, { y: fighter.y + 145 }));
      }
      break;
    case "iron":
      fighter.vx = fighter.dir * (ultimate ? 28 : 18);
      later(115, () => strike(ultimate ? 260 : 155, ultimate ? 68 : 34, ultimate ? 20 : 12, 9));
      break;
    case "venom":
      shoot(14, ultimate ? 30 : 18, {
        onHit(victim) {
          const ticks = ultimate ? 6 : 3;
          for (let i = 1; i <= ticks; i++) {
            victim.pendingActions.push({
              delay: i * 280,
              execute: () => {
                victim.takeDamage(4, 0, true);
                burst(victim.x, victim.y + 60, 4);
              },
            });
          }
        },
      });
      break;
    case "aqua":
      shoot(ultimate ? 16 : 12, ultimate ? 28 : 27);
      if (ultimate) {
        later(160, () => shoot(16, 22));
        later(320, () => shoot(16, 16));
      } else {
        fighter.hp = Math.min(fighter.maxHp, fighter.hp + 5);
      }
      break;
    case "soul":
      if (ultimate) blink();
      if (strike(ultimate ? 200 : 180, ultimate ? 55 : 26, 7)) {
        fighter.hp = Math.min(fighter.maxHp, fighter.hp + (ultimate ? 16 : 6));
      }
      break;
  }
}
