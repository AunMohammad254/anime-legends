export class PerformanceMonitor {
  constructor() {
    this.fps = 60;
    this.frameTime = 0;
    this.frames = [];
    this.lastTime = performance.now();
    this.enabled = false;
  }

  update() {
    if (!this.enabled) return;

    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;

    this.frames.push(delta);
    if (this.frames.length > 60) {
      this.frames.shift();
    }

    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    this.fps = Math.round(1000 / avg);
    this.frameTime = avg.toFixed(2);
  }

  getStats() {
    return {
      fps: this.fps,
      frameTime: this.frameTime,
      memory: performance.memory
        ? (performance.memory.usedJSHeapSize / 1048576).toFixed(2)
        : "N/A",
    };
  }

  render(ctx, x = 10, y = 10) {
    if (!this.enabled || !ctx) return;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(x, y, 150, 80);

    ctx.fillStyle = this.fps < 55 ? "#ff4444" : "#44ff44";
    ctx.font = "14px monospace";
    ctx.fillText(`FPS: ${this.fps}`, x + 10, y + 25);
    ctx.fillText(`Frame: ${this.frameTime}ms`, x + 10, y + 45);
    ctx.fillText(`Mem: ${this.getStats().memory}MB`, x + 10, y + 65);

    ctx.restore();
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}
