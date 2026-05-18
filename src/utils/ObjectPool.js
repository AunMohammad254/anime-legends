export class ObjectPool {
  constructor(factory, initialSize = 100) {
    this.factory = factory;
    this.pool = [];
    this.active = [];

    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire() {
    let obj = this.pool.pop();
    if (!obj) {
      obj = this.factory();
    }
    this.active.push(obj);
    return obj;
  }

  release(obj) {
    const index = this.active.indexOf(obj);
    if (index > -1) {
      this.active.splice(index, 1);
      this.pool.push(obj);
    }
  }

  releaseAll() {
    this.pool.push(...this.active);
    this.active.length = 0;
  }

  get activeCount() {
    return this.active.length;
  }

  get poolSize() {
    return this.pool.length;
  }
}
