import * as THREE from "three";
import { eventBus } from "../core/EventBus";
import type { GameState } from "../core/types";
import { detectSquishArea } from "../core/utils";
import type { ComboManager } from "../game/ComboManager";
import type { CameraFeedback } from "./CameraFeedback";
import type { CharacterManager } from "./CharacterManager";
import type { DeformationSystem } from "./DeformationSystem";
import type { ExpressionSystem } from "./ExpressionSystem";
import type { ParticleManager } from "./ParticleManager";
import type { SoundManager } from "./SoundManager";
import type { IdleSystem } from "../game/IdleSystem";

/**
 * Pointer interaction + raycast — owns "how the user squishes",
 * not geometry deformation.
 *
 * P0: unified SquishState (pressure / area / velocity / duration)
 * P1: combo registration + pressure-driven expressions
 * P2: sound / camera feedback / typed particles
 */
export class SquishSystem {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  readonly hitPoint = new THREE.Vector3();
  private readonly invMatrix = new THREE.Matrix4();
  private pressStartTime = 0;
  private lastMoveTime = 0;
  private lastMoveX = 0;
  private lastMoveY = 0;
  private lastSquishSoundAt = 0;
  private lastMilestone = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    private readonly characters: CharacterManager,
    private readonly deformation: DeformationSystem,
    private readonly expressions: ExpressionSystem,
    private readonly particles: ParticleManager,
    private readonly state: GameState,
    private readonly combo: ComboManager,
    private readonly sound: SoundManager,
    private readonly cameraFeedback: CameraFeedback,
    private readonly idle: IdleSystem,
    private readonly callbacks: {
      hideHint: () => void;
      say: (text: string) => void;
      setPressingCursor: (pressing: boolean) => void;
      onCountChange: (count: number) => void;
      onCombo?: (combo: number, level: number) => void;
      onSquishRecord?: (pressure: number, area: string, combo: number) => void;
      onReleaseRecord?: () => void;
    },
  ) {
    this.bind();
  }

  private setPointerNdc(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /** Exposed so character-switch juice can reuse the same raycast. */
  raycastSlime(): boolean {
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.characters.slime, false);
    if (hits.length) {
      this.hitPoint.copy(hits[0].point);
      this.characters.slime.updateMatrixWorld();
      this.invMatrix.copy(this.characters.slime.matrixWorld).invert();
      const local = this.deformation.pressPointLocal;
      local.copy(this.hitPoint).applyMatrix4(this.invMatrix).normalize();
      this.state.squish.area = detectSquishArea(local.x, local.y, local.z);
      return true;
    }
    return false;
  }

  private syncSquishSnapshot(pressing: boolean): void {
    const s = this.state.squish;
    s.isPressing = pressing;
    s.pressure = Math.min(this.state.pressStrength, 1);
    if (pressing) {
      s.duration = (performance.now() - this.pressStartTime) / 1000;
    }
    s.totalCount = this.state.pressCount;
  }

  private trackRecentPress(): void {
    const now = performance.now();
    const list = this.state.recentPressTimes;
    list.push(now);
    // Keep a 1.5s rolling window for frenzy/dizzy detection.
    while (list.length && now - list[0] > 1500) list.shift();
    if (list.length > 12) list.splice(0, list.length - 12);
  }

  private bind(): void {
    const state = this.state;
    const canvas = this.canvas;

    canvas.addEventListener("pointerdown", (e) => {
      this.sound.unlock();
      this.idle.markInteraction();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic / stale pointer ids — capture is optional.
      }
      this.setPointerNdc(e);
      state.lastPointer.set(e.clientX, e.clientY);
      state.movedFar = false;
      this.lastMoveX = e.clientX;
      this.lastMoveY = e.clientY;
      this.lastMoveTime = performance.now();
      this.callbacks.hideHint();
      if (this.raycastSlime()) {
        const wasSleepy = state.sleepy;
        state.pressing = true;
        state.pressTarget = 1;
        state.pressCount += 1;
        state.pressPeak = 0;
        this.pressStartTime = performance.now();
        state.squish.lastSquishTime = this.pressStartTime;
        this.trackRecentPress();
        const snap = this.combo.registerSquish();
        state.combo = snap.combo;
        state.comboLevel = snap.level;
        this.lastMilestone = snap.milestone;
        this.callbacks.onCombo?.(snap.combo, snap.level);
        if (snap.combo > 1) this.sound.playCombo(snap.combo);
        if (snap.milestone) this.sound.playSpecial("milestone");
        this.syncSquishSnapshot(true);
        this.callbacks.onCountChange(state.pressCount);
        this.callbacks.setPressingCursor(true);
        if (wasSleepy) {
          // Startled awake.
          this.expressions.setExpression(state, "surprised", 1.2);
          this.sound.playSpecial("wake");
          state.happyVel += 8;
          state.wobbleVel += 4;
          eventBus.emit("idle:wake", true);
        } else {
          this.expressions.setExpression(state, "surprised", 99);
        }
        this.callbacks.say(state.character.lines.press);
        this.sound.playSquish(0.4);
        this.lastSquishSoundAt = performance.now();
        const pType = state.character.particleType ?? "star";
        this.particles.spawn(
          this.hitPoint,
          0.45,
          state.color,
          state.reduceMotion,
          pType,
          state.comboLevel,
        );
        // Stats are recorded once on release (peak pressure) — not here.
        eventBus.emit("squish:start", state.squish);
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      this.setPointerNdc(e);
      const now = performance.now();
      const dtMove = Math.max(now - this.lastMoveTime, 1) / 1000;
      const dx = e.clientX - state.lastPointer.x;
      const dy = e.clientY - state.lastPointer.y;
      const stepDx = e.clientX - this.lastMoveX;
      const stepDy = e.clientY - this.lastMoveY;
      state.squish.velocity = Math.hypot(stepDx, stepDy) / dtMove;
      this.lastMoveX = e.clientX;
      this.lastMoveY = e.clientY;
      this.lastMoveTime = now;

      if (Math.hypot(dx, dy) > 4) state.movedFar = true;

      const hit = this.raycastSlime();
      state.hovering = hit;

      if (state.pressing) {
        state.dragging = state.movedFar;
        if (state.dragging) {
          state.dragTarget.set(dx * 0.014, -dy * 0.014, 0);
          state.pressTarget = 0.75;
        } else if (hit) {
          state.pressTarget = 1;
        }
        this.syncSquishSnapshot(true);
        // Pressure ladder drives expression (surprised → pain → press).
        this.expressions.applyPressureExpression(state);
        if (state.squish.pressure > state.pressPeak) state.pressPeak = state.squish.pressure;
        if (state.dragging && state.expr !== "drag") {
          this.callbacks.say(state.character.lines.drag);
        }
        // Throttled squish sound as pressure builds.
        const nowMs = performance.now();
        if (nowMs - this.lastSquishSoundAt > 90 && state.squish.pressure > 0.15) {
          this.sound.playSquish(state.squish.pressure);
          this.lastSquishSoundAt = nowMs;
        }
        if (state.squish.pressure > 0.7) {
          this.cameraFeedback.punchZoom((state.squish.pressure - 0.7) * 0.2);
        }
        eventBus.emit("squish:update", state.squish);
      } else if (hit) {
        state.leanTarget.set(this.pointerNdc.x * 0.12, this.pointerNdc.y * 0.08);
      } else {
        state.leanTarget.set(0, 0);
      }
    });

    const endPress = () => {
      if (!state.pressing && !state.dragging) return;
      const wasHard = state.pressStrength > 0.45;
      const wasDrag = state.dragging;
      const peak = Math.min(state.pressStrength, 1);
      state.pressing = false;
      state.dragging = false;
      state.pressTarget = 0;
      state.dragTarget.set(0, 0, 0);
      // Kick secondary motion: ears lag opposite the lean, opposite side bulges.
      const area = state.squish.area;
      const kick = wasHard ? peak : peak * 0.4;
      if (area === "left-cheek" || area === "left-ear") {
        state.sideCompVel += kick * 8;
        state.earLagVel.x += kick * 6;
      } else if (area === "right-cheek" || area === "right-ear") {
        state.sideCompVel -= kick * 8;
        state.earLagVel.x -= kick * 6;
      }
      if (area === "top" || area === "belly") {
        state.headLagVel.y += (area === "belly" ? -1 : 1) * kick * 7;
      }
      // High combo amplifies release wobble slightly (capped).
      const comboBoost = 1 + state.comboLevel * 0.35;
      state.wobbleVel += (wasHard ? 5 + state.pressStrength * 7 : 2) * comboBoost;
      this.expressions.setExpression(state, wasHard ? "happy" : "idle", wasHard ? 1.1 : 0.4);
      const pType = state.character.particleType ?? "star";
      if (wasHard) {
        this.sound.playRelease(peak);
        this.particles.spawnRelease(this.hitPoint, peak, state.color, state.reduceMotion, pType);
        this.cameraFeedback.punchZoom(-peak * 0.5);
        if (state.comboLevel > 0.25) {
          this.cameraFeedback.shake(state.comboLevel);
        }
        this.callbacks.say(
          wasDrag ? state.character.lines.drag : state.character.lines.release,
        );
      } else {
        this.sound.playRelease(peak * 0.5);
        // Soft release — DynamicCopy takes over; clear press line immediately.
        this.callbacks.say(state.character.lines.idle);
      }
      this.syncSquishSnapshot(false);
      state.squish.duration = 0;
      this.callbacks.setPressingCursor(false);
      // Record stats once per completed press.
      const recordP = Math.max(peak, state.pressPeak, state.squish.pressure, 0.2);
      this.callbacks.onSquishRecord?.(Math.min(recordP, 1), area, state.combo);
      this.callbacks.onReleaseRecord?.();
      state.pressPeak = 0;
      eventBus.emit("squish:end", { ...state.squish, pressure: peak });
      eventBus.emit("squish:releasedHard", wasHard);
    };

    canvas.addEventListener("pointerup", endPress);
    canvas.addEventListener("pointercancel", endPress);
    canvas.addEventListener("pointerleave", () => {
      state.hovering = false;
      state.leanTarget.set(0, 0);
    });

    canvas.addEventListener("dblclick", (e) => {
      this.setPointerNdc(e as unknown as PointerEvent);
      this.callbacks.hideHint();
      state.happyVel += 13;
      state.wobbleVel += 3.5;
      this.expressions.setExpression(state, "happy", 1.4);
      this.callbacks.say(state.character.lines.happy);
      if (this.raycastSlime()) {
        this.particles.spawn(this.hitPoint, 0.85, state.color, state.reduceMotion);
      }
    });
  }
}
