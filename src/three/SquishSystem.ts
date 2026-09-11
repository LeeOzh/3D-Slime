import * as THREE from "three";
import { eventBus } from "../core/EventBus";
import type { GameState } from "../core/types";
import { detectSquishArea } from "../core/utils";
import {
  createPointerState,
  isEarRegion,
  type InteractionKind,
  type PointerState,
} from "../core/softBody";
import type { ComboManager } from "../game/ComboManager";
import type { CameraFeedback } from "./CameraFeedback";
import type { CharacterManager } from "./CharacterManager";
import type { DeformationSystem } from "./DeformationSystem";
import type { ExpressionSystem } from "./ExpressionSystem";
import type { ParticleManager } from "./ParticleManager";
import type { SoftBodySystem } from "./SoftBodySystem";
import type { SoundManager } from "./SoundManager";
import type { IdleSystem } from "../game/IdleSystem";

/**
 * Multi-pointer interaction + raycast — owns "how the user squishes",
 * not geometry deformation.
 *
 * V3: PointerState map, locked region, stretch/drag, dual-touch pinch,
 * release velocity, single-gesture stats/combo.
 */
export class SquishSystem {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  readonly hitPoint = new THREE.Vector3();
  private readonly invMatrix = new THREE.Matrix4();
  private readonly pointers = new Map<number, PointerState>();
  private readonly pointerArr: PointerState[] = [];
  private pressStartTime = 0;
  private lastMoveTime = 0;
  private lastSquishSoundAt = 0;
  private lastStretchSoundAt = 0;
  private lastMilestone = false;
  private gestureKind: InteractionKind = "squeeze";
  private gestureCounted = false;
  private lastPointerVx = 0;
  private lastPointerVy = 0;
  private primaryId: number | null = null;
  private wasMultiTouch = false;
  private gestureSawMulti = false;
  private pinchComboCounted = false;
  private lastPetSoundAt = 0;
  private lastPetParticleAt = 0;
  private petPath = 0;

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
    private readonly softBody: SoftBodySystem,
    private readonly callbacks: {
      hideHint: () => void;
      say: (text: string) => void;
      setPressingCursor: (pressing: boolean) => void;
      onCountChange: (count: number) => void;
      onCombo?: (combo: number, level: number) => void;
      onSquishRecord?: (
        pressure: number,
        area: string,
        combo: number,
        kind?: InteractionKind,
      ) => void;
      onReleaseRecord?: () => void;
    },
  ) {
    this.bind();
  }

  getPointerList(): PointerState[] {
    // Reused buffer — callers must not hold across frames.
    this.pointerArr.length = 0;
    for (const p of this.pointers.values()) this.pointerArr.push(p);
    return this.pointerArr;
  }

  private setPointerNdc(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private syncGlance(onBody: boolean): void {
    this.idle.setPointerNdc(this.pointerNdc.x, this.pointerNdc.y, onBody);
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
    s.pressure = Math.min(Math.max(this.state.pressStrength, this.state.softBody.localPressure), 1);
    if (pressing) {
      s.duration = (performance.now() - this.pressStartTime) / 1000;
    }
    s.totalCount = this.state.pressCount;
  }

  private trackRecentPress(): void {
    const now = performance.now();
    const list = this.state.recentPressTimes;
    list.push(now);
    while (list.length && now - list[0] > 1500) list.shift();
    if (list.length > 12) list.splice(0, list.length - 12);
  }

  private bind(): void {
    const state = this.state;
    const canvas = this.canvas;
    const soft = state.softBody;

    canvas.addEventListener("pointerdown", (e) => {
      this.sound.unlock();
      this.idle.markInteraction();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic / stale pointer ids — capture is optional.
      }

      this.setPointerNdc(e);
      const now = performance.now();
      const ptr = createPointerState(e.pointerId, e.clientX, e.clientY, now);
      const wasEmpty = this.pointers.size === 0;
      const hit = this.raycastSlime();
      this.syncGlance(hit);
      if (hit) {
        ptr.region = state.squish.area === "unknown" ? "unknown" : state.squish.area;
        ptr.local.copy(this.deformation.pressPointLocal);
        // Soft start: a tap should not slam to full pressure on the first frame.
        ptr.pressure = 0.28;
        // First contact owns the body lock used by stretch drag.
        if (wasEmpty || soft.lockRegion === "unknown") {
          soft.lockLocal.copy(ptr.local);
          soft.lockRegion = ptr.region;
        }
      } else {
        // Allow multi-touch even slightly off-mesh for pinch feel.
        ptr.pressure = 0.12;
        ptr.region = "unknown";
      }
      this.pointers.set(e.pointerId, ptr);
      if (this.primaryId == null) this.primaryId = e.pointerId;

      state.lastPointer.set(e.clientX, e.clientY);
      state.movedFar = false;
      this.lastMoveTime = now;
      this.callbacks.hideHint();

      const downCount = this.pointers.size;

      if (hit && downCount === 1) {
        // Hold target starts mild; a long press can still reach full via the spring.
        state.pressTarget = 0.55;
        this.beginPrimaryPress(now);
      } else if (downCount >= 2) {
        this.enterMultiTouch(now);
      }

      // Slight press feedback even for the second finger.
      if (hit) {
        this.sound.playSquish(0.25);
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      this.setPointerNdc(e);
      const now = performance.now();
      const ptr = this.pointers.get(e.pointerId);
      if (!ptr || !ptr.isDown) {
        const hit = this.raycastSlime();
        state.hovering = hit;
        this.syncGlance(hit);
        if (hit) {
          state.leanTarget.set(this.pointerNdc.x * 0.12, this.pointerNdc.y * 0.08);
        } else {
          state.leanTarget.set(0, 0);
        }
        return;
      }

      // Per-pointer velocity (not shared lastMoveTime).
      const dtMove = Math.max((now - ptr.lastMoveAt) / 1000, 1 / 240);
      const stepDx = e.clientX - ptr.x;
      const stepDy = e.clientY - ptr.y;
      ptr.vx = stepDx / dtMove;
      ptr.vy = stepDy / dtMove;
      this.lastPointerVx = ptr.vx;
      this.lastPointerVy = ptr.vy;
      state.squish.velocity = Math.hypot(stepDx, stepDy) / dtMove;
      ptr.lastMoveAt = now;

      ptr.prevX = ptr.x;
      ptr.prevY = ptr.y;
      ptr.x = e.clientX;
      ptr.y = e.clientY;

      // Each pointer keeps its own locked region (multi-touch dual pressure).
      const hit = this.raycastSlime();
      this.syncGlance(hit || ptr.region !== "unknown");
      if (hit) {
        if (ptr.region === "unknown" || !ptr.dragging) {
          // While not dragging, allow region to follow the finger.
          if (!ptr.dragging) {
            ptr.region = state.squish.area === "unknown" ? "unknown" : state.squish.area;
            ptr.local.copy(this.deformation.pressPointLocal);
          }
        }
      }
      // Stretch drag sticks to the region locked at gesture start (primary only).
      if (ptr.dragging && ptr.id === this.primaryId && soft.lockRegion !== "unknown") {
        ptr.region = soft.lockRegion;
        ptr.local.copy(soft.lockLocal);
      }

      const dragDx = e.clientX - ptr.downX;
      const dragDy = e.clientY - ptr.downY;
      const dragDist = Math.hypot(dragDx, dragDy);
      const threshold = this.softBody.getConfig().dragThreshold;
      if (dragDist > threshold && this.pointers.size < 2) {
        if (!ptr.dragging) {
          ptr.dragging = true;
          state.movedFar = true;
          this.gestureKind = isEarRegion(ptr.region) ? "earPull" : "stretch";
          if (ptr.region !== "unknown") {
            soft.lockRegion = ptr.region;
            soft.lockLocal.copy(ptr.local);
          }
        }
        soft.isPetting = false;
      }

      // Petting: rubbing the surface without yanking the body.
      const stepPx = Math.hypot(stepDx, stepDy);
      const canPet =
        this.pointers.size === 1 &&
        hit &&
        !ptr.dragging &&
        soft.stretchAmount < 0.12 &&
        stepPx > 0.4 &&
        stepPx < 28 &&
        ptr.region !== "unknown";
      if (canPet) {
        soft.isPetting = true;
        this.petPath += stepPx;
        soft.petStrength = clamp01(soft.petStrength + stepPx * 0.006);
        soft.petCenter.copy(ptr.local);
        const nowMs2 = performance.now();
        if (nowMs2 - this.lastPetSoundAt > 110 && soft.petStrength > 0.08) {
          this.sound.playPet(soft.petStrength);
          this.lastPetSoundAt = nowMs2;
        }
        if (nowMs2 - this.lastPetParticleAt > 380 && soft.petStrength > 0.2) {
          const pType = state.character.particleType ?? "star";
          this.particles.spawn(this.hitPoint, 0.22, state.color, state.reduceMotion, pType, 0);
          this.lastPetParticleAt = nowMs2;
        }
        this.idle.setMood("happy", 0.8);
      } else if (ptr.dragging) {
        soft.isPetting = false;
      }

      // Pressure builds toward 1 while holding on body; slightly less while dragging.
      if (ptr.region !== "unknown") {
        const holdBoost = ptr.dragging ? 1.6 : soft.isPetting ? 2.0 : 3.2;
        ptr.pressure = Math.min(1, ptr.pressure + dtMove * holdBoost);
      }

      this.lastMoveTime = now;

      // --- multi-touch bookkeeping ---
      const activeCount = this.pointers.size;
      if (activeCount >= 2) {
        this.wasMultiTouch = true;
        this.gestureSawMulti = true;
        soft.isMultiTouch = true;
        this.gestureKind = "pinch";
        state.pressing = true;
        state.pressTarget = 0.85;
      } else if (state.pressing) {
        if (ptr.dragging) {
          state.dragging = true;
          state.pressTarget = Math.max(0.45, Math.min(0.85, ptr.pressure * 0.9));
          if (this.gestureKind === "stretch" && state.expr !== "drag") {
            this.callbacks.say(state.character.lines.drag);
          }
        } else if (hit) {
          state.pressTarget = Math.max(0.35, Math.min(1, ptr.pressure));
        }
        this.syncSquishSnapshot(true);
        this.expressions.applyPressureExpression(state);
        this.applySoftBodyExpressions();
        if (state.squish.pressure > state.pressPeak) state.pressPeak = state.squish.pressure;

        const nowMs = performance.now();
        if (nowMs - this.lastSquishSoundAt > 90 && state.squish.pressure > 0.15) {
          this.sound.playSquish(state.squish.pressure);
          this.lastSquishSoundAt = nowMs;
        }
        if (ptr.dragging && soft.stretchAmount > 0.15 && nowMs - this.lastStretchSoundAt > 140) {
          this.sound.playStretch(clamp01(soft.stretchAmount));
          this.lastStretchSoundAt = nowMs;
        }
        // Soft press → happy; ear yank → annoyed; hard → leave to expression ladder.
        if (isEarRegion(ptr.region) || soft.earGrabSide !== 0) {
          if (soft.stretchAmount > 0.12 || soft.earStretch.length() > 0.08) {
            this.idle.setMood("annoyed", 1.5);
          }
        } else if (state.squish.pressure < 0.45 && state.squish.pressure > 0.08) {
          this.idle.setMood("happy", 0.7);
        } else if (state.squish.pressure > 0.8) {
          this.idle.setMood("annoyed", 0.8);
        }
        if (state.squish.pressure > 0.7) {
          this.cameraFeedback.punchZoom((state.squish.pressure - 0.7) * 0.2);
        }
        eventBus.emit("squish:update", state.squish);
        eventBus.emit("interaction:update", {
          kind: this.gestureKind,
          pressure: state.squish.pressure,
          stretch: soft.stretchAmount,
          pinch: soft.pinchStrength,
        });
      } else if (hit) {
        state.leanTarget.set(this.pointerNdc.x * 0.12, this.pointerNdc.y * 0.08);
      } else {
        state.leanTarget.set(0, 0);
      }
    });

    const endPointer = (e: PointerEvent) => {
      const ptr = this.pointers.get(e.pointerId);
      if (!ptr) return;
      ptr.isDown = false;
      this.pointers.delete(e.pointerId);
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }

      const remaining = this.getPointerList().filter((p) => p.isDown);

      if (this.wasMultiTouch && remaining.length === 1) {
        // Multi → single: resume press on remaining finger.
        // Keep gestureSawMulti so finish still counts this as a pinch gesture.
        this.wasMultiTouch = false;
        this.pinchComboCounted = false;
        soft.isMultiTouch = false;
        this.primaryId = remaining[0].id;
        this.pressStartTime = performance.now();
        return;
      }

      if (remaining.length > 0) {
        // Still another finger down.
        if (this.primaryId === e.pointerId) this.primaryId = remaining[0].id;
        return;
      }

      this.primaryId = null;
      this.finishGesture(ptr);
    };

    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", () => {
      state.hovering = false;
      if (!state.pressing) state.leanTarget.set(0, 0);
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

  private beginPrimaryPress(now: number): void {
    const state = this.state;
    const wasSleepy = state.sleepy;
    state.pressing = true;
    state.dragging = false;
    // Mild initial target — long hold ramps toward full via pointer pressure.
    state.pressTarget = 0.55;
    if (!this.gestureCounted) {
      state.pressCount += 1;
      this.gestureCounted = true;
    }
    state.pressPeak = 0;
    this.pressStartTime = now;
    state.squish.lastSquishTime = now;
    this.gestureKind = "squeeze";
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
    // Startled if user comes back after a long gap.
    if (state.lastGapMs > 4500 && !wasSleepy) {
      this.idle.setMood("excited", 1.4);
    } else {
      this.idle.setMood("happy", 0.9);
    }
    const pType = state.character.particleType ?? "star";
    this.particles.spawn(this.hitPoint, 0.45, state.color, state.reduceMotion, pType, state.comboLevel);
    eventBus.emit("squish:start", state.squish);
    eventBus.emit("interaction:start", { kind: "squeeze", time: now });
  }

  private enterMultiTouch(now: number): void {
    const state = this.state;
    if (this.wasMultiTouch) return;
    this.wasMultiTouch = true;
    this.pinchComboCounted = true;
    this.gestureKind = "pinch";
    state.pressing = true;
    state.pressTarget = 0.85;
    this.pressStartTime = now;
    this.syncSquishSnapshot(true);
    this.callbacks.setPressingCursor(true);
    this.expressions.setExpression(state, "surprised", 99);
    // One gesture → one combo tick (do not also count the initial squeeze).
    if (!this.gestureCounted) {
      this.gestureCounted = true;
      state.pressCount += 1;
      this.callbacks.onCountChange(state.pressCount);
      const snap = this.combo.registerSquish();
      state.combo = snap.combo;
      state.comboLevel = snap.level;
      this.callbacks.onCombo?.(snap.combo, snap.level);
      if (snap.combo > 1) this.sound.playCombo(snap.combo);
      this.trackRecentPress();
    }
    this.sound.playPinch(0.4);
    eventBus.emit("interaction:start", { kind: "pinch", time: now });
  }

  private applySoftBodyExpressions(): void {
    const soft = this.state.softBody;
    const ear =
      isEarRegion(soft.lockRegion) ||
      soft.earGrabSide !== 0 ||
      isEarRegion(this.state.softBody.lockRegion);
    if (ear && (soft.isPressed || soft.earStretch.length() > 0.05)) {
      const earAmt = Math.max(soft.earStretch.length(), soft.stretchAmount);
      if (earAmt > 0.18) this.expressions.setExpression(this.state, "angry", 99);
      else this.expressions.setExpression(this.state, "pain", 99);
      return;
    }
    if (soft.isStretching) {
      if (soft.stretchAmount > 0.9) this.expressions.setExpression(this.state, "angry", 99);
      else if (soft.stretchAmount > 0.6) this.expressions.setExpression(this.state, "pain", 99);
      else if (soft.stretchAmount > 0.25) this.expressions.setExpression(this.state, "surprised", 99);
      return;
    }
    if (soft.isMultiTouch) {
      if (Math.abs(soft.pinchStrength) > 0.55) {
        this.expressions.setExpression(this.state, "pain", 99);
      } else {
        this.expressions.setExpression(this.state, "surprised", 99);
      }
    }
  }

  private finishGesture(lastPtr: PointerState): void {
    const state = this.state;
    const soft = state.softBody;
    if (!state.pressing && !state.dragging && soft.localPressure < 0.05) return;

    const wasHard = state.pressStrength > 0.45 || soft.localPressure > 0.45;
    const wasDrag = state.dragging || soft.isStretching;
    const wasPinch = this.gestureSawMulti || this.wasMultiTouch || Math.abs(soft.pinchStrength) > 0.1;
    const wasEar = isEarRegion(soft.lockRegion);
    const peak = Math.min(Math.max(state.pressStrength, soft.localPressure, state.pressPeak), 1);
    const holdSec = (performance.now() - this.pressStartTime) / 1000;
    const wasPet = this.petPath > 40 && soft.petStrength > 0.15 && !wasDrag;
    const isBoop =
      !wasDrag &&
      !wasPinch &&
      !wasEar &&
      !wasPet &&
      holdSec < 0.3 &&
      peak < 0.55 &&
      lastPtr.dragging === false;

    // Release velocity from last pointer motion (px/s) — normalize later.
    const releaseSpeed = Math.hypot(this.lastPointerVx, this.lastPointerVy);
    const kind: InteractionKind = wasPinch
      ? "pinch"
      : wasEar && wasDrag
        ? "earPull"
        : wasPet
          ? "drag"
          : wasDrag
            ? "stretch"
            : "squeeze";

    const release = this.softBody.applyRelease(soft, releaseSpeed, isBoop ? peak * 0.35 : peak, state.character);
    this.lastPointerVx = 0;
    this.lastPointerVy = 0;
    this.petPath = 0;
    soft.isPetting = false;

    state.pressing = false;
    state.dragging = false;
    state.pressTarget = 0;
    state.dragTarget.set(0, 0, 0);

    const area = soft.lockRegion !== "unknown" ? soft.lockRegion : state.squish.area;
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

    const comboBoost = 1 + state.comboLevel * 0.35;
    const impulseBoost = 1 + release.impulse * 1.2;

    // Boop: tiny delighted reaction, no heavy release.
    if (isBoop) {
      state.blink = 0;
      state.faceDirty = true;
      state.happyVel += 5.5;
      state.wobbleVel += 1.4;
      this.expressions.setExpression(state, "happy", 0.85);
      this.sound.playBoop();
      this.sound.playRelease(0.25);
      const pType = state.character.particleType ?? "star";
      this.particles.spawn(this.hitPoint, 0.35, state.color, state.reduceMotion, pType, 0);
      this.callbacks.say("啵！");
      this.idle.setMood("happy", 1.0);
    } else {
      state.wobbleVel += (wasHard ? 5 + peak * 7 : 2) * comboBoost * impulseBoost;
    }

    // Post-gesture mood.
    if (isBoop) {
      // already set
    } else if (state.combo >= 12 || state.recentPressTimes.length >= 6) {
      this.idle.setMood("dizzy", 1.6);
    } else if (state.combo >= 5) {
      this.idle.setMood("excited", 1.4);
    } else if (wasEar && wasDrag) {
      this.idle.setMood("annoyed", 1.8);
    } else if (wasPet) {
      this.idle.setMood("happy", 1.2);
    } else if (wasHard) {
      this.idle.setMood("happy", 1.0);
    }

    // Stretch snap-back overshoot into happy bounce.
    if (soft.stretchAmount > 0.35) {
      state.happyVel += soft.stretchAmount * (6 + release.impulse * 10);
    }

    // Fast release → dizzy / shocked. Boop keeps its happy face.
    if (isBoop) {
      // already set
    } else if (release.impulse > 0.55 && peak > 0.4) {
      this.expressions.setExpression(state, "dizzy", 0.9);
    } else {
      this.expressions.setExpression(state, wasHard ? "happy" : "idle", wasHard ? 1.1 : 0.4);
    }

    const pType = state.character.particleType ?? "star";
    if (wasHard || release.energy > 0.35) {
      this.sound.playRelease(Math.max(peak, release.impulse * 0.6));
      if (kind === "stretch" || kind === "earPull") {
        this.sound.playSnap(clamp01(soft.stretchAmount * (0.6 + release.impulse)));
      }
      if (kind === "pinch") {
        this.sound.playPinch(clamp01(Math.abs(soft.pinchStrength)));
      }
      const spawnCount = release.energy > 0.7 ? 3 : 1;
      for (let i = 0; i < spawnCount; i++) {
        this.particles.spawnRelease(this.hitPoint, peak, state.color, state.reduceMotion, pType);
      }
      this.cameraFeedback.punchZoom(-peak * 0.5);
      if (state.comboLevel > 0.25) {
        this.cameraFeedback.shake(state.comboLevel);
      }
      this.callbacks.say(
        wasDrag || wasEar ? state.character.lines.drag : state.character.lines.release,
      );
    } else {
      this.sound.playRelease(peak * 0.5);
      this.callbacks.say(state.character.lines.idle);
    }

    this.syncSquishSnapshot(false);
    state.squish.duration = 0;
    this.callbacks.setPressingCursor(false);

    // One gesture = one stats event (pinch is not two squeezes).
    if (!this.gestureCounted) {
      state.pressCount += 1;
      this.callbacks.onCountChange(state.pressCount);
      this.gestureCounted = true;
    }
    const recordP = Math.max(peak, state.pressPeak, soft.localPressure, 0.2);
    this.callbacks.onSquishRecord?.(Math.min(recordP, 1), area, state.combo, kind);
    this.callbacks.onReleaseRecord?.();
    state.pressPeak = 0;
    this.gestureCounted = false;
    this.wasMultiTouch = false;
    this.gestureSawMulti = false;
    this.pinchComboCounted = false;
    soft.lockRegion = "unknown";

    eventBus.emit("squish:end", { ...state.squish, pressure: peak });
    eventBus.emit("squish:releasedHard", wasHard || release.impulse > 0.4);
    eventBus.emit("interaction:end", {
      kind,
      strength: Math.min(recordP, 1),
      duration: (performance.now() - this.pressStartTime) / 1000,
      region: area,
      releaseImpulse: release.impulse,
      releaseEnergy: release.energy,
      timestamp: Date.now(),
    });
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
