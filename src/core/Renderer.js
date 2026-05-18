export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d", { alpha: false }) : null;
    this.dirty = true;
    this.lastHUDData = null;
  }

  clear() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawBatch(entities) {
    if (!this.ctx) return;

    this.ctx.save();

    // Sort by z-index to minimize state changes
    entities.sort((a, b) => (a.z || 0) - (b.z || 0));

    entities.forEach((entity) => {
      if (entity.visible !== false) {
        this.drawEntity(entity);
      }
    });

    this.ctx.restore();
  }

  drawEntity(entity) {
    if (entity.sprite) {
      this.ctx.drawImage(entity.sprite, entity.x, entity.y, entity.w, entity.h);
    } else if (entity.color) {
      this.ctx.fillStyle = entity.color;
      this.ctx.fillRect(entity.x, entity.y, entity.w, entity.h);
    }
  }

  updateHUD(data) {
    // Only update if data changed
    if (
      this.lastHUDData &&
      JSON.stringify(data) === JSON.stringify(this.lastHUDData)
    ) {
      return false;
    }

    this.lastHUDData = { ...data };
    return true;
  }

  markDirty() {
    this.dirty = true;
  }
}
