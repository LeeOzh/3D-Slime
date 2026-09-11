import * as THREE from "three";
import { RADIUS } from "../core/constants";
import { PERF } from "../core/perf";
import type { GameState } from "../core/types";
import { PRESSURE_REGIONS, REGION_DIRS } from "../core/softBody";
import { clamp, smoothstep } from "../core/utils";
import type { CharacterManager } from "./CharacterManager";
import { attachSlimeDeform, type SlimeMaterial } from "./material/SlimeMaterial";
import { syncSlimeUniforms } from "./deformation/DeformationUniforms";

const _v = new THREE.Vector3();
const _towardCam = new THREE.Vector3();

/** Active pressure regions for the current frame. */
const MAX_ACTIVE = 7;
const activeDirX = new Float32Array(MAX_ACTIVE);
const activeDirY = new Float32Array(MAX_ACTIVE);
const activeDirZ = new Float32Array(MAX_ACTIVE);
const activeP = new Float32Array(MAX_ACTIVE);
let activeCount = 0;

function rebuildActiveRegions(field: Record<(typeof PRESSURE_REGIONS)[number], number>): void {
  activeCount = 0;
  for (let i = 0; i < PRESSURE_REGIONS.length; i++) {
    const key = PRESSURE_REGIONS[i];
    const p = field[key];
    if (p < 0.02) continue;
    const d = REGION_DIRS[key];
    activeDirX[activeCount] = d.x;
    activeDirY[activeCount] = d.y;
    activeDirZ[activeCount] = d.z;
    activeP[activeCount] = p;
    activeCount++;
  }
}

function pseudoNoise(x: number, y: number, z: number, t: number): number {
  return Math.sin(x * 2.7 + t * 1.3) * Math.cos(y * 3.1 - t * 0.9) * Math.sin(z * 2.4 + t * 0.7);
}

/** Per-frame constants shared by every vertex (P0). */
interface DeformFrame {
  time: number;
  sxz: number;
  sy: number;
  wob: number;
  idleAmp: number;
  press: number;
  dentDepth: number;
  dentRadius: number;
  scale: THREE.Vector3;
  stretchX: number;
  stretchY: number;
  stretchZ: number;
  stretchLen: number;
  softStretchAmount: number;
  softStretchX: number;
  softStretchY: number;
  sideComp: number;
  releaseEnergy: number;
  petStrength: number;
  petWave: number;
  petCenter: THREE.Vector3;
  earLagX: number;
  earLagY: number;
  headLagX: number;
  headLagY: number;
  earStretchX: number;
  earStretchY: number;
  earGrabSide: number;
  lockSide: number;
  lockEar: number;
  lockTop: boolean;
  lockBelly: boolean;
  leanX: number;
  leanY: number;
  happyBounce: number;
  bounce: number;
  dragging: boolean;
  sleepy: boolean;
  reduceMotion: boolean;
  wantNoise: boolean;
  pressX: number;
  pressY: number;
  pressZ: number;
}

function buildFrame(state: GameState, time: number): DeformFrame {
  const pers = state.character.personality;
  const soft = state.softBody;
  const softActive = soft.isPressed || soft.squash > 0.02;
  const squash = softActive
    ? Math.max(soft.squash * 0.75, state.squash * 0.35)
    : Math.max(state.squash * 0.7, soft.squash * 0.45);
  const squashVis = squash * 0.55;
  const stretch = state.stretch;
  const wob = Math.abs(state.wobble) * 0.045 * pers.jiggle + Math.abs(state.happyBounce) * 0.03;
  const idleAmp = state.reduceMotion ? 0 : 0.008 * pers.breath * (state.breathBoost || 1);
  const press = state.pressing
    ? Math.max(state.squish.pressure || 0, soft.localPressure || 0, state.pressStrength)
    : Math.max(state.pressStrength, soft.localPressure);
  const lock = soft.lockRegion;
  const lockSide =
    lock === "left-cheek" || lock === "left-ear"
      ? -1
      : lock === "right-cheek" || lock === "right-ear"
        ? 1
        : 0;
  const lockEar = lock === "left-ear" ? -1 : lock === "right-ear" ? 1 : 0;
  return {
    time,
    sxz: 1 + squashVis * 0.55,
    sy: 1 - squashVis * 0.72,
    wob,
    idleAmp,
    press,
    dentDepth: 0.55 * (pers.squishStrength ?? 1),
    dentRadius: 0.95,
    scale: soft.scale,
    stretchX: stretch.x,
    stretchY: stretch.y,
    stretchZ: stretch.z,
    stretchLen: stretch.length(),
    softStretchAmount: soft.stretchAmount,
    softStretchX: soft.stretch.x,
    softStretchY: soft.stretch.y,
    sideComp: state.sideComp,
    releaseEnergy: soft.releaseEnergy,
    petStrength: soft.petStrength,
    petWave: soft.petWave,
    petCenter: soft.petCenter,
    earLagX: state.earLag.x,
    earLagY: state.earLag.y,
    headLagX: state.headLag.x,
    headLagY: state.headLag.y,
    earStretchX: soft.earStretch.x,
    earStretchY: soft.earStretch.y,
    earGrabSide: soft.earGrabSide,
    lockSide,
    lockEar,
    lockTop: lock === "top",
    lockBelly: lock === "belly",
    leanX: state.lean.x,
    leanY: state.lean.y,
    happyBounce: state.happyBounce,
    bounce: pers.bounce ?? 1,
    dragging: state.dragging,
    sleepy: state.sleepy && !state.pressing,
    reduceMotion: state.reduceMotion,
    wantNoise:
      !state.reduceMotion &&
      (!PERF.isMobile || idleAmp > 0.005 || wob > 0.02 || press > 0.05),
    pressX: 0,
    pressY: 0,
    pressZ: 0,
  };
}

/**
 * Soft-body deformation.
 * P0: FrameContext + restDir (no per-vertex frame math).
 * P2: optional GPU path (`?gpuDeform=0` falls back to CPU).
 */
export class DeformationSystem {
  readonly pressPointLocal = new THREE.Vector3(0, 1, 0);
  readonly dragDir = new THREE.Vector2();
  private normalSkip = 0;
  private slimeMat: SlimeMaterial | null = null;
  private gpuEnabled = true;
  private frame: DeformFrame | null = null;

  constructor() {
    const q = new URLSearchParams(window.location.search);
    this.gpuEnabled = q.get("gpuDeform") !== "0";
  }

  /** Attach GPU deform to the main slime material (once). */
  ensureGpuMaterial(characters: CharacterManager): void {
    if (!this.gpuEnabled || this.slimeMat) return;
    this.slimeMat = attachSlimeDeform(characters.material);
  }

  get isGpu(): boolean {
    return this.gpuEnabled && this.slimeMat !== null;
  }

  /** CPU vertex deform using cached rest direction + frame constants. */
  private deformVertex(
    rx: number,
    ry: number,
    rz: number,
    nx: number,
    ny: number,
    nz: number,
    f: DeformFrame,
    out: THREE.Vector3,
  ): void {
    let x = rx;
    let y = ry;
    let z = rz;

    if (!f.reduceMotion) {
      if (f.wantNoise) {
        const breath = 1 + Math.sin(f.time * 1.6 + y * 1.8) * f.idleAmp;
        const ripple = pseudoNoise(nx * 1.6, ny * 1.6, nz * 1.6, f.time * 0.7) * (0.01 + f.wob * 0.7);
        x = x * breath + nx * ripple * RADIUS;
        y = y * breath + ny * ripple * RADIUS;
        z = z * breath + nz * ripple * RADIUS;
      } else if (f.idleAmp > 0) {
        const breath = 1 + Math.sin(f.time * 1.6 + y * 1.8) * f.idleAmp;
        x *= breath;
        y *= breath;
        z *= breath;
      }
    }

    x *= f.scale.x * f.sxz;
    y *= f.scale.y * f.sy;
    z *= f.scale.z * f.sxz;
    y += f.happyBounce * 0.12 * f.bounce * (0.55 + ny * 0.45);

    if (activeCount > 0 && !f.reduceMotion) {
      for (let ri = 0; ri < activeCount; ri++) {
        const p = activeP[ri];
        const dxr = nx - activeDirX[ri];
        const dyr = ny - activeDirY[ri];
        const dzr = nz - activeDirZ[ri];
        const dist = Math.sqrt(dxr * dxr + dyr * dyr + dzr * dzr);
        if (dist < f.dentRadius) {
          const infl = smoothstep(f.dentRadius, 0, dist) * p * f.dentDepth * 0.9;
          x -= nx * infl;
          y -= ny * infl;
          z -= nz * infl;
        }
        if (dist < f.dentRadius * 1.7) {
          const mid = f.dentRadius * 1.25;
          const band = 1 - smoothstep(0, f.dentRadius * 0.55, Math.abs(dist - mid));
          if (band > 0) {
            const infl = band * p * 0.09;
            x += nx * infl;
            y += ny * infl;
            z += nz * infl;
          }
        }
      }
    }

    if (f.press > 0.01) {
      const dx = nx - f.pressX;
      const dy = ny - f.pressY;
      const dz = nz - f.pressZ;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (activeCount === 0) {
        if (dist < f.dentRadius) {
          const infl = smoothstep(f.dentRadius, 0, dist) * f.press * f.dentDepth;
          x -= nx * infl;
          y -= ny * infl;
          z -= nz * infl;
        }
        if (dist < f.dentRadius * 1.8) {
          const mid = f.dentRadius * 1.3;
          const band = 1 - smoothstep(0, f.dentRadius * 0.55, Math.abs(dist - mid));
          if (band > 0) x += nx * (band * f.press * 0.08);
          if (band > 0) y += ny * (band * f.press * 0.08);
          if (band > 0) z += nz * (band * f.press * 0.08);
        }
      } else if (dist < f.dentRadius) {
        const infl = smoothstep(f.dentRadius, 0, dist) * f.press * f.dentDepth * 0.35;
        x -= nx * infl;
        y -= ny * infl;
        z -= nz * infl;
      }
    }

    if (f.softStretchAmount > 0.01) {
      let influence = 0.55 + ny * 0.35;
      if (f.lockSide < 0) influence *= clamp(0.55 - nx * 0.9, 0.15, 1.2);
      else if (f.lockSide > 0) influence *= clamp(0.55 + nx * 0.9, 0.15, 1.2);
      else if (f.lockTop) influence *= smoothstep(-0.2, 0.9, ny);
      else if (f.lockBelly) influence *= smoothstep(0.3, -0.7, ny);
      x += f.softStretchX * influence * 0.85;
      y += f.softStretchY * influence * 0.85;
      if (f.lockSide < 0) x += f.softStretchX * 0.12 * clamp(nx, 0, 1);
      if (f.lockSide > 0) x += f.softStretchX * 0.12 * clamp(-nx, 0, 1);
    }

    if (f.dragging && f.stretchLen > 0.002 && f.softStretchAmount < 0.05 && f.press > 0.01) {
      const dx = nx - f.pressX;
      const dy = ny - f.pressY;
      const dz = nz - f.pressZ;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const rub = smoothstep(f.dentRadius, 0, dist) * f.press * 0.35;
      x += f.stretchX * rub;
      y += f.stretchY * rub;
    }

    if (Math.abs(f.sideComp) > 0.002) {
      const face = Math.max(0, nz) * (1 - Math.abs(ny) * 0.5);
      x += f.sideComp * 0.06 * face * nx;
      z += f.sideComp * 0.02 * face * Math.abs(nx);
    }

    if (f.releaseEnergy > 0.02) {
      const pulse = f.releaseEnergy * 0.045 * (0.4 + Math.abs(ny) * 0.3 + Math.abs(nx) * 0.2);
      x += nx * pulse;
      y += ny * pulse;
      z += nz * pulse;
    }

    if (f.petStrength > 0.02 && f.petWave > 0.01) {
      const dx = nx - f.petCenter.x;
      const dy = ny - f.petCenter.y;
      const dz = nz - f.petCenter.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const ringR = 0.15 + f.petWave * 0.85;
      const band = 1 - smoothstep(0, 0.28, Math.abs(dist - ringR));
      if (band > 0) {
        const infl = band * f.petStrength * 0.05;
        x += nx * infl;
        y += ny * infl;
        z += nz * infl;
      }
    }

    if (!f.reduceMotion && (Math.abs(f.earLagX) > 0.001 || Math.abs(f.earLagY) > 0.001)) {
      const earWeight = smoothstep(0.25, 0.85, ny) * (0.3 + Math.abs(nx));
      x += f.earLagX * 0.09 * earWeight;
      y += f.earLagY * 0.05 * earWeight;
    }

    if (Math.abs(f.earStretchX) > 0.005 || Math.abs(f.earStretchY) > 0.005) {
      const side = f.lockEar !== 0 ? f.lockEar : f.earGrabSide;
      if (side !== 0) {
        const sideMask = side < 0 ? clamp(-nx, 0, 1) : clamp(nx, 0, 1);
        const earW = smoothstep(0.15, 0.92, ny) * sideMask;
        x += f.earStretchX * 0.95 * earW;
        y += f.earStretchY * 0.7 * earW;
        const tip = earW * earW;
        x += f.earStretchX * 0.25 * tip;
        y += f.earStretchY * 0.2 * tip;
        const other = side < 0 ? clamp(nx, 0, 1) : clamp(-nx, 0, 1);
        const otherW = smoothstep(0.2, 0.9, ny) * other;
        x += f.earStretchX * 0.08 * otherW;
      }
    } else if (f.softStretchAmount > 0.05 && f.lockEar !== 0) {
      const earW =
        smoothstep(0.2, 0.9, ny) * (f.lockEar < 0 ? clamp(-nx, 0, 1) : clamp(nx, 0, 1));
      x += f.softStretchX * 0.7 * earW;
      y += f.softStretchY * 0.45 * earW;
    }

    if (!f.reduceMotion && (Math.abs(f.headLagX) > 0.001 || Math.abs(f.headLagY) > 0.001)) {
      const headWeight = smoothstep(0.3, 0.95, ny);
      x += f.headLagX * 0.06 * headWeight;
      y += f.headLagY * 0.05 * headWeight;
    }

    if (f.stretchLen > 0.001 && f.softStretchAmount < 0.05) {
      const influence = 0.55 + ny * 0.35;
      x += f.stretchX * influence;
      y += f.stretchY * influence;
      z += f.stretchZ * influence;
      y -= f.stretchY * 0.15 * (1 - ny);
    }

    x += f.leanX * (0.35 + ny * 0.2);
    y += f.leanY * 0.35;

    if (f.sleepy) {
      const headW = smoothstep(0.1, 0.9, ny);
      y -= 0.06 * headW;
      x *= 1 - 0.02 * headW;
    }

    out.set(x, y, z);
  }

  /** Public helper for extras (cap / ring / bun / face). */
  deformPoint(
    rx: number,
    ry: number,
    rz: number,
    time: number,
    state: GameState,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    const rl = Math.hypot(rx, ry, rz) || 1;
    const f = this.frame ?? buildFrame(state, time);
    f.pressX = this.pressPointLocal.x;
    f.pressY = this.pressPointLocal.y;
    f.pressZ = this.pressPointLocal.z;
    this.deformVertex(rx, ry, rz, rx / rl, ry / rl, rz / rl, f, out);
    return out;
  }

  update(
    characters: CharacterManager,
    state: GameState,
    time: number,
    camera: THREE.Camera,
  ): void {
    this.ensureGpuMaterial(characters);
    rebuildActiveRegions(state.softBody.pressureField);

    const frame = buildFrame(state, time);
    frame.pressX = this.pressPointLocal.x;
    frame.pressY = this.pressPointLocal.y;
    frame.pressZ = this.pressPointLocal.z;
    this.frame = frame;

    if (this.isGpu && this.slimeMat) {
      // GPU: only write uniforms; rest positions/normals stay static.
      syncSlimeUniforms(this.slimeMat.uniforms, state, time, this.pressPointLocal);
    } else {
      const posAttr = characters.positionAttr;
      const arr = posAttr.array as Float32Array;
      const restShaped = characters.restShaped;
      const restDir = characters.restDir;
      const vertexCount = characters.vertexCount;

      for (let i = 0; i < vertexCount; i++) {
        const i3 = i * 3;
        this.deformVertex(
          restShaped[i3],
          restShaped[i3 + 1],
          restShaped[i3 + 2],
          restDir[i3],
          restDir[i3 + 1],
          restDir[i3 + 2],
          frame,
          _v,
        );
        arr[i3] = _v.x;
        arr[i3 + 1] = _v.y;
        arr[i3 + 2] = _v.z;
      }
      posAttr.needsUpdate = true;

      const softLive =
        state.pressing ||
        Math.abs(state.wobble) > 0.02 ||
        Math.abs(state.happyBounce) > 0.02 ||
        state.softBody.stretchAmount > 0.02 ||
        Math.abs(state.softBody.releaseEnergy) > 0.03 ||
        Math.abs(state.softBody.pinchStrength) > 0.03 ||
        state.softBody.petWave > 0.02 ||
        activeCount > 0;

      if (softLive) {
        characters.geometry.computeVertexNormals();
      } else if (this.normalSkip <= 0) {
        characters.geometry.computeVertexNormals();
        this.normalSkip = PERF.idleNormalEvery;
      } else {
        this.normalSkip -= 1;
      }
    }

    const shape = state.character.shape;
    const soft = state.softBody;
    const softActive = soft.isPressed || soft.squash > 0.02;
    const squash = softActive
      ? Math.max(soft.squash * 0.75, state.squash * 0.35)
      : Math.max(state.squash * 0.7, soft.squash * 0.45);

    if (characters.caramelCap.visible) {
      const topS = characters.shapeRadius(0, 1, 0, shape);
      const topRestY = RADIUS * topS * 0.9;
      this.deformPoint(0, topRestY, 0, time, state, _v);
      _v.y -= RADIUS * 0.42;
      characters.slime.updateMatrixWorld();
      characters.caramelCap.position.copy(_v).applyMatrix4(characters.slime.matrixWorld);
      characters.caramelCap.quaternion.copy(characters.slime.quaternion);
      const capSx = (0.95 + squash * 0.35) * (0.85 + topS * 0.2);
      characters.caramelCap.scale.set(capSx, (1 - squash * 0.55) * 0.85, capSx);
    }

    if (characters.qiankunRing.visible) {
      this.deformPoint(0, -RADIUS * 0.15, 0, time, state, _v);
      characters.slime.updateMatrixWorld();
      characters.qiankunRing.position.copy(_v).applyMatrix4(characters.slime.matrixWorld);
      characters.qiankunRing.quaternion.copy(characters.slime.quaternion);
      characters.qiankunRing.rotateX(Math.PI / 2);
      const rs = 1 + squash * 0.25;
      characters.qiankunRing.scale.set(rs, rs, 1 - squash * 0.4);
    }

    if (characters.bunL.visible) {
      characters.slime.updateMatrixWorld();
      const bunRestY = RADIUS * 1.08;
      const bunRestX = RADIUS * 0.48;
      const elx = state.earLag.x;
      const esx = soft.earStretch.x;
      const esy = soft.earStretch.y;
      const grabL = soft.lockRegion === "left-ear" || soft.earGrabSide < 0;
      const grabR = soft.lockRegion === "right-ear" || soft.earGrabSide > 0;
      const offLx = elx * 0.04 + (grabL ? esx * 0.18 : esx * 0.04);
      const offLy = grabL ? esy * 0.12 : 0;
      const offRx = elx * 0.04 + (grabR ? esx * 0.18 : esx * 0.04);
      const offRy = grabR ? esy * 0.12 : 0;
      this.deformPoint(-bunRestX + offLx, bunRestY + offLy, 0, time, state, _v);
      characters.bunL.position.copy(_v).applyMatrix4(characters.slime.matrixWorld);
      this.deformPoint(bunRestX + offRx, bunRestY + offRy, 0, time, state, _v);
      characters.bunR.position.copy(_v).applyMatrix4(characters.slime.matrixWorld);
      const bs = 1 - squash * 0.4;
      const swing = 1 + Math.abs(elx) * 0.08;
      const stretchL = grabL ? Math.hypot(esx, esy) : 0;
      const stretchR = grabR ? Math.hypot(esx, esy) : 0;
      characters.bunL.scale.set(
        (1 + squash * 0.25 + stretchL * 0.35) * swing,
        bs * (1 - stretchL * 0.12),
        1 + squash * 0.25,
      );
      characters.bunR.scale.set(
        (1 + squash * 0.25 + stretchR * 0.35) * swing,
        bs * (1 - stretchR * 0.12),
        1 + squash * 0.25,
      );
      characters.bunL.rotation.set(0, 0, grabL ? soft.earTilt : state.earLag.x * 0.04);
      characters.bunR.rotation.set(0, 0, grabR ? soft.earTilt : -state.earLag.x * 0.04);
    }

    const faceS = characters.shapeRadius(0, 0.15, 1, shape);
    const faceRestY = 0.14 * RADIUS * faceS;
    const faceRestZ = RADIUS * faceS * 0.92;
    this.deformPoint(0, faceRestY, faceRestZ, time, state, _v);
    state.faceCenter.copy(_v);
    characters.faceMesh.position.copy(_v);
    const fs = 1 - squash * 0.35;
    characters.faceMesh.scale.set(
      1 + squash * 0.4 + Math.abs(state.stretch.x) * 0.3 + Math.abs(soft.stretch.x) * 0.25,
      fs + Math.abs(state.stretch.y) * 0.35 + Math.abs(soft.stretch.y) * 0.25,
      1,
    );
    characters.faceMesh.lookAt(camera.position);
    _towardCam.subVectors(camera.position, characters.faceMesh.position).normalize();
    characters.faceMesh.position.addScaledVector(_towardCam, 0.04);
  }
}
