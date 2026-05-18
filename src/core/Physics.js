export class Physics {
  static checkCollision(a, b) {
    return (
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    );
  }

  static resolveCollision(entity, bounds) {
    if (entity.x < bounds.left) entity.x = bounds.left;
    if (entity.x + entity.w > bounds.right) entity.x = bounds.right - entity.w;
    if (entity.y < bounds.top) entity.y = bounds.top;
    if (entity.y + entity.h > bounds.bottom)
      entity.y = bounds.bottom - entity.h;
  }

  static applyGravity(entity, gravity = 0.5) {
    entity.vy += gravity;
  }

  static applyFriction(entity, friction = 0.85) {
    entity.vx *= friction;
  }
}
