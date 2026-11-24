export class SpatialGrid {
  constructor(width, height, cellSize = 100) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.grid = Array(this.cols * this.rows)
      .fill(null)
      .map(() => []);
  }

  clear() {
    this.grid.forEach((cell) => (cell.length = 0));
  }

  insert(entity) {
    if (entity.x >= 0 && entity.x < this.width && entity.y >= 0 && entity.y < this.height) {
      const col = Math.floor(entity.x / this.cellSize);
      const row = Math.floor(entity.y / this.cellSize);
      this.grid[row * this.cols + col].push(entity);
    }
  }

  query(entities) {
    this.clear();
    entities.forEach((e) => this.insert(e));
    return this.grid.filter((cell) => cell.length > 1);
  }

  getNearby(entity) {
    const col = Math.floor(entity.x / this.cellSize);
    const row = Math.floor(entity.y / this.cellSize);
    const nearby = [];

    for (let r = Math.max(row - 1, 0); r <= Math.min(row + 1, this.rows - 1); r++) {
      for (let c = Math.max(col - 1, 0); c <= Math.min(col + 1, this.cols - 1); c++) {
        nearby.push(...this.grid[r * this.cols + c]);
      }
    }

    return nearby;
  }
}
