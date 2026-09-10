import * as THREE from "three";
import { RADIUS } from "../core/constants";
import type { GameState } from "../core/types";
import { smoothstep } from "../core/utils";
import type { CharacterManager } from "./CharacterManager";

const _v = new THREE.Vector3();
const _towardCam = new THREE.Vector3();

function pseudoNoise(x: number, y: number, z: number, t: number): number {
  return Math.sin(x * 2.7 + t * 1.3) * Math.cos(y * 3.1 - t * 0.9) * Math.sin(z * 2.4 + t * 0.7);
}

/**
 * Local soft-body vertex deformation.
 *
 * P0 upgrades over V1:
 * - smoothstep falloff (softer rim, no sharp dent edge)
 * - lateral "rub" offset along drag direction
 * - secondary motion: ear lag, head lag, opposite-side compensation
 */
export class DeformationSystem {
  readonly pressPointLocal = new THREE.Vector3(0, 1, 0);
  /** Drag direction in local X/Y used for lateral rub. */
  readonly dragDir = new THREE.Vector2();

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
    const squash = state.squash;
    const sxz = 1 + squash * 0.62;
    const sy = 1 - squash * 0.88;
    const stretch = state.stretch;
    const stretchLen = stretch.length();
    const wob = Math.abs(state.wobble) * 0.045 * pers.jiggle + Math.abs(state.happyBounce) * 0.03;
    const idleAmp = state.reduceMotion ? 0 : 0.008 * pers.breath;
    // Unified pressure — prefer SquishState, fall back to spring value.
    const press = state.pressing ? state.squish.pressure || state.pressStrength : state.pressStrength;
    const dentRadius = 0.9;
    const dentDepth = 0.55 * (pers.squishStrength ?? 1);
    const pp = this.pressPointLocal;

    if (!state.reduceMotion) {
      const breath = 1 + Math.sin(time * 1.6 + y * 1.8) * idleAmp;
      const ripple = pseudoNoise(nx * 1.6, ny * 1.6, nz * 1.6, time * 0.7) * (0.01 + wob * 0.7);
      x = x * breath + nx * ripple * RADIUS;
      y = y * breath + ny * ripple * RADIUS;
      z = z * breath + nz * ripple * RADIUS;
    }

    x *= sxz;
    y *= sy;
    z *= sxz;
    y += state.happyBounce * 0.12 * pers.bounce * (0.55 + ny * 0.45);

    if (press > 0.01) {
      const dx = nx - pp.x;
      const dy = ny - pp.y;
      const dz = nz - pp.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Smoothstep falloff: 1 at press point → 0 at dentRadius (soft rim).
      if (dist < dentRadius) {
        const infl = smoothstep(dentRadius, 0, dist) * press * dentDepth;
        x -= nx * infl;
        y -= ny * infl;
        z -= nz * infl;
      }

      // Soft outer bulge ring (volume conservation feel).
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

      // Lateral rub: drag direction smears the dent sideways.
      if (state.dragging && stretchLen > 0.002) {
        const rub = smoothstep(dentRadius, 0, dist) * press * 0.35;
        x += stretch.x * rub;
        y += stretch.y * rub;
      }

      // Opposite-side compensation (left press → right cheek puffs out slightly).
      const side = state.sideComp;
      if (Math.abs(side) > 0.002) {
        // side > 0 means left was pressed → bulge +X
        const face = Math.max(0, nz) * (1 - Math.abs(ny) * 0.5);
        x += side * 0.06 * face * nx;
        z += side * 0.02 * face * Math.abs(nx);
      }
    }

    // Secondary: ear lag — high side vertices follow delayed lean.
    const earLag = state.earLag;
    if (!state.reduceMotion && (Math.abs(earLag.x) > 0.001 || Math.abs(earLag.y) > 0.001)) {
      const earWeight = smoothstep(0.25, 0.85, ny) * (0.3 + Math.abs(nx));
      x += earLag.x * 0.09 * earWeight;
      y += earLag.y * 0.05 * earWeight;
    }

    // Secondary: head lag — top vertices delayed follow of lean.
    const headLag = state.headLag;
    if (!state.reduceMotion && (Math.abs(headLag.x) > 0.001 || Math.abs(headLag.y) > 0.001)) {
      const headWeight = smoothstep(0.3, 0.95, ny);
      x += headLag.x * 0.06 * headWeight;
      y += headLag.y * 0.05 * headWeight;
    }

    if (stretchLen > 0.001) {
      const influence = 0.55 + ny * 0.35;
      x += stretch.x * influence;
      y += stretch.y * influence;
      z += stretch.z * influence;
      y -= stretch.y * 0.15 * (1 - ny);
    }

    x += state.lean.x * (0.35 + ny * 0.2);
    y += state.lean.y * 0.35;

    // Sleepy droop — head sinks slightly.
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
    characters.geometry.computeVertexNormals();

    const shape = state.character.shape;

    if (characters.caramelCap.visible) {
      const topS = characters.shapeRadius(0, 1, 0, shape);
      const topRestY = RADIUS * topS * 0.9;
      this.deformPoint(0, topRestY, 0, time, state, _v);
      _v.y -= RADIUS * 0.42;
      characters.slime.updateMatrixWorld();
      characters.caramelCap.position.copy(_v).applyMatrix4(characters.slime.matrixWorld);
      characters.caramelCap.quaternion.copy(characters.slime.quaternion);
      const capSx = (0.95 + state.squash * 0.35) * (0.85 + topS * 0.2);
      characters.caramelCap.scale.set(capSx, (1 - state.squash * 0.55) * 0.85, capSx);
    }

    if (characters.qiankunRing.visible) {
      this.deformPoint(0, -RADIUS * 0.15, 0, time, state, _v);
      characters.slime.updateMatrixWorld();
      characters.qiankunRing.position.copy(_v).applyMatrix4(characters.slime.matrixWorld);
      characters.qiankunRing.quaternion.copy(characters.slime.quaternion);
      characters.qiankunRing.rotateX(Math.PI / 2);
      const rs = 1 + state.squash * 0.25;
      characters.qiankunRing.scale.set(rs, rs, 1 - state.squash * 0.4);
    }

    if (characters.bunL.visible) {
      characters.slime.updateMatrixWorld();
      const bunRestY = RADIUS * 1.08;
      const bunRestX = RADIUS * 0.48;
      // Ears/buns inherit ear lag so they swing after a cheek press.
      const elx = state.earLag.x;
      this.deformPoint(-bunRestX + elx * 0.04, bunRestY, 0, time, state, _v);
      characters.bunL.position.copy(_v).applyMatrix4(characters.slime.matrixWorld);
      this.deformPoint(bunRestX + elx * 0.04, bunRestY, 0, time, state, _v);
      characters.bunR.position.copy(_v).applyMatrix4(characters.slime.matrixWorld);
      const bs = 1 - state.squash * 0.4;
      const swing = 1 + Math.abs(elx) * 0.08;
      characters.bunL.scale.set((1 + state.squash * 0.25) * swing, bs, 1 + state.squash * 0.25);
      characters.bunR.scale.copy(characters.bunL.scale);
    }

    const faceS = characters.shapeRadius(0, 0.15, 1, shape);
    const faceRestY = 0.14 * RADIUS * faceS;
    const faceRestZ = RADIUS * faceS * 0.92;
    this.deformPoint(0, faceRestY, faceRestZ, time, state, _v);
    state.faceCenter.copy(_v);
    characters.faceMesh.position.copy(_v);
    const fs = 1 - state.squash * 0.35;
    characters.faceMesh.scale.set(
      1 + state.squash * 0.4 + Math.abs(state.stretch.x) * 0.3,
      fs + Math.abs(state.stretch.y) * 0.35,
      1,
    );
    characters.faceMesh.lookAt(camera.position);
    _towardCam.subVectors(camera.position, characters.faceMesh.position).normalize();
    characters.faceMesh.position.addScaledVector(_towardCam, 0.04);
  }
}
