import { eventBus } from "../core/EventBus";

export const COMBO_WINDOW_MS = 2000;
/** Cap effect scaling so combo 9999 doesn't explode visuals. */
export const COMBO_EFFECT_MAX = 1;

export interface ComboSnapshot {
  combo: number;
  /** 0 … 1 effect intensity. */
  level: number;
  milestone: boolean;
}

/**
 * Tracks consecutive squishes inside a time window.
 * Emits combo:update and combo:milestone.
 */
export class ComboManager {
  private combo = 0;
  private lastSquishAt = 0;

  get count(): number {
    return this.combo;
  }

  get level(): number {
    return Math.min(this.combo / 20, COMBO_EFFECT_MAX);
  }

  /** Call on each successful press start. Returns snapshot. */
  registerSquish(): ComboSnapshot {
    const now = performance.now();
    if (now - this.lastSquishAt <= COMBO_WINDOW_MS) {
      this.combo += 1;
    } else {
      this.combo = 1;
    }
    this.lastSquishAt = now;
    const milestone = this.combo > 0 && this.combo % 5 === 0;
    const snap: ComboSnapshot = { combo: this.combo, level: this.level, milestone };
    eventBus.emit("combo:update", snap);
    if (milestone) eventBus.emit("combo:milestone", snap);
    return snap;
  }

  /** Tick from the animation loop; resets when the window expires. */
  update(): void {
    if (this.combo > 0 && performance.now() - this.lastSquishAt > COMBO_WINDOW_MS) {
      this.combo = 0;
      eventBus.emit("combo:update", { combo: 0, level: 0, milestone: false } satisfies ComboSnapshot);
    }
  }

  reset(): void {
    this.combo = 0;
    this.lastSquishAt = 0;
  }
}
