import * as THREE from "three";
import { RADIUS } from "../../core/constants";
import type { GameState } from "../../core/types";
import { clamp, damp } from "../../core/utils";
import type { WalkBounds } from "../../game/walkTypes";

const SPEED = 3.4;
const DRAG_SCALE = 2.8;
const HOP_HZ = 2.4;

/**
 * Walk control.
 * - Keyboard / virtual pad: WASD / arrows
 * - Character grab-drag: hold the slime and drag (mobile-first)
 * No auto-forward — movement is always user-driven.
 */
export class WalkController {
  private keys = new Set<string>();
  private stickX = 0;
  private stickY = 0;
  private dragX = 0;
  private dragY = 0;
  private dragging = false;
  private hopPhase = 0;
  readonly position = new THREE.Vector3(0, 0, 0);
  private facing = Math.PI;
  private targetFacing = Math.PI;
  private velX = 0;
  private velZ = 0;
  enabled = false;

  private canvas: HTMLCanvasElement | null = null;
  private camera: THREE.Camera | null = null;
  private target: THREE.Object3D | null = null;
  private grabProxy: THREE.Mesh | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private downX = 0;
  private downY = 0;

  constructor() {
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  /** Call once with scene refs so grab-drag can raycast the slime. */
  bindCharacter(canvas: HTMLCanvasElement, camera: THREE.Camera, target: THREE.Object3D): void {
    this.canvas = canvas;
    this.camera = camera;
    this.target = target;
    // Slightly larger invisible grab sphere — easier on touch than the deformed mesh.
    if (!this.grabProxy) {
      const geo = new THREE.SphereGeometry(1.55, 10, 8);
      const mat = new THREE.MeshBasicMaterial({ visible: false });
      this.grabProxy = new THREE.Mesh(geo, mat);
      target.add(this.grabProxy);
    }
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
  }

  dispose(): void {
    if (typeof window === "undefined") return;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    }
  }

  private setNdc(e: PointerEvent): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private hitCharacter(): boolean {
    if (!this.camera) return false;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (this.grabProxy && this.raycaster.intersectObject(this.grabProxy, false).length) return true;
    if (this.target && this.raycaster.intersectObject(this.target, false).length) return true;
    return false;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.setNdc(e);
    if (!this.hitCharacter()) return;
    this.dragging = true;
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.dragX = 0;
    this.dragY = 0;
    try {
      this.canvas?.setPointerCapture(e.pointerId);
    } catch {
      /* optional */
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.enabled || !this.dragging) return;
    const dx = e.clientX - this.downX;
    const dy = e.clientY - this.downY;
    // Screen → world (camera looks from +Z toward character):
    //   drag right → +X, drag up → -Z (forward / away from camera)
    this.dragX = clamp(dx / (72 * DRAG_SCALE), -1, 1);
    this.dragY = clamp(dy / (72 * DRAG_SCALE), -1, 1);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    this.dragX = 0;
    this.dragY = 0;
    try {
      this.canvas?.releasePointerCapture(e.pointerId);
    } catch {
      /* optional */
    }
  };

  get isDragging(): boolean {
    return this.dragging;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key;
    const key = k.length === 1 ? k.toLowerCase() : k;
    if (
      key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "w" ||
      key === "a" ||
      key === "s" ||
      key === "d"
    ) {
      this.keys.add(key);
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
    this.dragging = false;
    this.dragX = 0;
    this.dragY = 0;
  };

  setStick(x: number, y: number): void {
    this.stickX = clamp(x, -1, 1);
    this.stickY = clamp(y, -1, 1);
  }

  resetToOrigin(): void {
    this.position.set(0, 0, 0);
    this.velX = 0;
    this.velZ = 0;
    this.hopPhase = 0;
    this.facing = Math.PI;
    this.targetFacing = Math.PI;
    this.dragging = false;
    this.dragX = 0;
    this.dragY = 0;
  }

  update(dt: number, state: GameState, bounds: WalkBounds, groundY: number): void {
    if (!this.enabled) return;

    let ix = 0;
    let iz = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("a")) ix -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("d")) ix += 1;
    if (this.keys.has("ArrowUp") || this.keys.has("w")) iz -= 1;
    if (this.keys.has("ArrowDown") || this.keys.has("s")) iz += 1;
    ix += this.stickX + this.dragX;
    iz += this.stickY + this.dragY;

    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }

    this.velX = damp(this.velX, ix * SPEED, 12, dt);
    this.velZ = damp(this.velZ, iz * SPEED, 12, dt);

    this.position.x = clamp(this.position.x + this.velX * dt, bounds.minX, bounds.maxX);
    this.position.z = clamp(this.position.z + this.velZ * dt, bounds.minZ, bounds.maxZ);
    this.position.y = groundY;

    const speed = Math.hypot(this.velX, this.velZ);
    if (speed > 0.15) {
      this.targetFacing = Math.atan2(this.velX, this.velZ);
    }
    let d = this.targetFacing - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * (1 - Math.exp(-10 * dt));

    if (speed > 0.3 && !state.reduceMotion) {
      this.hopPhase += dt * HOP_HZ * (0.7 + speed / SPEED);
      const bounce = Math.abs(Math.sin(this.hopPhase * Math.PI));
      state.happyVel += bounce * 0.12;
      if (Math.sin(this.hopPhase * Math.PI * 2) > 0.92) {
        state.squashVel += 1.0;
        state.wobbleVel += 0.5;
      }
    }

    state.leanTarget.x = clamp(this.velX * 0.05, -0.14, 0.14);
    state.leanTarget.y = clamp(-this.velZ * 0.02, -0.08, 0.08);
  }

  applyToMesh(slime: THREE.Object3D): void {
    if (!this.enabled) return;
    slime.position.x = this.position.x;
    slime.position.y = this.position.y + RADIUS;
    slime.position.z = this.position.z;
    slime.rotation.y = this.facing;
  }

  getSpeed(): number {
    return Math.hypot(this.velX, this.velZ);
  }
}
