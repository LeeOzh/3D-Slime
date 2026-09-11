/**
 * Fixed high visual quality.
 *
 * No runtime auto-downgrade of resolution / transmission / mesh density.
 * Only CPU-side opts that do not change the look: face-canvas rate limit,
 * idle normal skip, active-region deform, pointer buffer reuse.
 */

export interface PerfProfile {
  isMobile: boolean;
  isIOS: boolean;
  sphereSegments: number;
  capSegments: number;
  maxDpr: number;
  antialias: boolean;
  particlePool: number;
  faceCanvasSize: number;
  /** Min ms between face canvas draws (iOS texture upload is expensive). */
  faceMinIntervalMs: number;
  idleNormalEvery: number;
}

function detectMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)) return true;
  if (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua) && window.innerWidth <= 1024) {
    return true;
  }
  return false;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

export const PERF: PerfProfile = {
  isMobile: detectMobile(),
  isIOS: detectIOS(),
  // Same silhouette density on phone and desktop.
  sphereSegments: 96,
  capSegments: 48,
  maxDpr: 2,
  antialias: true,
  particlePool: 48,
  faceCanvasSize: 512,
  // iOS Canvas→GPU upload is slow; glance tracking can wait ~80ms.
  faceMinIntervalMs: detectIOS() ? 80 : 33,
  // Idle-only normal skip (interaction always recomputes).
  idleNormalEvery: 2,
};
