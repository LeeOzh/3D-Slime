import * as THREE from "three";
import { RADIUS } from "../core/constants";
import { PERF } from "../core/perf";
import type { GameState } from "../core/types";
import { PRESSURE_REGIONS, REGION_DIRS, type PressureRegion } from "../core/softBody";
import { clamp, smoothstep } from "../core/utils";
import type { CharacterManager } from "./CharacterManager";

const _v = new THREE.Vector3();
const _towardCam = new THREE.Vector3();

/** Active pressure regions for the current frame (avoids 7-way scan per vertex). */
const MAX_ACTIVE = 7;
const activeDirX = new Float32Array(MAX_ACTIVE);
const activeDirY = new Float32Array(MAX_ACTIVE);
const activeDirZ = new Float32Array(MAX_ACTIVE);
const activeP = new Float32Array(MAX_ACTIVE);
let activeCount = 0;

function pseudoNoise(x: number, y: number, z: number, t: number): number {
  return Math.sin(x * 2.7 + t * 1.3) * Math.cos(y * 3.1 - t * 0.9) * Math.sin(z * 2.4 + t * 0.7);
}

function rebuildActiveRegions(field: Record<PressureRegion, number>): void {
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

/**
 * Local soft-body vertex deformation.
 *
 * V3: multi-region pressure field + volume compensation + stretch/pinch
 * applied per-vertex; secondary motion still runs after soft-body dent.
 */
export class DeformationSystem {
  readonly pressPointLocal = new THREE.Vector3(0, 1, 0);
  /** Drag direction in local X/Y used for lateral rub. */
  readonly dragDir = new THREE.Vector2();
  private normalSkip = 0;

  deformPoint(
    rx: number,
    ry: number,
    rz: number,
    time: number,
    state: GameState,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    const rl = Math.hypot(rx, ry, rz) || 1;
    const nx = rx / rl;
    const ny = ry / rl;
    const nz = rz / rl;

    let x = rx;
    let y = ry;
    let z = rz;

    const pers = state.character.personality;
    const soft = state.softBody;
    // Soft-body squash is primary; legacy squash is only a light residual.
    const softActive = soft.isPressed || soft.squash > 0.02;
    const squash = softActive
      ? Math.max(soft.squash * 0.75, state.squash * 0.35)
      : Math.max(state.squash * 0.7, soft.squash * 0.45);
    const squashVis = squash * 0.55;
    const sxz = 1 + squashVis * 0.55;
    const sy = 1 - squashVis * 0.72;
    const stretch = state.stretch;
    const stretchLen = stretch.length();
    const wob = Math.abs(state.wobble) * 0.045 * pers.jiggle + Math.abs(state.happyBounce) * 0.03;
    const idleAmp = state.reduceMotion ? 0 : 0.008 * pers.breath * (state.breathBoost || 1);
    const press = state.pressing
      ? Math.max(state.squish.pressure || 0, soft.localPressure || 0, state.pressStrength)
      : Math.max(state.pressStrength, soft.localPressure);

    // Soft-body local dents rebuilt once per frame (see rebuildActiveRegions).
    // activeCount drives the dent loop below.

    const dentRadius = 0.95;
    const dentDepth = 0.55 * (pers.squishStrength ?? 1);
    const pp = this.pressPointLocal;

    if (!state.reduceMotion) {
      // Skip expensive per-vertex noise on mobile when nearly still.
      const wantNoise = !PERF.isMobile || idleAmp > 0.005 || wob > 0.02 || press > 0.05;
      if (wantNoise) {
        const breath = 1 + Math.sin(time * 1.6 + y * 1.8) * idleAmp;
        const ripple = pseudoNoise(nx * 1.6, ny * 1.6, nz * 1.6, time * 0.7) * (0.01 + wob * 0.7);
        x = x * breath + nx * ripple * RADIUS;
        y = y * breath + ny * ripple * RADIUS;
        z = z * breath + nz * ripple * RADIUS;
      } else if (idleAmp > 0) {
        const breath = 1 + Math.sin(time * 1.6 + y * 1.8) * idleAmp;
        x *= breath;
        y *= breath;
        z *= breath;
      }
    }

    // Soft-body whole scale (pinch / stretch / release wave).
    x *= soft.scale.x * sxz;
    y *= soft.scale.y * sy;
    z *= soft.scale.z * sxz;
    y += state.happyBounce * 0.12 * pers.bounce * (0.55 + ny * 0.45);

    // --- Multi-region pressure field deformation (active regions only) ---
    if (activeCount > 0 && !state.reduceMotion) {
      for (let ri = 0; ri < activeCount; ri++) {
        const p = activeP[ri];
        const dxr = nx - activeDirX[ri];
        const dyr = ny - activeDirY[ri];
        const dzr = nz - activeDirZ[ri];
        const dist = Math.sqrt(dxr * dxr + dyr * dyr + dzr * dzr);
        if (dist < dentRadius) {
          const infl = smoothstep(dentRadius, 0, dist) * p * dentDepth * 0.9;
          x -= nx * infl;
          y -= ny * infl;
          z -= nz * infl;
        }
        // Soft outer bulge (volume feel).
        if (dist < dentRadius * 1.7) {
          const mid = dentRadius * 1.25;
          const band = 1 - smoothstep(0, dentRadius * 0.55, Math.abs(dist - mid));
          if (band > 0) {
            const infl = band * p * 0.09;
            x += nx * infl;
            y += ny * infl;
            z += nz * infl;
          }
        }
      }
    }

    // --- Legacy single-point dent (kept for V2 feel while pressing) ---
    if (press > 0.01 && activeCount === 0) {
      const dx = nx - pp.x;
      const dy = ny - pp.y;
      const dz = nz - pp.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < dentRadius) {
        const infl = smoothstep(dentRadius, 0, dist) * press * dentDepth;
        x -= nx * infl;
        y -= ny * infl;
        z -= nz * infl;
      }
      if (dist < dentRadius * 1.8) {
        const mid = dentRadius * 1.3;
        const band = 1 - smoothstep(0, dentRadius * 0.55, Math.abs(dist - mid));
        if (band > 0) {
          const infl = band * press * 0.08;
          x += nx * infl;
          y += ny * infl;
          z += nz * infl;
        }
      }
    } else if (press > 0.01) {
      // Blend a light global dent on top of field while actively pressing.
      const dx = nx - pp.x;
      const dy = ny - pp.y;
      const dz = nz - pp.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < dentRadius) {
        const infl = smoothstep(dentRadius, 0, dist) * press * dentDepth * 0.35;
        x -= nx * infl;
        y -= ny * infl;
        z -= nz * infl;
      }
    }

    // Soft-body stretch smear along locked region.
    if (soft.stretchAmount > 0.01) {
      const lock = soft.lockRegion;
      let influence = 0.55 + ny * 0.35;
      if (lock === "left-cheek" || lock === "left-ear") {
        influence *= clamp(0.55 - nx * 0.9, 0.15, 1.2);
      } else if (lock === "right-cheek" || lock === "right-ear") {
        influence *= clamp(0.55 + nx * 0.9, 0.15, 1.2);
      } else if (lock === "top") {
        influence *= smoothstep(-0.2, 0.9, ny);
      } else if (lock === "belly") {
        influence *= smoothstep(0.3, -0.7, ny);
      }
      // stretch vector is already magnitude-limited; don't multiply by amount again.
      x += soft.stretch.x * influence * 0.85;
      y += soft.stretch.y * influence * 0.85;
      // Opposite side slightly follows (volume conservation).
      if (lock === "left-cheek" || lock === "left-ear") {
        x += soft.stretch.x * 0.12 * clamp(nx, 0, 1);
      } else if (lock === "right-cheek" || lock === "right-ear") {
        x += soft.stretch.x * 0.12 * clamp(-nx, 0, 1);
      }
    }

    // Legacy lateral rub.
    if (state.dragging && stretchLen > 0.002 && soft.stretchAmount < 0.05) {
      if (press > 0.01) {
        const dx = nx - pp.x;
        const dy = ny - pp.y;
        const dz = nz - pp.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const rub = smoothstep(dentRadius, 0, dist) * press * 0.35;
        x += stretch.x * rub;
        y += stretch.y * rub;
      }
    }

    // Opposite-side compensation (left press → right cheek puffs out slightly).
    const side = state.sideComp;
    if (Math.abs(side) > 0.002) {
      const face = Math.max(0, nz) * (1 - Math.abs(ny) * 0.5);
      x += side * 0.06 * face * nx;
      z += side * 0.02 * face * Math.abs(nx);
    }

    // Release wave: brief radial pulse.
    if (soft.releaseEnergy > 0.02) {
      const pulse = soft.releaseEnergy * 0.045 * (0.4 + Math.abs(ny) * 0.3 + Math.abs(nx) * 0.2);
      x += nx * pulse;
      y += ny * pulse;
      z += nz * pulse;
    }

    // Petting: soft expanding ring from caress point.
    if (soft.petStrength > 0.02 && soft.petWave > 0.01) {
      const pc = soft.petCenter;
      const dx = nx - pc.x;
      const dy = ny - pc.y;
      const dz = nz - pc.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const ringR = 0.15 + soft.petWave * 0.85;
      const band = 1 - smoothstep(0, 0.28, Math.abs(dist - ringR));
      if (band > 0) {
        const infl = band * soft.petStrength * 0.05;
        x += nx * infl;
        y += ny * infl;
        z += nz * infl;
      }
    }

    // Secondary: ear lag.
    const earLag = state.earLag;
    if (!state.reduceMotion && (Math.abs(earLag.x) > 0.001 || Math.abs(earLag.y) > 0.001)) {
      const earWeight = smoothstep(0.25, 0.85, ny) * (0.3 + Math.abs(nx));
      x += earLag.x * 0.09 * earWeight;
      y += earLag.y * 0.05 * earWeight;
    }

    // Ear grab: local stretch is primary (body pose is mild).
    // Geometry ears (cat / nezha bumps) and bun meshes both follow earStretch.
    if (Math.abs(soft.earStretch.x) > 0.005 || Math.abs(soft.earStretch.y) > 0.005) {
      const lock = soft.lockRegion;
      const side = lock === "left-ear" ? -1 : lock === "right-ear" ? 1 : soft.earGrabSide;
      if (side !== 0) {
        const sideMask = side < 0 ? clamp(-nx, 0, 1) : clamp(nx, 0, 1);
        const earW = smoothstep(0.15, 0.92, ny) * sideMask;
        // Stronger local pull so the ear reads as "grabbed".
        x += soft.earStretch.x * 0.95 * earW;
        y += soft.earStretch.y * 0.7 * earW;
        // Slight taper toward tip (feels stretched, not translated).
        const tip = earW * earW;
        x += soft.earStretch.x * 0.25 * tip;
        y += soft.earStretch.y * 0.2 * tip;
        // Opposite ear almost stays (tiny volume follow).
        const other = side < 0 ? clamp(nx, 0, 1) : clamp(-nx, 0, 1);
        const otherW = smoothstep(0.2, 0.9, ny) * other;
        x += soft.earStretch.x * 0.08 * otherW;
      }
    } else if (soft.stretchAmount > 0.05 && (soft.lockRegion === "left-ear" || soft.lockRegion === "right-ear")) {
      // Fallback before earStretch springs catch up.
      const lock = soft.lockRegion;
      if (lock === "left-ear") {
        const earW = smoothstep(0.2, 0.9, ny) * clamp(-nx, 0, 1);
        x += soft.stretch.x * 0.7 * earW;
        y += soft.stretch.y * 0.45 * earW;
      } else if (lock === "right-ear") {
        const earW = smoothstep(0.2, 0.9, ny) * clamp(nx, 0, 1);
        x += soft.stretch.x * 0.7 * earW;
        y += soft.stretch.y * 0.45 * earW;
      }
    }

    // Secondary: head lag.
    const headLag = state.headLag;
    if (!state.reduceMotion && (Math.abs(headLag.x) > 0.001 || Math.abs(headLag.y) > 0.001)) {
      const headWeight = smoothstep(0.3, 0.95, ny);
      x += headLag.x * 0.06 * headWeight;
      y += headLag.y * 0.05 * headWeight;
    }

    if (stretchLen > 0.001 && soft.stretchAmount < 0.05) {
      const influence = 0.55 + ny * 0.35;
      x += stretch.x * influence;
      y += stretch.y * influence;
      z += stretch.z * influence;
      y -= stretch.y * 0.15 * (1 - ny);
    }

    x += state.lean.x * (0.35 + ny * 0.2);
    y += state.lean.y * 0.35;

    if (state.sleepy && !state.pressing) {
      const headW = smoothstep(0.1, 0.9, ny);
      y -= 0.06 * headW;
      x *= 1 - 0.02 * headW;
    }

    out.set(x, y, z);
    return out;
  }

  update(
    characters: CharacterManager,
    state: GameState,
    time: number,
    camera: THREE.Camera,
  ): void {
    rebuildActiveRegions(state.softBody.pressureField);

    const posAttr = characters.positionAttr;
    const arr = posAttr.array as Float32Array;
    const restShaped = characters.restShaped;
    const vertexCount = characters.vertexCount;

    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3;
      this.deformPoint(restShaped[i3], restShaped[i3 + 1], restShaped[i3 + 2], time, state, _v);
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
      // Left bun follows left-side ear grab; right bun follows right.
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
      // Elongate the grabbed bun along pull direction.
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
      // Local ear tilt — independent of body rotation (grabbed, not puppet).
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
