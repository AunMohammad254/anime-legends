export class SpatialGrid {
  constructor(width, height, cellSize = 100) {
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
    const col = Math.floor(entity.x / this.cellSize);
    const row = Math.floor(entity.y / this.cellSize);
    const index = row * this.cols + col;

    if (index >= 0 && index < this.grid.length) {
      this.grid[index].push(entity);
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

    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        const index = r * this.cols + c;
        if (index >= 0 && index < this.grid.length) {
          nearby.push(...this.grid[index]);
        }
      }
    }

    return nearby;
  }
}
