import { eventBus } from "../core/EventBus";
import type { GameState } from "../core/types";

const SLEEPY_MS = 30_000;
const FIDGET_MIN_MS = 8_000;
const FIDGET_MAX_MS = 15_000;

/**
 * Idle breathing is already in DeformationSystem.
 * This handles: long-idle sleep, wake, and occasional micro fidgets.
 */
export class IdleSystem {
  private fidgetTimer = 0;

  constructor(private readonly state: GameState) {
    this.state.lastInteractionAt = performance.now();
    this.state.idleFidgetAt = performance.now() + this.nextFidgetDelay();
    this.state.sleepy = false;
  }

  markInteraction(): void {
    const wasSleepy = this.state.sleepy;
    this.state.lastInteractionAt = performance.now();
    this.state.idleFidgetAt = performance.now() + this.nextFidgetDelay();
    if (wasSleepy) {
      this.state.sleepy = false;
      this.state.faceDirty = true;
      eventBus.emit("idle:wake", true);
    }
  }

  private nextFidgetDelay(): number {
    return FIDGET_MIN_MS + Math.random() * (FIDGET_MAX_MS - FIDGET_MIN_MS);
  }

  /** Returns true if a fidget fired this frame. */
  update(dt: number): boolean {
    if (this.state.reduceMotion) return false;
    const now = performance.now();

    // Sleepy
    if (!this.state.sleepy && !this.state.pressing) {
      if (now - this.state.lastInteractionAt > SLEEPY_MS) {
        this.state.sleepy = true;
        this.state.faceDirty = true;
        eventBus.emit("idle:sleepy", true);
      }
    }

    // Micro fidget only while awake and not pressing.
    if (this.state.sleepy || this.state.pressing) return false;
    this.fidgetTimer += dt;
    if (now >= this.state.idleFidgetAt) {
      this.state.idleFidgetAt = now + this.nextFidgetDelay();
      // Soft double-bounce or tiny lean — personality-scaled in motion.
      this.state.happyVel += 2.2;
      this.state.wobbleVel += 1.2;
      return true;
    }
    return false;
  }

  get isSleepy(): boolean {
    return this.state.sleepy;
  }
}
