import type * as THREE from "three";

/**
 * Subtle camera feedback — zoom on hard press, tiny shake on high combo.
 * Amplitudes are intentionally tiny (no motion sickness).
 */
export class CameraFeedback {
  private zoomOffset = 0;
  private zoomVel = 0;
  private shakeAmp = 0;
  private shakeTime = 0;
  private baseZ = 5.55;
  private reduceMotion = false;

  setBaseZ(z: number): void {
    this.baseZ = z;
  }

  setReduceMotion(v: boolean): void {
    this.reduceMotion = v;
  }

  /** Soft dolly-in while pressing hard. */
  punchZoom(strength: number): void {
    if (this.reduceMotion) return;
    this.zoomVel -= Math.min(strength, 1) * 0.35;
  }

  /** Micro shake — scale with combo level, capped hard. */
  shake(level: number): void {
    if (this.reduceMotion) return;
    this.shakeAmp = Math.min(0.025, 0.008 + level * 0.015);
    this.shakeTime = 0.35;
  }

  update(delta: number, camera: THREE.PerspectiveCamera): void {
    // Spring zoom offset toward 0.
    {
      const acc = -this.zoomOffset * 40 - this.zoomVel * 8;
      this.zoomVel += acc * delta;
      this.zoomOffset += this.zoomVel * delta;
      this.zoomOffset = Math.max(-0.35, Math.min(0.15, this.zoomOffset));
    }

    let sx = 0;
    let sy = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= delta;
      const t = performance.now() / 1000;
      const fade = Math.max(this.shakeTime / 0.35, 0);
      sx = Math.sin(t * 48) * this.shakeAmp * fade;
      sy = Math.cos(t * 39) * this.shakeAmp * fade;
      if (this.shakeTime <= 0) this.shakeAmp = 0;
    }

    camera.position.x = sx;
    camera.position.y = 0.12 + sy;
    camera.position.z = this.baseZ + this.zoomOffset;
  }
}
