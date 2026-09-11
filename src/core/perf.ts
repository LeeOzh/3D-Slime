/**
 * Quality profile + adaptive GPU scaler.
 *
 * Start at HIGH visual quality. Only step down if real frame time stays bad.
 * CPU-side opts (active regions, pointer buffer) always stay on.
 */

export interface PerfProfile {
  isMobile: boolean;
  isIOS: boolean;
  sphereSegments: number;
  capSegments: number;
  maxDpr: number;
  antialias: boolean;
  useTransmission: boolean;
  useClearcoat: boolean;
  useSheen: boolean;
  particlePool: number;
  faceCanvasSize: number;
  /** Min ms between face canvas draws (iOS texture upload is expensive). */
  faceMinIntervalMs: number;
  idleNormalEvery: number;
  liveNormalEvery: number;
}

export type GpuTier = 0 | 1 | 2;

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
  // iOS / iPadOS (desktop-mode iPad still reports Mobile or touch+Mac)
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

const mobile = detectMobile();
const ios = detectIOS();

/** Boot quality — keep look close to desktop. */
export const PERF: PerfProfile = {
  isMobile: mobile,
  isIOS: ios,
  // 72 keeps silhouette smooth; 48 was visibly faceted.
  sphereSegments: mobile ? 72 : 96,
  capSegments: mobile ? 36 : 48,
  maxDpr: 2,
  antialias: true,
  useTransmission: true,
  useClearcoat: true,
  useSheen: true,
  particlePool: mobile ? 32 : 48,
  faceCanvasSize: 512,
  // iOS CanvasTexture upload is much slower than Chrome — throttle face redraws.
  faceMinIntervalMs: ios ? 80 : 33,
  idleNormalEvery: mobile ? 2 : 2,
  // Recompute normals every N frames while interacting (iOS CPU/WebGL bound).
  liveNormalEvery: ios ? 2 : mobile ? 1 : 1,
};

/** Runtime GPU quality steps (materials / DPR only — no mesh rebuild). */
export interface GpuTierSettings {
  maxDpr: number;
  useTransmission: boolean;
  useClearcoat: boolean;
  useSheen: boolean;
  transmissionScale: number;
}

export function gpuTierSettings(tier: GpuTier): GpuTierSettings {
  if (tier <= 0) {
    return {
      maxDpr: PERF.maxDpr,
      useTransmission: true,
      useClearcoat: true,
      useSheen: true,
      transmissionScale: 1,
    };
  }
  if (tier === 1) {
    // Slight DPR trim, keep jelly look.
    return {
      maxDpr: 1.6,
      useTransmission: true,
      useClearcoat: true,
      useSheen: false,
      transmissionScale: 0.85,
    };
  }
  // Last resort: drop the expensive transmission pass.
  return {
    maxDpr: 1.25,
    useTransmission: false,
    useClearcoat: false,
    useSheen: false,
    transmissionScale: 0,
  };
}

/**
 * Watches rolling FPS and steps GPU tier down only when needed.
 * Does not rebuild geometry.
 */
export class AdaptiveQuality {
  private tier: GpuTier = 0;
  private samples = 0;
  private accumDt = 0;
  private badSeconds = 0;
  private cooldown = 2.5;
  private onChange: ((tier: GpuTier, settings: GpuTierSettings) => void) | null = null;

  constructor(onChange?: (tier: GpuTier, settings: GpuTierSettings) => void) {
    this.onChange = onChange ?? null;
  }

  get currentTier(): GpuTier {
    return this.tier;
  }

  /** Call every frame with delta seconds. */
  update(dt: number): void {
    if (dt <= 0) return;
    this.accumDt += dt;
    this.samples += 1;

    // Evaluate ~once per second.
    if (this.accumDt < 1) return;
    const fps = this.samples / this.accumDt;
    this.accumDt = 0;
    this.samples = 0;

    if (this.cooldown > 0) {
      this.cooldown -= 1;
      return;
    }

    // Sustained low FPS → step down. iOS reacts one second sooner
    // (transmission RT + canvas upload are the usual cliffs).
    if (fps < 48) {
      this.badSeconds += 1;
    } else {
      this.badSeconds = 0;
    }

    const needBad = PERF.isIOS ? 1 : 2;
    if (this.badSeconds >= needBad && this.tier < 2) {
      this.tier = (this.tier + 1) as GpuTier;
      this.badSeconds = 0;
      this.cooldown = 3;
      this.onChange?.(this.tier, gpuTierSettings(this.tier));
    }
  }
}
