import { eventBus } from "../core/EventBus";
import type { GameState, LifeMood } from "../core/types";
import { clamp, damp } from "../core/utils";

const SLEEPY_MS = 30_000;
const BORED_MS = 14_000;
const FIDGET_MIN_MS = 7_000;
const FIDGET_MAX_MS = 13_000;
const STARTLED_GAP_MS = 4_500;

type IdleAction = "deepBreath" | "doubleBlink" | "lookAround" | "tinyBounce";

/**
 * Life layer (V3.2): glance, boredom, yawn, idle behaviors, mood holds.
 * Sleep timing stays here. Physics systems do not call into this except markInteraction.
 */
export class IdleSystem {
  private fidgetTimer = 0;
  private action: IdleAction | null = null;
  private actionT = 0;
  private lookPhase = 0;
  private pointerNdcX = 0;
  private pointerNdcY = 0;
  private pointerOnBody = false;
  private lastMarkAt = 0;

  constructor(private readonly state: GameState) {
    this.state.lastInteractionAt = performance.now();
    this.lastMarkAt = this.state.lastInteractionAt;
    this.state.idleFidgetAt = performance.now() + this.nextFidgetDelay();
    this.state.sleepy = false;
    this.state.mood = "neutral";
  }

  private nextFidgetDelay(): number {
    return FIDGET_MIN_MS + Math.random() * (FIDGET_MAX_MS - FIDGET_MIN_MS);
  }

  /** Called from pointer / UI interactions. */
  markInteraction(): void {
    const now = performance.now();
    const gap = now - this.lastMarkAt;
    const wasSleepy = this.state.sleepy;
    this.state.lastGapMs = gap;
    this.state.lastInteractionAt = now;
    this.lastMarkAt = now;
    this.state.idleFidgetAt = now + this.nextFidgetDelay();
    this.state.boredom = 0;
    this.action = null;
    this.actionT = 0;
    if (wasSleepy) {
      this.state.sleepy = false;
      this.state.faceDirty = true;
      eventBus.emit("idle:wake", true);
    }
  }

  /** Pointer NDC while moving (even off-body). */
  setPointerNdc(x: number, y: number, onBody: boolean): void {
    this.pointerNdcX = x;
    this.pointerNdcY = y;
    this.pointerOnBody = onBody;
  }

  /** Hold a mood for `seconds`; higher priority can override. */
  setMood(mood: LifeMood, seconds: number): void {
    const rank: Record<LifeMood, number> = {
      neutral: 0,
      bored: 1,
      happy: 2,
      annoyed: 3,
      excited: 4,
      dizzy: 4,
      sleepy: 5,
    };
    if (rank[mood] < rank[this.state.mood] && this.state.moodHold > 0.05) return;
    this.state.mood = mood;
    this.state.moodHold = seconds;
    this.state.faceDirty = true;
  }

  isSleepy(): boolean {
    return this.state.sleepy;
  }

  update(dt: number): void {
    const state = this.state;
    const now = performance.now();
    const idleFor = now - state.lastInteractionAt;

    // --- Mood decay ---
    if (state.moodHold > 0) {
      state.moodHold -= dt;
      if (state.moodHold <= 0) {
        state.moodHold = 0;
        if (state.mood !== "sleepy" && state.mood !== "bored") {
          state.mood = "neutral";
          state.faceDirty = true;
        }
      }
    }

    // --- Boredom ---
    if (!state.pressing && !state.sleepy) {
      const boredTarget = clamp((idleFor - BORED_MS) / 18_000, 0, 1);
      state.boredom = damp(state.boredom, boredTarget, 1.2, dt);
      if (state.boredom > 0.55 && state.mood !== "sleepy" && state.moodHold < 0.2) {
        state.mood = "bored";
      }
    } else {
      state.boredom = damp(state.boredom, 0, 4, dt);
    }

    // --- Sleepy ---
    if (!state.sleepy && !state.pressing && idleFor > SLEEPY_MS) {
      state.sleepy = true;
      state.mood = "sleepy";
      state.moodHold = 99;
      state.faceDirty = true;
      eventBus.emit("idle:sleepy", true);
    }

    // --- Glance (L1) ---
    const wantGlance = state.pressing || this.pointerOnBody ? 1 : 0;
    // Snappier lock-on so eyes track the pointer immediately.
    state.glance = damp(state.glance, wantGlance, state.glance < wantGlance ? 12 : 3.5, dt);
    if (wantGlance > 0.05) {
      state.glanceNdc.x = damp(state.glanceNdc.x, this.pointerNdcX, 14, dt);
      state.glanceNdc.y = damp(state.glanceNdc.y, this.pointerNdcY, 14, dt);
    } else if (this.action === "lookAround") {
      // Scan left/right slowly.
      this.lookPhase += dt * 1.4;
      state.glanceNdc.x = Math.sin(this.lookPhase) * 0.55;
      state.glanceNdc.y = damp(state.glanceNdc.y, -0.1, 3, dt);
      state.glance = damp(state.glance, 0.55, 3, dt);
    } else {
      state.glanceNdc.x = damp(state.glanceNdc.x, 0, 2.5, dt);
      state.glanceNdc.y = damp(state.glanceNdc.y, 0, 2.5, dt);
      state.glance = damp(state.glance, 0, 2.5, dt);
    }

    // --- Yawn ---
    const yawnWindow = state.boredom > 0.45 || (state.sleepy && idleFor > SLEEPY_MS - 2000);
    if (yawnWindow && !state.pressing && state.yawn <= 0) {
      if (Math.random() < dt * 0.35) state.yawn = 0.01;
    }
    if (state.yawn > 0) {
      // 0 → 1 → 0 over ~2.2s
      state.yawn += dt * 0.9;
      if (state.yawn >= 2) state.yawn = 0;
      state.faceDirty = true;
    }

    // --- Breathing boost decay ---
    if (state.breathBoost > 1.01) {
      state.breathBoost = damp(state.breathBoost, 1, 1.5, dt);
    } else {
      state.breathBoost = 1;
    }

    if (state.reduceMotion) {
      // Keep glance/mood/yawn numbers but suppress large idle motion below.
      state.glance = Math.min(state.glance, wantGlance);
    }

    // --- Idle action scheduler ---
    if (state.sleepy || state.pressing) {
      this.action = null;
      return;
    }

    if (this.action) {
      this.actionT += dt;
      this.runAction(dt);
      if (this.actionT > this.actionDuration(this.action)) {
        if (this.action === "lookAround") {
          this.state.leanTarget.set(0, 0);
        }
        this.action = null;
        this.actionT = 0;
        this.lookPhase = 0;
      }
      return;
    }

    this.fidgetTimer += dt;
    if (now >= state.idleFidgetAt) {
      state.idleFidgetAt = now + this.nextFidgetDelay();
      this.pickAction();
    }
  }

  private actionDuration(a: IdleAction): number {
    switch (a) {
      case "deepBreath":
        return 2.4;
      case "doubleBlink":
        return 0.55;
      case "lookAround":
        return 3.2;
      case "tinyBounce":
        return 0.8;
    }
  }

  private pickAction(): void {
    const state = this.state;
    if (state.reduceMotion) {
      this.action = "doubleBlink";
      return;
    }
    const roll = Math.random();
    if (state.boredom > 0.4) {
      this.action = roll < 0.45 ? "lookAround" : roll < 0.75 ? "deepBreath" : "tinyBounce";
    } else {
      this.action = roll < 0.35 ? "deepBreath" : roll < 0.55 ? "doubleBlink" : roll < 0.8 ? "lookAround" : "tinyBounce";
    }
    this.actionT = 0;
    this.lookPhase = 0;
    eventBus.emit("life:action", this.action);
  }

  private runAction(dt: number): void {
    const state = this.state;
    const t = this.actionT;
    switch (this.action) {
      case "deepBreath": {
        // Bell-ish curve peaking mid-action.
        const u = clamp(t / 2.4, 0, 1);
        const wave = Math.sin(u * Math.PI);
        state.breathBoost = 1 + wave * 0.9;
        break;
      }
      case "doubleBlink": {
        if (t < 0.08 || (t > 0.22 && t < 0.3)) {
          state.blink = 0;
          state.faceDirty = true;
        }
        break;
      }
      case "lookAround": {
        // glance handled above
        state.leanTarget.x = Math.sin(this.lookPhase) * 0.08;
        state.leanTarget.y = -0.02;
        break;
      }
      case "tinyBounce": {
        if (t < 0.05) state.happyVel += 2.4;
        if (t > 0.28 && t < 0.33) state.wobbleVel += 1.1;
        break;
      }
    }
    void dt;
  }
}
