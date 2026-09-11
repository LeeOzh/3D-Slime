import * as THREE from "three";
import type { GameState } from "../../core/types";
import { clamp, damp } from "../../core/utils";
import type { WalkBounds } from "../../game/walkTypes";

const SPEED = 3.2;
const HOP_HZ = 2.4;

/**
 * Keyboard / virtual-stick walk controller.
 * Applies world position on the slime root + hop squash via soft-body kick.
 */
export class WalkController {
  private keys = new Set<string>();
  private stickX = 0;
  private stickY = 0;
  private hopPhase = 0;
  readonly position = new THREE.Vector3(0, 0, 0);
  private facing = 0;
  private targetFacing = 0;
  private velX = 0;
  private velZ = 0;
  enabled = false;

  constructor() {
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose(): void {
    if (typeof window === "undefined") return;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight" || k === "w" || k === "a" || k === "s" || k === "d" || k === "W" || k === "A" || k === "S" || k === "D") {
      this.keys.add(k.length === 1 ? k.toLowerCase() : k);
      if (this.enabled) e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key;
    this.keys.delete(k.length === 1 ? k.toLowerCase() : k);
  };

  private onBlur = () => {
    this.keys.clear();
    this.stickX = 0;
    this.stickY = 0;
  };

  setStick(x: number, y: number): void {
    this.stickX = clamp(x, -1, 1);
    this.stickY = clamp(y, -1, 1);
  }

  /** True if any walk key is held (used to enter walk mode). */
  wantsWalk(): boolean {
    return (
      this.keys.has("ArrowUp") ||
      this.keys.has("ArrowDown") ||
      this.keys.has("ArrowLeft") ||
      this.keys.has("ArrowRight") ||
      this.keys.has("w") ||
      this.keys.has("a") ||
      this.keys.has("s") ||
      this.keys.has("d") ||
      Math.abs(this.stickX) > 0.15 ||
      Math.abs(this.stickY) > 0.15
    );
  }

  resetToOrigin(): void {
    this.position.set(0, 0, 0);
    this.velX = 0;
    this.velZ = 0;
    this.hopPhase = 0;
  }

  update(dt: number, state: GameState, bounds: WalkBounds, groundY: number): void {
    if (!this.enabled) return;

    let ix = 0;
    let iz = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("a")) ix -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("d")) ix += 1;
    if (this.keys.has("ArrowUp") || this.keys.has("w")) iz -= 1;
    if (this.keys.has("ArrowDown") || this.keys.has("s")) iz += 1;
    ix += this.stickX;
    iz += this.stickY;
    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }

    const tx = ix * SPEED;
    const tz = iz * SPEED;
    this.velX = damp(this.velX, tx, 12, dt);
    this.velZ = damp(this.velZ, tz, 12, dt);

    this.position.x = clamp(this.position.x + this.velX * dt, bounds.minX, bounds.maxX);
    this.position.z = clamp(this.position.z + this.velZ * dt, bounds.minZ, bounds.maxZ);
    this.position.y = groundY;

    const speed = Math.hypot(this.velX, this.velZ);
    if (speed > 0.2) {
      this.targetFacing = Math.atan2(this.velX, this.velZ);
    }
    // Shortest-path turn
    let d = this.targetFacing - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * (1 - Math.exp(-10 * dt));

    // Hop: each "step" squashes then rebounds.
    if (speed > 0.3 && !state.reduceMotion) {
      this.hopPhase += dt * HOP_HZ * (0.7 + speed / SPEED);
      const bounce = Math.abs(Math.sin(this.hopPhase * Math.PI));
      state.happyVel += bounce * 0.15;
      // Light soft-body squash pulse per step
      if (Math.sin(this.hopPhase * Math.PI * 2) > 0.92) {
        state.squashVel += 1.2;
        state.wobbleVel += 0.6;
      }
    }

    // Face movement lean
    state.leanTarget.x = clamp(this.velX * 0.04, -0.12, 0.12);
    state.leanTarget.y = clamp(-this.velZ * 0.02, -0.08, 0.08);
  }

  applyToMesh(slime: THREE.Object3D): void {
    if (!this.enabled) return;
    slime.position.x = this.position.x;
    slime.position.z = this.position.z;
    slime.rotation.y = this.facing;
  }

  getFacing(): number {
    return this.facing;
  }
}
