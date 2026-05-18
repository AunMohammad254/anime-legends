/**
 * ComboDetector.js
 * Handles input buffering and combo sequence detection.
 */

export class InputBuffer {
  /**
   * @param {number} bufferFrames - How many frames to hold a buffered input (default 5)
   */
  constructor(bufferFrames = 5) {
    this.bufferFrames = bufferFrames;
    /** @type {Array<{action: string, framesLeft: number}>} */
    this.queue = [];
  }

  /**
   * Push a new input action into the buffer.
   * @param {string} action - e.g. 'attack_light', 'attack_heavy', 'special'
   */
  push(action) {
    // Deduplicate: don't stack the same action
    if (!this.queue.find((e) => e.action === action)) {
      this.queue.push({ action, framesLeft: this.bufferFrames });
    }
  }

  /**
   * Called every frame. Decrements buffer timers and evicts expired inputs.
   */
  tick() {
    this.queue = this.queue.filter((e) => --e.framesLeft > 0);
  }

  /**
   * Consume and return the highest-priority buffered action, or null.
   * Priority order: special > attack_heavy > attack_light
   * @returns {string|null}
   */
  consume() {
    const priority = ["special", "attack_heavy", "attack_light"];
    for (const action of priority) {
      const idx = this.queue.findIndex((e) => e.action === action);
      if (idx !== -1) {
        this.queue.splice(idx, 1);
        return action;
      }
    }
    return null;
  }

  /** Check if there is any buffered input without consuming it. */
  hasPending() {
    return this.queue.length > 0;
  }

  clear() {
    this.queue = [];
  }
}
