import type * as THREE from "three";

export type ExpressionName =
  | "idle"
  | "press"
  | "drag"
  | "happy"
  | "surprised"
  | "pain"
  | "angry"
  | "dizzy"
  | "excited"
  | "sleepy";

/** Body region under the pointer, derived from local-space hit direction. */
export type SquishArea =
  | "left-cheek"
  | "right-cheek"
  | "top"
  | "belly"
  | "left-ear"
  | "right-ear"
  | "mouth"
  | "unknown";

/**
 * Unified squish snapshot. All effects (deform / face / particles / audio)
 * should derive pressure from here rather than recomputing their own.
 */
export interface SquishState {
  isPressing: boolean;
  /** 0 … 1 (may briefly overshoot slightly while spring settles). */
  pressure: number;
  area: SquishArea;
  /** Pointer speed in px/s at last move. */
  velocity: number;
  /** Seconds current press has been held. */
  duration: number;
  totalCount: number;
  lastSquishTime: number;
}

export type EyeStyle =
  | "soft"
  | "happy"
  | "sparkle"
  | "cat"
  | "nezha"
  | "wide"
  | "round"
  | "squint"
  | "dizzy"
  | "angry"
  | "sleepy";
export type MouthStyle =
  | "smile"
  | "smirk"
  | "open-smile"
  | "big-smile"
  | "small-o"
  | "o"
  | "cat"
  | "flat"
  | "wavy"
  | "frown"
  | "grit";

export type ShapeKind = "ball" | "pudding" | "drop" | "mochi" | "ghost" | "cat" | "nezha";

export interface CharacterLines {
  idle: string;
  press: string;
  release: string;
  drag: string;
  happy: string;
}

export interface CharacterFace {
  eye: EyeStyle;
  mouth: MouthStyle;
  blink: boolean;
}

export type ParticleType = "star" | "bubble" | "heart" | "dust" | "spark" | "energy";

export interface CharacterPersonality {
  breath: number;
  jiggle: number;
  bounce: number;
  /** How deep the local dent goes (0.7–1.2 typical). */
  squishStrength: number;
  /** Spring stiffness while pressing / releasing. */
  springK: number;
  /** Release damping — lower = bouncier overshoot. */
  damping: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  shape: ShapeKind;
  color: string;
  atten: string;
  blush: string;
  lines: CharacterLines;
  face: CharacterFace;
  personality: CharacterPersonality;
  caramel?: boolean;
  qiankun?: boolean;
  particleType?: ParticleType;
}

export interface TintDef {
  name: string;
  mul: number;
  sat?: number;
  hueShift?: number;
}

/** Shared mutable session state (ported from legacy inline script). */
export interface GameState {
  character: CharacterDef;
  tintIndex: number;
  pressing: boolean;
  dragging: boolean;
  hovering: boolean;
  pressStrength: number;
  pressTarget: number;
  pressVel: number;
  dragVec: THREE.Vector3;
  dragTarget: THREE.Vector3;
  squash: number;
  squashVel: number;
  stretch: THREE.Vector3;
  stretchVel: THREE.Vector3;
  wobble: number;
  wobbleVel: number;
  happyBounce: number;
  happyVel: number;
  lean: THREE.Vector2;
  leanTarget: THREE.Vector2;
  pressCount: number;
  lastPointer: THREE.Vector2;
  movedFar: boolean;
  color: THREE.Color;
  atten: THREE.Color;
  targetColor: THREE.Color;
  targetAtten: THREE.Color;
  expr: ExpressionName;
  exprUntil: number;
  blink: number;
  nextBlink: number;
  faceDirty: boolean;
  faceCenter: THREE.Vector3;
  reduceMotion: boolean;

  /** Unified squish snapshot (P0). */
  squish: SquishState;

  /** Secondary motion — delayed follow of lean/press for ears & opposite side. */
  earLag: THREE.Vector2;
  earLagVel: THREE.Vector2;
  headLag: THREE.Vector2;
  headLagVel: THREE.Vector2;
  /** Signed compensation: +1 = bulge right when left is pressed. */
  sideComp: number;
  sideCompVel: number;

  /** Combo counter (P1). Resets if user stops squishing past the window. */
  combo: number;
  comboLevel: number;
  /** Rolling press timestamps for frenzy/dizzy detection. */
  recentPressTimes: number[];

  /** Idle / sleepy (P4). */
  lastInteractionAt: number;
  sleepy: boolean;
  idleFidgetAt: number;

  /** Peak pressure reached during the current press (for stats). */
  pressPeak: number;
}
