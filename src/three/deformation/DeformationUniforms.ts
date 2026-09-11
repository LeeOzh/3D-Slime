import * as THREE from "three";
import type { GameState } from "../../core/types";
import { PRESSURE_REGIONS, REGION_DIRS } from "../../core/softBody";

/** Uniform block shared by the slime vertex program. */
export interface SlimeUniforms {
  uTime: { value: number };
  uSquash: { value: number };
  uSxz: { value: number };
  uSy: { value: number };
  uWobble: { value: number };
  uIdleAmp: { value: number };
  uHappyBounce: { value: number };
  uBounce: { value: number };
  uPressPoint: { value: THREE.Vector3 };
  uPress: { value: number };
  uDentDepth: { value: number };
  uDentRadius: { value: number };
  uStretch: { value: THREE.Vector3 };
  uStretchAmount: { value: number };
  uStretchLegacy: { value: THREE.Vector3 };
  uStretchLegacyLen: { value: number };
  uDragging: { value: number };
  uScale: { value: THREE.Vector3 };
  uSideComp: { value: number };
  uReleaseEnergy: { value: number };
  uPetStrength: { value: number };
  uPetWave: { value: number };
  uPetCenter: { value: THREE.Vector3 };
  uEarLag: { value: THREE.Vector2 };
  uHeadLag: { value: THREE.Vector2 };
  uEarStretch: { value: THREE.Vector2 };
  uEarGrabSide: { value: number };
  uLockEar: { value: number };
  uLockSide: { value: number };
  uLean: { value: THREE.Vector2 };
  uSleepy: { value: number };
  uReduceMotion: { value: number };
  uWantNoise: { value: number };
  /** xyz = region dir, w = pressure */
  uPressure: { value: THREE.Vector4[] };
}

export function createSlimeUniforms(): SlimeUniforms {
  const pressure: THREE.Vector4[] = [];
  for (let i = 0; i < 7; i++) pressure.push(new THREE.Vector4(0, 0, 0, 0));
  return {
    uTime: { value: 0 },
    uSquash: { value: 0 },
    uSxz: { value: 1 },
    uSy: { value: 1 },
    uWobble: { value: 0 },
    uIdleAmp: { value: 0 },
    uHappyBounce: { value: 0 },
    uBounce: { value: 1 },
    uPressPoint: { value: new THREE.Vector3(0, 1, 0) },
    uPress: { value: 0 },
    uDentDepth: { value: 0.55 },
    uDentRadius: { value: 0.95 },
    uStretch: { value: new THREE.Vector3() },
    uStretchAmount: { value: 0 },
    uStretchLegacy: { value: new THREE.Vector3() },
    uStretchLegacyLen: { value: 0 },
    uDragging: { value: 0 },
    uScale: { value: new THREE.Vector3(1, 1, 1) },
    uSideComp: { value: 0 },
    uReleaseEnergy: { value: 0 },
    uPetStrength: { value: 0 },
    uPetWave: { value: 0 },
    uPetCenter: { value: new THREE.Vector3(0, 1, 0) },
    uEarLag: { value: new THREE.Vector2() },
    uHeadLag: { value: new THREE.Vector2() },
    uEarStretch: { value: new THREE.Vector2() },
    uEarGrabSide: { value: 0 },
    uLockEar: { value: 0 },
    uLockSide: { value: 0 },
    uLean: { value: new THREE.Vector2() },
    uSleepy: { value: 0 },
    uReduceMotion: { value: 0 },
    uWantNoise: { value: 0 },
    uPressure: { value: pressure },
  };
}

export function syncSlimeUniforms(
  u: SlimeUniforms,
  state: GameState,
  time: number,
  pressPointLocal: THREE.Vector3,
): void {
  const pers = state.character.personality;
  const soft = state.softBody;
  const softActive = soft.isPressed || soft.squash > 0.02;
  const squash = softActive
    ? Math.max(soft.squash * 0.75, state.squash * 0.35)
    : Math.max(state.squash * 0.7, soft.squash * 0.45);
  const squashVis = squash * 0.55;
  const sxz = 1 + squashVis * 0.55;
  const sy = 1 - squashVis * 0.72;
  const stretch = state.stretch;
  const wob = Math.abs(state.wobble) * 0.045 * pers.jiggle + Math.abs(state.happyBounce) * 0.03;
  const idleAmp = state.reduceMotion ? 0 : 0.008 * pers.breath * (state.breathBoost || 1);
  const press = state.pressing
    ? Math.max(state.squish.pressure || 0, soft.localPressure || 0, state.pressStrength)
    : Math.max(state.pressStrength, soft.localPressure);
  const wantNoise =
    !state.reduceMotion && (idleAmp > 0.005 || wob > 0.02 || press > 0.05 || !isCoarseMobile());

  u.uTime.value = time;
  u.uSquash.value = squash;
  u.uSxz.value = sxz;
  u.uSy.value = sy;
  u.uWobble.value = wob;
  u.uIdleAmp.value = idleAmp;
  u.uHappyBounce.value = state.happyBounce;
  u.uBounce.value = pers.bounce ?? 1;
  u.uPressPoint.value.copy(pressPointLocal);
  u.uPress.value = press;
  u.uDentDepth.value = 0.55 * (pers.squishStrength ?? 1);
  u.uDentRadius.value = 0.95;
  u.uStretch.value.copy(soft.stretch);
  u.uStretchAmount.value = soft.stretchAmount;
  u.uStretchLegacy.value.copy(stretch);
  u.uStretchLegacyLen.value = stretch.length();
  u.uDragging.value = state.dragging ? 1 : 0;
  u.uScale.value.copy(soft.scale);
  u.uSideComp.value = state.sideComp;
  u.uReleaseEnergy.value = soft.releaseEnergy;
  u.uPetStrength.value = soft.petStrength;
  u.uPetWave.value = soft.petWave;
  u.uPetCenter.value.copy(soft.petCenter);
  u.uEarLag.value.copy(state.earLag);
  u.uHeadLag.value.copy(state.headLag);
  u.uEarStretch.value.copy(soft.earStretch);
  u.uEarGrabSide.value = soft.earGrabSide;
  u.uLockEar.value =
    soft.lockRegion === "left-ear" ? -1 : soft.lockRegion === "right-ear" ? 1 : 0;
  const lock = soft.lockRegion;
  u.uLockSide.value =
    lock === "left-cheek" || lock === "left-ear"
      ? -1
      : lock === "right-cheek" || lock === "right-ear"
        ? 1
        : 0;
  u.uLean.value.copy(state.lean);
  u.uSleepy.value = state.sleepy && !state.pressing ? 1 : 0;
  u.uReduceMotion.value = state.reduceMotion ? 1 : 0;
  u.uWantNoise.value = wantNoise ? 1 : 0;

  for (let i = 0; i < 7; i++) {
    const key = PRESSURE_REGIONS[i];
    const p = soft.pressureField[key];
    const d = REGION_DIRS[key];
    u.uPressure.value[i].set(d.x, d.y, d.z, p);
  }
}

function isCoarseMobile(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "")
  );
}
