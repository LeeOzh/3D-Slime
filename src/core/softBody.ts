import * as THREE from "three";
import type { SquishArea } from "./types";
import { clamp } from "./utils";

/** Soft-body regions used by the pressure field. */
export type PressureRegion = Exclude<SquishArea, "unknown">;

export const PRESSURE_REGIONS: readonly PressureRegion[] = [
  "left-cheek",
  "right-cheek",
  "top",
  "belly",
  "left-ear",
  "right-ear",
  "mouth",
] as const;

export type InteractionMode = "idle" | "press" | "drag" | "stretch" | "multiTouch";

export type InteractionKind = "squeeze" | "stretch" | "pinch" | "earPull" | "drag";

export type PressureField = Record<PressureRegion, number>;

export function createPressureField(): PressureField {
  return {
    "left-cheek": 0,
    "right-cheek": 0,
    top: 0,
    belly: 0,
    "left-ear": 0,
    "right-ear": 0,
    mouth: 0,
  };
}

export function resetPressureField(field: PressureField): void {
  for (const key of PRESSURE_REGIONS) field[key] = 0;
}

/** Soft-body physical snapshot. Describes body state, not UI. */
export interface SoftBodyState {
  pressureField: PressureField;
  /** Highest local input pressure this frame (0…1). */
  localPressure: number;
  pressureVelocity: number;
  squash: number;
  stretchAmount: number;
  /** Local XY stretch vector applied to vertices. */
  stretch: THREE.Vector3;
  stretchVel: THREE.Vector3;
  stretchTarget: THREE.Vector3;
  /** >0 pinch in, <0 pull apart. Magnitude 0…1. */
  pinchStrength: number;
  pinchAxis: THREE.Vector2;
  pinchDistance: number;
  pinchVelocity: number;
  scale: THREE.Vector3;
  positionOffset: THREE.Vector3;
  /** @deprecated Prefer `rotation` — kept for any leftover offset math. */
  rotationOffset: THREE.Vector2;
  /** Body pose (radians). Soft feedback, not free orbit. */
  rotation: SoftBodyRotationState;
  /** Weighted center of pressure in body space (-1…1). */
  pressureCenter: THREE.Vector3;
  releaseEnergy: number;
  releaseImpulse: number;
  isPressed: boolean;
  isStretching: boolean;
  isMultiTouch: boolean;
  mode: InteractionMode;
  /** Region locked on pointerdown (survives leaving the mesh). */
  lockRegion: PressureRegion | "unknown";
  lockLocal: THREE.Vector3;
  dragPixel: THREE.Vector2;
  /**
   * Ear grab pose (left=-1, right=+1, none=0).
   * Local ear stretch follows stretch; body only lightly follows.
   */
  earGrabSide: number;
  /** Local ear stretch vector (body-space XY), springs home on release. */
  earStretch: THREE.Vector2;
  earStretchVel: THREE.Vector2;
  /** Local ear tilt (radians) toward pull direction. */
  earTilt: number;
  earTiltVel: number;
  /** Surface petting: 0…1 intensity, expanding soft ripple. */
  petStrength: number;
  petWave: number;
  petCenter: THREE.Vector3;
  /** True while pointer is rubbing the surface (not yanking). */
  isPetting: boolean;
}

/** Spring-damper body pose. Values are radians. */
export interface SoftBodyRotationState {
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

export function createSoftBodyRotationState(): SoftBodyRotationState {
  return {
    x: 0,
    y: 0,
    z: 0,
    velX: 0,
    velY: 0,
    velZ: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };
}

export function createSoftBodyState(): SoftBodyState {
  return {
    pressureField: createPressureField(),
    localPressure: 0,
    pressureVelocity: 0,
    squash: 0,
    stretchAmount: 0,
    stretch: new THREE.Vector3(),
    stretchVel: new THREE.Vector3(),
    stretchTarget: new THREE.Vector3(),
    pinchStrength: 0,
    pinchAxis: new THREE.Vector2(1, 0),
    pinchDistance: 0,
    pinchVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    positionOffset: new THREE.Vector3(),
    rotationOffset: new THREE.Vector2(),
    rotation: createSoftBodyRotationState(),
    pressureCenter: new THREE.Vector3(),
    releaseEnergy: 0,
    releaseImpulse: 0,
    isPressed: false,
    isStretching: false,
    isMultiTouch: false,
    mode: "idle",
    lockRegion: "unknown",
    lockLocal: new THREE.Vector3(0, 1, 0),
    dragPixel: new THREE.Vector2(),
    earGrabSide: 0,
    earStretch: new THREE.Vector2(),
    earStretchVel: new THREE.Vector2(),
    earTilt: 0,
    earTiltVel: 0,
    petStrength: 0,
    petWave: 0,
    petCenter: new THREE.Vector3(0, 1, 0),
    isPetting: false,
  };
}

export interface PointerState {
  id: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  downX: number;
  downY: number;
  vx: number;
  vy: number;
  region: PressureRegion | "unknown";
  local: THREE.Vector3;
  pressure: number;
  isDown: boolean;
  downAt: number;
  lastMoveAt: number;
  /** True once this pointer exceeded the drag threshold. */
  dragging: boolean;
}

export function createPointerState(id: number, x: number, y: number, now: number): PointerState {
  return {
    id,
    x,
    y,
    prevX: x,
    prevY: y,
    downX: x,
    downY: y,
    vx: 0,
    vy: 0,
    region: "unknown",
    local: new THREE.Vector3(0, 1, 0),
    pressure: 0,
    isDown: true,
    downAt: now,
    lastMoveAt: now,
    dragging: false,
  };
}

/**
 * Neighbor weights for pressure propagation.
 * Keys are source regions; values map neighbor → influence.
 */
export const REGION_NEIGHBORS: Record<PressureRegion, Partial<Record<PressureRegion, number>>> = {
  "left-cheek": {
    "right-cheek": 0.35,
    belly: 0.55,
    top: 0.15,
    mouth: 0.25,
    "left-ear": 0.3,
  },
  "right-cheek": {
    "left-cheek": 0.35,
    belly: 0.55,
    top: 0.15,
    mouth: 0.25,
    "right-ear": 0.3,
  },
  belly: {
    "left-cheek": 0.45,
    "right-cheek": 0.45,
    top: 0.25,
    mouth: 0.2,
  },
  top: {
    "left-cheek": 0.25,
    "right-cheek": 0.25,
    belly: 0.2,
    "left-ear": 0.35,
    "right-ear": 0.35,
  },
  mouth: {
    "left-cheek": 0.3,
    "right-cheek": 0.3,
    belly: 0.35,
    top: 0.15,
  },
  "left-ear": {
    "left-cheek": 0.45,
    top: 0.3,
  },
  "right-ear": {
    "right-cheek": 0.45,
    top: 0.3,
  },
};

/** Approximate unit directions for pressure regions in body space. */
export const REGION_DIRS: Record<PressureRegion, THREE.Vector3> = {
  "left-cheek": new THREE.Vector3(-0.78, 0.12, 0.62).normalize(),
  "right-cheek": new THREE.Vector3(0.78, 0.12, 0.62).normalize(),
  top: new THREE.Vector3(0, 1, 0),
  belly: new THREE.Vector3(0, -0.85, 0.5).normalize(),
  "left-ear": new THREE.Vector3(-0.72, 0.68, 0.12).normalize(),
  "right-ear": new THREE.Vector3(0.72, 0.68, 0.12).normalize(),
  mouth: new THREE.Vector3(0, -0.05, 1).normalize(),
};

/** Pose feedback config. Angles in radians. */
export interface SoftBodyRotationConfig {
  maxRotationX: number;
  maxRotationY: number;
  maxRotationZ: number;
  rotationSpring: number;
  rotationDamping: number;
  pressureRotationFactor: number;
  stretchRotationFactor: number;
  pinchRotationFactor: number;
  releaseRotationFactor: number;
  earRotationFactor: number;
  velocityRotationFactor: number;
  maxReleaseRotationVelocity: number;
  /** How much stretch also pulls body position (already partly in bodyPull). */
  stretchPositionFollow: number;
  /** Local ear spring (independent of body). */
  earStretchSpring: number;
  earStretchDamping: number;
  earTiltSpring: number;
  earTiltDamping: number;
  maxEarTilt: number;
}

export const DEFAULT_SOFT_BODY_ROTATION: SoftBodyRotationConfig = {
  // ~8° / ~3° / ~7° — felt, not flashy.
  maxRotationX: 0.14,
  maxRotationY: 0.05,
  maxRotationZ: 0.12,
  rotationSpring: 55,
  rotationDamping: 9,
  pressureRotationFactor: 0.11,
  stretchRotationFactor: 0.14,
  pinchRotationFactor: 0.04,
  releaseRotationFactor: 0.22,
  earRotationFactor: 0.18,
  velocityRotationFactor: 0.00035,
  maxReleaseRotationVelocity: 8,
  stretchPositionFollow: 0.06,
  earStretchSpring: 160,
  earStretchDamping: 11,
  earTiltSpring: 90,
  earTiltDamping: 10,
  // ~14° — ears can look more "yanked" than the body.
  maxEarTilt: 0.24,
};

export interface SoftBodyPhysicsConfig {
  pressurePropagation: number;
  propagationSpeed: number;
  volumeCompensation: number;
  oppositeSideCompensation: number;
  springK: number;
  damping: number;
  nonLinearSpring: number;
  releaseMultiplier: number;
  releaseWaveStrength: number;
  releaseWaveSpeed: number;
  stretchResistance: number;
  stretchSpring: number;
  stretchDamping: number;
  maxStretch: number;
  pinchStrength: number;
  pinchBulge: number;
  maxReleaseImpulse: number;
  dragThreshold: number;
  /** Global softness multiplier (character personality scales this). */
  softness: number;
  /** How strongly local pressure creates a dent. */
  dentDepth: number;
  /** Radius of local dent influence (normalized direction). */
  dentRadius: number;
  /** Position follow factor when stretched. */
  bodyPull: number;
  /** Rotation follow factor when stretched. */
  bodyTilt: number;
}

export const DEFAULT_SOFT_BODY: SoftBodyPhysicsConfig = {
  pressurePropagation: 0.65,
  propagationSpeed: 8.5,
  volumeCompensation: 0.35,
  oppositeSideCompensation: 0.28,
  springK: 1,
  damping: 1,
  nonLinearSpring: 0.55,
  releaseMultiplier: 1,
  releaseWaveStrength: 0.85,
  releaseWaveSpeed: 7.5,
  stretchResistance: 1.6,
  stretchSpring: 140,
  stretchDamping: 10,
  maxStretch: 0.95,
  pinchStrength: 0.72,
  pinchBulge: 0.28,
  maxReleaseImpulse: 1.35,
  dragThreshold: 14,
  softness: 1,
  dentDepth: 0.55,
  dentRadius: 0.95,
  bodyPull: 0.08,
  bodyTilt: 0.04,
};

/** Optional per-character multipliers on top of DEFAULT_SOFT_BODY. */
export interface SoftBodyPersonality {
  softness?: number;
  propagation?: number;
  stretchiness?: number;
  releaseSnap?: number;
  /** Pose spring multiplier (higher = snappier return). */
  rotationSpring?: number;
  /** Pose damping multiplier (higher = less overshoot). */
  rotationDamping?: number;
  /** Overall pose amplitude multiplier. */
  rotationAmount?: number;
}

export function resolveSoftBodyConfig(soft?: SoftBodyPersonality): SoftBodyPhysicsConfig {
  const base = DEFAULT_SOFT_BODY;
  const softness = soft?.softness ?? 1;
  const propagation = soft?.propagation ?? 1;
  const stretchiness = soft?.stretchiness ?? 1;
  const releaseSnap = soft?.releaseSnap ?? 1;
  return {
    ...base,
    pressurePropagation: base.pressurePropagation * propagation,
    propagationSpeed: base.propagationSpeed * (0.85 + softness * 0.15),
    volumeCompensation: base.volumeCompensation * (0.8 + softness * 0.2),
    oppositeSideCompensation: base.oppositeSideCompensation * propagation,
    nonLinearSpring: base.nonLinearSpring * (0.7 + softness * 0.3),
    releaseMultiplier: base.releaseMultiplier * releaseSnap,
    stretchSpring: base.stretchSpring / Math.max(stretchiness, 0.4),
    maxStretch: clamp(base.maxStretch * stretchiness, 0.55, 1.15),
    softness,
    dentDepth: base.dentDepth * softness,
    bodyPull: base.bodyPull * stretchiness,
    bodyTilt: base.bodyTilt * stretchiness,
  };
}

export function resolveSoftBodyRotationConfig(soft?: SoftBodyPersonality): SoftBodyRotationConfig {
  const base = DEFAULT_SOFT_BODY_ROTATION;
  const amount = soft?.rotationAmount ?? 1;
  const spring = soft?.rotationSpring ?? 1;
  const damping = soft?.rotationDamping ?? 1;
  return {
    ...base,
    maxRotationX: base.maxRotationX * amount,
    maxRotationY: base.maxRotationY * amount,
    maxRotationZ: base.maxRotationZ * amount,
    rotationSpring: base.rotationSpring * spring,
    rotationDamping: base.rotationDamping * damping,
    pressureRotationFactor: base.pressureRotationFactor * amount,
    stretchRotationFactor: base.stretchRotationFactor * amount,
    pinchRotationFactor: base.pinchRotationFactor * amount,
    releaseRotationFactor: base.releaseRotationFactor * amount * (soft?.releaseSnap ?? 1),
    earRotationFactor: base.earRotationFactor * amount,
    velocityRotationFactor: base.velocityRotationFactor * amount,
  };
}

/** Soft-body hit pointer → clamp-safe pressure region. */
export function toPressureRegion(area: SquishArea): PressureRegion | "unknown" {
  return area === "unknown" ? "unknown" : area;
}

export function isEarRegion(region: PressureRegion | "unknown"): boolean {
  return region === "left-ear" || region === "right-ear";
}

/** 1 - (1-a)(1-b) — soft combine so dual press never exceeds 1. */
export function combinePressure(a: number, b: number): number {
  return 1 - (1 - clamp(a, 0, 1)) * (1 - clamp(b, 0, 1));
}

export function assertFiniteSoftBody(state: SoftBodyState): boolean {
  const nums = [
    state.localPressure,
    state.pressureVelocity,
    state.squash,
    state.stretchAmount,
    state.pinchStrength,
    state.pinchDistance,
    state.pinchVelocity,
    state.releaseEnergy,
    state.releaseImpulse,
    state.stretch.x,
    state.stretch.y,
    state.stretch.z,
    state.scale.x,
    state.scale.y,
    state.scale.z,
    state.positionOffset.x,
    state.positionOffset.y,
    state.positionOffset.z,
    state.rotationOffset.x,
    state.rotationOffset.y,
    state.rotation.x,
    state.rotation.y,
    state.rotation.z,
    state.rotation.velX,
    state.rotation.velY,
    state.rotation.velZ,
    state.rotation.targetX,
    state.rotation.targetY,
    state.rotation.targetZ,
    state.pressureCenter.x,
    state.pressureCenter.y,
    state.pressureCenter.z,
    state.earStretch.x,
    state.earStretch.y,
    state.earTilt,
    state.petStrength,
    state.petWave,
  ];
  for (const key of PRESSURE_REGIONS) nums.push(state.pressureField[key]);
  for (const n of nums) {
    if (!Number.isFinite(n)) return false;
  }
  return true;
}

export function sanitizeSoftBody(state: SoftBodyState): void {
  state.localPressure = clamp(Number.isFinite(state.localPressure) ? state.localPressure : 0, 0, 1.2);
  state.pressureVelocity = Number.isFinite(state.pressureVelocity) ? state.pressureVelocity : 0;
  state.squash = clamp(Number.isFinite(state.squash) ? state.squash : 0, -0.2, 1.4);
  state.stretchAmount = clamp(Number.isFinite(state.stretchAmount) ? state.stretchAmount : 0, 0, 1.2);
  state.pinchStrength = clamp(Number.isFinite(state.pinchStrength) ? state.pinchStrength : 0, -1, 1);
  state.pinchDistance = Number.isFinite(state.pinchDistance) ? state.pinchDistance : 0;
  state.pinchVelocity = Number.isFinite(state.pinchVelocity) ? state.pinchVelocity : 0;
  state.releaseEnergy = clamp(Number.isFinite(state.releaseEnergy) ? state.releaseEnergy : 0, 0, 2);
  state.releaseImpulse = clamp(Number.isFinite(state.releaseImpulse) ? state.releaseImpulse : 0, 0, 2);
  if (!Number.isFinite(state.stretch.x)) state.stretch.x = 0;
  if (!Number.isFinite(state.stretch.y)) state.stretch.y = 0;
  if (!Number.isFinite(state.stretch.z)) state.stretch.z = 0;
  if (!Number.isFinite(state.stretchVel.x)) state.stretchVel.x = 0;
  if (!Number.isFinite(state.stretchVel.y)) state.stretchVel.y = 0;
  if (!Number.isFinite(state.stretchVel.z)) state.stretchVel.z = 0;
  if (!Number.isFinite(state.scale.x)) state.scale.x = 1;
  if (!Number.isFinite(state.scale.y)) state.scale.y = 1;
  if (!Number.isFinite(state.scale.z)) state.scale.z = 1;
  state.scale.x = clamp(state.scale.x, 0.55, 1.6);
  state.scale.y = clamp(state.scale.y, 0.55, 1.6);
  state.scale.z = clamp(state.scale.z, 0.55, 1.6);
  if (!Number.isFinite(state.positionOffset.x)) state.positionOffset.x = 0;
  if (!Number.isFinite(state.positionOffset.y)) state.positionOffset.y = 0;
  if (!Number.isFinite(state.positionOffset.z)) state.positionOffset.z = 0;
  if (!Number.isFinite(state.rotationOffset.x)) state.rotationOffset.x = 0;
  if (!Number.isFinite(state.rotationOffset.y)) state.rotationOffset.y = 0;
  const rot = state.rotation;
  if (!Number.isFinite(rot.x)) rot.x = 0;
  if (!Number.isFinite(rot.y)) rot.y = 0;
  if (!Number.isFinite(rot.z)) rot.z = 0;
  if (!Number.isFinite(rot.velX)) rot.velX = 0;
  if (!Number.isFinite(rot.velY)) rot.velY = 0;
  if (!Number.isFinite(rot.velZ)) rot.velZ = 0;
  if (!Number.isFinite(rot.targetX)) rot.targetX = 0;
  if (!Number.isFinite(rot.targetY)) rot.targetY = 0;
  if (!Number.isFinite(rot.targetZ)) rot.targetZ = 0;
  rot.x = clamp(rot.x, -0.5, 0.5);
  rot.y = clamp(rot.y, -0.3, 0.3);
  rot.z = clamp(rot.z, -0.5, 0.5);
  rot.velX = clamp(rot.velX, -12, 12);
  rot.velY = clamp(rot.velY, -12, 12);
  rot.velZ = clamp(rot.velZ, -12, 12);
  if (!Number.isFinite(state.pressureCenter.x)) state.pressureCenter.x = 0;
  if (!Number.isFinite(state.pressureCenter.y)) state.pressureCenter.y = 0;
  if (!Number.isFinite(state.pressureCenter.z)) state.pressureCenter.z = 0;
  if (!Number.isFinite(state.earStretch.x)) state.earStretch.x = 0;
  if (!Number.isFinite(state.earStretch.y)) state.earStretch.y = 0;
  if (!Number.isFinite(state.earStretchVel.x)) state.earStretchVel.x = 0;
  if (!Number.isFinite(state.earStretchVel.y)) state.earStretchVel.y = 0;
  if (!Number.isFinite(state.earTilt)) state.earTilt = 0;
  if (!Number.isFinite(state.earTiltVel)) state.earTiltVel = 0;
  state.earStretch.x = clamp(state.earStretch.x, -1.5, 1.5);
  state.earStretch.y = clamp(state.earStretch.y, -1.5, 1.5);
  state.earTilt = clamp(state.earTilt, -0.4, 0.4);
  state.earGrabSide = state.earGrabSide < 0 ? -1 : state.earGrabSide > 0 ? 1 : 0;
  state.petStrength = clamp(Number.isFinite(state.petStrength) ? state.petStrength : 0, 0, 1);
  state.petWave = clamp(Number.isFinite(state.petWave) ? state.petWave : 0, 0, 1.2);
  if (!Number.isFinite(state.petCenter.x)) state.petCenter.set(0, 1, 0);
  for (const key of PRESSURE_REGIONS) {
    const v = state.pressureField[key];
    state.pressureField[key] = clamp(Number.isFinite(v) ? v : 0, 0, 1.15);
  }
}

export interface SoftBodyDebugSnapshot {
  mode: InteractionMode;
  pressure: number;
  field: PressureField;
  stretch: number;
  pinch: number;
  release: number;
  propagation: number;
  releaseVelocity: number;
  fps: number;
}
