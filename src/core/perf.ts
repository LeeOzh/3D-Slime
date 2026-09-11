/** Device quality profile — one place for mobile vs desktop budgets. */

export interface PerfProfile {
  isMobile: boolean;
  /** Sphere segments (width/height). */
  sphereSegments: number;
  capSegments: number;
  maxDpr: number;
  antialias: boolean;
  /** Transmission is very expensive on mobile GPUs. */
  useTransmission: boolean;
  useClearcoat: boolean;
  useSheen: boolean;
  particlePool: number;
  faceCanvasSize: number;
  /** Recompute vertex normals every N frames when idle (always 1 when live). */
  idleNormalEvery: number;
  /** Extra normal skip factor on mobile while live (1 = every frame). */
  liveNormalEvery: number;
}

function detectMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)) return true;
  // iPadOS desktop UA
  if (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua) && window.innerWidth <= 1024) {
    return true;
  }
  return false;
}

const mobile = detectMobile();

export const PERF: PerfProfile = mobile
  ? {
      isMobile: true,
      // ~4× fewer verts than 96 — still smooth for a toy ball.
      sphereSegments: 48,
      capSegments: 24,
      maxDpr: 1.35,
      antialias: false,
      useTransmission: false,
      useClearcoat: false,
      useSheen: false,
      particlePool: 20,
      faceCanvasSize: 256,
      idleNormalEvery: 3,
      liveNormalEvery: 1,
    }
  : {
      isMobile: false,
      sphereSegments: 96,
      capSegments: 48,
      maxDpr: 2,
      antialias: true,
      useTransmission: true,
      useClearcoat: true,
      useSheen: true,
      particlePool: 48,
      faceCanvasSize: 512,
      idleNormalEvery: 2,
      liveNormalEvery: 1,
    };
