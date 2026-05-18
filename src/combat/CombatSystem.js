/**
 * CombatSystem.js
 * Core combat mechanics, state machine, and collision resolution.
 */

import { FighterState, AttackLevel, MOVE_DATA } from "./MoveRegistry.js";
import { InputBuffer } from "./ComboDetector.js";

/**
 * class CombatState
 * Frame-data driven state machine for a single fighter.
 */
export class CombatState {
  /**
   * @param {object} fighter - The Fighter instance
   * @param {object} engine  - The Engine instance
   */
  constructor(fighter, engine) {
    this.fighter = fighter;
    this.engine = engine;
    this.state = FighterState.IDLE;
    this.prevState = FighterState.IDLE;

    /** Current move being executed (from MOVE_DATA) */
    this.activeMove = null;

    /** Frame counters (in 60fps frames) */
    this.framesLeft = 0;

    /** Juggle gravity scalar — increases each juggle hit to prevent infinites */
    this.juggleGravity = 1.0;
    this.juggleHits = 0;

    /** Reference to the fighter's InputBuffer */
    this.inputBuffer = new InputBuffer(5);

    /** Hitstop: frames remaining where both fighters freeze */
    this.hitstopFrames = 0;

    /** Crouching flag — set externally when down is held */
    this.isCrouching = false;
  }

  // ── State Transitions ─────────────────────────────────────────────────────

  /**
   * Attempt to begin an attack. Respects cancel rules.
   * @param {string} moveId - Key into MOVE_DATA
   * @returns {boolean} true if the attack was started
   */
  beginAttack(moveId) {
    const move = MOVE_DATA[moveId];
    if (!move) return false;

    const canCancel =
      this.state === FighterState.IDLE ||
      this.state === FighterState.WALK ||
      this.state === FighterState.DASH ||
      // Special cancel: recovery frames of a cancelable move
      (this.state === FighterState.RECOVERY &&
        this.activeMove?.cancelable &&
        moveId === "special");

    if (!canCancel) {
      // Buffer the input for later execution
      this.inputBuffer.push(moveId);
      return false;
    }

    this.activeMove = move;
    this._transition(FighterState.STARTUP, move.startupFrames);
    return true;
  }

  /**
   * Apply a received hit. Calculates hitstun/blockstun and juggle scaling.
   * @param {object} move     - MOVE_DATA entry of the incoming attack
   * @param {boolean} blocked - Whether this fighter is blocking
   * @param {boolean} airborne - Whether this fighter is currently airborne
   */
  applyHit(move, blocked, airborne) {
    if (blocked) {
      // Check block validity
      const blockValid =
        move.hitLevel === AttackLevel.MID ||
        (move.hitLevel === AttackLevel.HIGH && !this.isCrouching) ||
        (move.hitLevel === AttackLevel.LOW && this.isCrouching);

      if (blockValid) {
        this._transition(FighterState.BLOCKSTUN, move.blockstunFrames);
        return "blocked";
      }
      // Wrong block type — treated as a hit
    }

    if (airborne) {
      // Juggle gravity scaling: each successive juggle hit does less hitstun
      this.juggleHits++;
      const scaledHitstun = Math.max(
        4,
        Math.floor(move.hitstunFrames * (1 / (1 + this.juggleHits * 0.3))),
      );
      this.juggleGravity = Math.min(3.5, 1 + this.juggleHits * 0.4);
      this._transition(FighterState.JUGGLED, scaledHitstun);
      return "juggled";
    }

    // Launcher check
    if (move.isLauncher) {
      this.juggleHits = 0;
      this.juggleGravity = 1.0;
      this._transition(FighterState.JUGGLED, move.hitstunFrames);
      return "launched";
    }

    this._transition(FighterState.HITSTUN, move.hitstunFrames);
    return "hit";
  }

  // ── Per-frame Tick ─────────────────────────────────────────────────────────

  /**
   * Advance the state machine by one frame (call at 60fps).
   */
  tick() {
    // Hitstop: both fighters freeze — don't advance any counters
    if (this.hitstopFrames > 0) {
      this.hitstopFrames--;
      return;
    }

    // Advance the InputBuffer regardless of state
    this.inputBuffer.tick();

    if (this.framesLeft > 0) {
      this.framesLeft--;
    }

    if (this.framesLeft === 0) {
      this._onFrameExpiry();
    }
  }

  /** Apply hitstop to this fighter. */
  applyHitstop(frames) {
    this.hitstopFrames = Math.max(this.hitstopFrames, frames);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  get isAttacking() {
    return (
      this.state === FighterState.STARTUP ||
      this.state === FighterState.ACTIVE ||
      this.state === FighterState.RECOVERY
    );
  }
  get isHitboxLive() {
    return this.state === FighterState.ACTIVE;
  }
  get isInvulnerable() {
    return this.state === FighterState.DASH;
  } // Can be extended per character
  get canAct() {
    return (
      this.state === FighterState.IDLE ||
      this.state === FighterState.WALK ||
      this.state === FighterState.DASH
    );
  }

  /**
   * Get the current hitbox rect (in arena-space, facing right).
   * Caller must mirror xOffset if fighter faces left (dir === -1).
   */
  getHitbox() {
    if (!this.isHitboxLive || !this.activeMove) return null;
    const { xOffset, yOffset, width, height } = this.activeMove.hitbox;
    return {
      x: this.fighter.x + (this.fighter.dir > 0 ? xOffset : -(xOffset + width)),
      y: this.fighter.y + yOffset,
      width,
      height,
      level: this.activeMove.hitLevel,
    };
  }

  /**
   * Get the current hurtbox (always present unless DASH or special invul frames).
   */
  getHurtbox() {
    if (this.isInvulnerable) return null;
    const hb = this.activeMove?.hurtbox ?? MOVE_DATA.attack_light.hurtbox;
    return {
      x: this.fighter.x + hb.xOffset,
      y: this.fighter.y + hb.yOffset,
      width: hb.width,
      height: hb.height,
    };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _transition(newState, frames) {
    this.prevState = this.state;
    this.state = newState;
    this.framesLeft = frames;
  }

  _onFrameExpiry() {
    switch (this.state) {
      case FighterState.STARTUP:
        this._transition(FighterState.ACTIVE, this.activeMove.activeFrames);
        break;

      case FighterState.ACTIVE:
        this._transition(FighterState.RECOVERY, this.activeMove.recoveryFrames);
        break;

      case FighterState.RECOVERY: {
        // Check input buffer — execute buffered action immediately on frame 1
        const buffered = this.inputBuffer.consume();
        if (buffered) {
          this.beginAttack(buffered);
        } else {
          this.activeMove = null;
          this._transition(FighterState.IDLE, 0);
        }
        break;
      }

      case FighterState.HITSTUN:
      case FighterState.BLOCKSTUN:
        this.activeMove = null;
        this._transition(FighterState.IDLE, 0);
        break;

      case FighterState.JUGGLED:
        // Land only once fighter.y reaches ground (managed by Engine physics)
        // Just transition to KNOCKDOWN here; Engine sets y=0
        this._transition(FighterState.KNOCKDOWN, 20); // 20-frame wakeup
        this.juggleHits = 0;
        this.juggleGravity = 1.0;
        break;

      case FighterState.KNOCKDOWN:
        this._transition(FighterState.IDLE, 0);
        break;

      default:
        break;
    }
  }
}

/**
 * Resolves a hit between attacker and defender using full frame data.
 * Applies damage, knockback, hitstun/blockstun, hitstop, and screen shake.
 *
 * @param {object} attacker  - The Fighter instance throwing the attack
 * @param {object} defender  - The Fighter instance receiving it
 * @param {string} moveId    - Key into MOVE_DATA (e.g. 'attack_light')
 * @param {object} engine    - The Engine instance (for shake/particles)
 * @returns {'hit'|'blocked'|'juggled'|'launched'|'whiff'} result string
 */
export function resolveCollision(attacker, defender, moveId, engine) {
  const move = MOVE_DATA[moveId];
  if (!move) return "whiff";

  const acs = attacker.combatState;
  const dcs = defender.combatState;

  // ── Hitbox vs Hurtbox intersection ────────────────────────────────────────
  const hitbox = acs?.getHitbox();
  const hurtbox = dcs?.getHurtbox();

  // If CombatState is attached, use precise box check; otherwise fall through
  if (hitbox && hurtbox) {
    const overlap =
      hitbox.x < hurtbox.x + hurtbox.width &&
      hitbox.x + hitbox.width > hurtbox.x &&
      hitbox.y < hurtbox.y + hurtbox.height &&
      hitbox.y + hitbox.height > hurtbox.y;
    if (!overlap) return "whiff";
  }

  // ── Determine hit result ──────────────────────────────────────────────────
  const isAirborne = defender.y > 10; // defender is off the ground
  const result = dcs
    ? dcs.applyHit(move, defender.isBlocking, isAirborne)
    : defender.isBlocking
      ? "blocked"
      : "hit";

  // ── Calculate final damage ────────────────────────────────────────────────
  let dmg = move.damage;

  if (result === "blocked") {
    dmg *= 0.25; // Chip damage on block
  } else if (result === "juggled") {
    // Juggle gravity scaling reduces damage on successive air hits
    const scale = dcs ? 1 / dcs.juggleGravity : 0.7;
    dmg *= Math.max(0.2, scale);
  }

  // ── Apply knockback ───────────────────────────────────────────────────────
  let kb = move.knockback * attacker.dir;
  if (result === "blocked") kb *= 0.4;
  if (result === "launched" || result === "juggled") {
    defender.vy = -16 / (dcs?.juggleGravity ?? 1); // Upward launch, scaled
  }

  // ── Hitstop — freeze both fighters ───────────────────────────────────────
  const hitstopFrames =
    result === "blocked" ? Math.ceil(move.hitstop * 0.5) : move.hitstop;

  if (acs) acs.applyHitstop(hitstopFrames);
  if (dcs) dcs.applyHitstop(hitstopFrames);

  // Freeze velocity during hitstop (Engine will not move fighters for N frames)
  attacker._hitstopFrames = hitstopFrames;
  defender._hitstopFrames = hitstopFrames;

  // ── Delegate damage + VFX to existing Fighter.takeDamage ─────────────────
  defender.takeDamage(dmg, kb);

  // ── Screen Shake (weight-mapped to hitstop) ───────────────────────────────
  if (engine?.onShake) {
    const shakeAmt =
      result === "blocked"
        ? 1.5
        : result === "launched"
          ? 10
          : result === "juggled"
            ? 6
            : hitstopFrames * 0.8;
    engine.onShake(shakeAmt);
  }

  // ── Combo meter ───────────────────────────────────────────────────────────
  if (result !== "whiff" && result !== "blocked") {
    attacker.combo = (attacker.combo || 0) + 1;
    attacker.comboTimer = 1500;
    if (attacker.isPlayer && engine?.onComboUpdate) {
      engine.onComboUpdate(attacker.combo);
    }
  }

  return result;
}
