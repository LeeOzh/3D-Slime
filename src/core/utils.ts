/** Shared math helpers — avoid allocating in hot paths. */

import type { SquishArea } from "./types";

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Hermite smoothstep. edge0 > edge1 yields inverted ramp. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Squared distance without Math.sqrt. */
export function dist2(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

/** Exponential damping factor for spring-ish lerps. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/**
 * Classify a normalized local-space direction (unit vector from body center)
 * into a body region. Coordinates: +Y up, +Z toward camera (front), +X = viewer right.
 */
export function detectSquishArea(nx: number, ny: number, nz: number): SquishArea {
  if (ny > 0.55) return "top";
  if (ny < -0.35) return "belly";
  // Ears sit high on the sides (cat / nezha bump regions).
  if (ny > 0.28 && nx < -0.32) return "left-ear";
  if (ny > 0.28 && nx > 0.32) return "right-ear";
  // Mouth / face center on the front.
  if (nz > 0.55 && Math.abs(ny) < 0.2 && Math.abs(nx) < 0.3) return "mouth";
  if (nx < -0.3) return "left-cheek";
  if (nx > 0.3) return "right-cheek";
  return "unknown";
}

