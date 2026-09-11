import type { CharacterDef, GameState } from "../core/types";
import {
  DEFAULT_SOFT_BODY,
  PRESSURE_REGIONS,
  REGION_DIRS,
  REGION_NEIGHBORS,
  assertFiniteSoftBody,
  combinePressure,
  isEarRegion,
  resolveSoftBodyConfig,
  resolveSoftBodyRotationConfig,
  sanitizeSoftBody,
  type InteractionKind,
  type PointerState,
  type PressureRegion,
  type SoftBodyPhysicsConfig,
  type SoftBodyRotationConfig,
  type SoftBodyState,
} from "../core/softBody";
import { clamp, damp } from "../core/utils";

/**
 * Lightweight soft-body physics orchestrator.
 *
 * Input: multi-pointer interaction state (from SquishSystem).
 * Output: SoftBodyState consumed by DeformationSystem / CharacterMotionSystem.
 *
 * Does NOT touch Three.js meshes.
 */
export class SoftBodySystem {
  private config: SoftBodyPhysicsConfig = DEFAULT_SOFT_BODY;
  private rotConfig: SoftBodyRotationConfig = resolveSoftBodyRotationConfig();
  private waveTime = 0;
  private waveActive = false;
  private lastGestureKind: InteractionKind = "squeeze";
  private pinchStart: number | null = null;
  private pinchPointerIds = "";
  private fpsEma = 60;
  private releaseVel = 0;
  private readonly activeBuf: PointerState[] = [];
  private readonly directRegions = new Set<PressureRegion>();
  private cachedCharId = "";
  private petRipple = 0;
  private petRippleAge = 0;

  resolveConfig(character: CharacterDef): SoftBodyPhysicsConfig {
    this.config = resolveSoftBodyConfig(character.personality.soft);
    this.rotConfig = resolveSoftBodyRotationConfig(character.personality.soft);
    this.cachedCharId = character.id;
    return this.config;
  }

  getRotationConfig(): SoftBodyRotationConfig {
    return this.rotConfig;
  }

  getConfig(): SoftBodyPhysicsConfig {
    return this.config;
  }

  reset(soft: SoftBodyState): void {
    soft.localPressure = 0;
    soft.pressureVelocity = 0;
    soft.squash = 0;
    soft.stretchAmount = 0;
    soft.stretch.set(0, 0, 0);
    soft.stretchVel.set(0, 0, 0);
    soft.stretchTarget.set(0, 0, 0);
    soft.pinchStrength = 0;
    soft.pinchDistance = 0;
    soft.pinchVelocity = 0;
    soft.scale.set(1, 1, 1);
    soft.positionOffset.set(0, 0, 0);
    soft.rotationOffset.set(0, 0);
    soft.rotation.x = 0;
    soft.rotation.y = 0;
    soft.rotation.z = 0;
    soft.rotation.velX = 0;
    soft.rotation.velY = 0;
    soft.rotation.velZ = 0;
    soft.rotation.targetX = 0;
    soft.rotation.targetY = 0;
    soft.rotation.targetZ = 0;
    soft.pressureCenter.set(0, 0, 0);
    soft.releaseEnergy = 0;
    soft.releaseImpulse = 0;
    soft.isPressed = false;
    soft.isStretching = false;
    soft.isMultiTouch = false;
    soft.mode = "idle";
    soft.lockRegion = "unknown";
    soft.lockLocal.set(0, 1, 0);
    soft.dragPixel.set(0, 0);
    soft.earGrabSide = 0;
    soft.earStretch.set(0, 0);
    soft.earStretchVel.set(0, 0);
    soft.earTilt = 0;
    soft.earTiltVel = 0;
    soft.petStrength = 0;
    soft.petWave = 0;
    soft.isPetting = false;
    for (const key of PRESSURE_REGIONS) soft.pressureField[key] = 0;
    this.waveActive = false;
    this.waveTime = 0;
    this.releaseVel = 0;
    this.pinchStart = null;
    this.pinchPointerIds = "";
  }

  /** Fast release → stronger overshoot impulse + body wave. */
  applyRelease(
    soft: SoftBodyState,
    releaseVelocity: number,
    peakPressure: number,
    character: CharacterDef,
  ): { energy: number; impulse: number; kind: InteractionKind } {
    if (character.id !== this.cachedCharId) this.resolveConfig(character);
    const cfg = this.config;
    const vel = clamp(Math.abs(releaseVelocity), 0, 40);
    const impulse = clamp(vel * vel * 0.0022 * cfg.releaseMultiplier, 0, cfg.maxReleaseImpulse);
    // Soft taps get almost no wave; only hard/fast releases bloom.
    const energy = clamp(
      peakPressure * peakPressure * (0.12 + impulse * 0.85) * cfg.releaseWaveStrength,
      0,
      1.5,
    );
    soft.releaseEnergy = energy;
    soft.releaseImpulse = impulse;
    this.releaseVel = vel;
    this.waveActive = energy > 0.04;
    this.waveTime = 0;

    // Convert leftover pressure into rebound energy.
    for (const key of PRESSURE_REGIONS) {
      const p = soft.pressureField[key];
      if (p > 0.02) soft.pressureField[key] = p * 0.18;
    }

    if (soft.stretchAmount > 0.01 || soft.stretch.lengthSq() > 1e-5) {
      soft.stretchVel.addScaledVector(soft.stretch, -8 - impulse * 14);
    }
    if (Math.abs(soft.pinchStrength) > 0.02) {
      soft.pinchVelocity += Math.sign(soft.pinchStrength) * (6 + impulse * 10);
    }
    // Pose inertia: keep current lean velocity and kick opposite the stretch/release.
    const rot = soft.rotation;
    const kick = cfg.releaseMultiplier * (0.55 + impulse * 0.9);
    rot.velZ += -soft.stretch.x * this.rotConfig.releaseRotationFactor * kick * 12;
    rot.velX += -soft.stretch.y * this.rotConfig.releaseRotationFactor * kick * 8;
    rot.velZ += soft.pressureCenter.x * this.rotConfig.releaseRotationFactor * peakPressure * kick * 6;
    const maxV = this.rotConfig.maxReleaseRotationVelocity;
    rot.velX = clamp(rot.velX, -maxV, maxV);
    rot.velY = clamp(rot.velY, -maxV, maxV);
    rot.velZ = clamp(rot.velZ, -maxV, maxV);

    // Ear snap-back: stronger local kick than body, body follow-through comes from rot above.
    if (isEarRegion(soft.lockRegion) || soft.earGrabSide !== 0) {
      soft.earStretchVel.addScaledVector(soft.earStretch, -14 - impulse * 18);
      soft.earTiltVel += -Math.sign(soft.earTilt || soft.earGrabSide || 1) * (4 + impulse * 8);
    }
    this.pinchStart = null;
    return { energy, impulse, kind: this.lastGestureKind };
  }

  update(state: GameState, pointers: PointerState[], dt: number): void {
    const soft = state.softBody;
    if (state.character.id !== this.cachedCharId) {
      this.resolveConfig(state.character);
    }
    const cfg = this.config;
    this.fpsEma = damp(this.fpsEma, 1 / Math.max(dt, 1e-4), 4, dt);

    const active = this.activeBuf;
    active.length = 0;
    for (const p of pointers) {
      if (p.isDown) active.push(p);
    }
    const n = active.length;

    // Ramp pointer pressure from hold time (works even without pointermove).
    const now = performance.now();
    for (const p of active) {
      if (p.region === "unknown") continue;
      const held = (now - p.downAt) / 1000;
      const ramp = 0.28 + Math.min(held / 0.28, 1) * 0.72;
      if (ramp > p.pressure) p.pressure = Math.min(1, ramp);
    }

    soft.isMultiTouch = n >= 2;
    soft.isPressed = n >= 1;
    soft.isStretching = false;

    if (n === 0) {
      soft.mode = this.waveActive ? "drag" : "idle";
    } else if (n >= 2) {
      soft.mode = "multiTouch";
    } else if (active[0].dragging) {
      soft.mode = isEarRegion(active[0].region) ? "stretch" : "drag";
      soft.isStretching = true;
    } else {
      soft.mode = "press";
    }

    const localTarget = this.seedPressureField(soft, active, cfg);

    const prev = soft.localPressure;
    soft.pressureVelocity = (localTarget - prev) * cfg.propagationSpeed;
    soft.localPressure = damp(prev, localTarget, cfg.propagationSpeed * 0.85, dt);

    this.propagatePressure(soft, dt, cfg);
    this.updateStretch(soft, state, active, dt, cfg);
    this.updateEarPose(soft, state, dt);
    this.updatePinch(soft, active, dt, cfg);
    this.updateReleaseWave(soft, dt, cfg);
    this.composeBodyForce(soft, state, cfg, dt);
    this.updateRotation(soft, state, dt);
    this.updatePet(soft, dt);

    if (soft.isPressed && !soft.isStretching) {
      state.pressTarget = Math.max(state.pressTarget, soft.localPressure);
    }

    if (!assertFiniteSoftBody(soft)) sanitizeSoftBody(soft);
  }

  private seedPressureField(
    soft: SoftBodyState,
    active: PointerState[],
    cfg: SoftBodyPhysicsConfig,
  ): number {
    const direct = this.directRegions;
    direct.clear();
    let peak = 0;
    for (const p of active) {
      if (p.region === "unknown") continue;
      const region = p.region;
      const local = clamp(p.pressure, 0, 1) * cfg.softness;
      const prev = direct.has(region) ? soft.pressureField[region] : 0;
      soft.pressureField[region] = combinePressure(prev, local);
      direct.add(region);
      if (local > peak) peak = local;
    }
    // Regions without a live pointer lose their seed — they only keep a short residual.
    for (const key of PRESSURE_REGIONS) {
      if (!direct.has(key) && soft.pressureField[key] > 0) {
        soft.pressureField[key] *= 0.88;
        if (soft.pressureField[key] < 0.01) soft.pressureField[key] = 0;
      }
    }
    if (active.length === 0) return 0;
    return peak;
  }

  private propagatePressure(
    soft: SoftBodyState,
    dt: number,
    cfg: SoftBodyPhysicsConfig,
  ): void {
    const source: Record<PressureRegion, number> = {
      "left-cheek": soft.pressureField["left-cheek"],
      "right-cheek": soft.pressureField["right-cheek"],
      top: soft.pressureField.top,
      belly: soft.pressureField.belly,
      "left-ear": soft.pressureField["left-ear"],
      "right-ear": soft.pressureField["right-ear"],
      mouth: soft.pressureField.mouth,
    };

    // Only keep direct pressure; neighbors are rebuilt each frame (no self-feeding loop).
    const next: Record<PressureRegion, number> = {
      "left-cheek": 0,
      "right-cheek": 0,
      top: 0,
      belly: 0,
      "left-ear": 0,
      "right-ear": 0,
      mouth: 0,
    };

    // Direct seeds already written into the field this frame — read them as the base.
    // We re-read current field for seeded regions only via source snapshot after seed.
    // Use source for direct values (seeded this frame); clear the rest.
    for (const key of PRESSURE_REGIONS) {
      next[key] = source[key];
    }

    // When nothing is pressed, force decay and skip rebuild-from-self.
    if (!soft.isPressed && !this.waveActive) {
      const home = cfg.propagationSpeed * 2.2;
      for (const key of PRESSURE_REGIONS) {
        soft.pressureField[key] = damp(soft.pressureField[key], 0, home, dt);
        if (soft.pressureField[key] < 0.005) soft.pressureField[key] = 0;
      }
      return;
    }

    for (const src of PRESSURE_REGIONS) {
      const p = source[src];
      if (p < 0.02) continue;
      const neighbors = REGION_NEIGHBORS[src];
      for (const dst of PRESSURE_REGIONS) {
        const w = neighbors[dst];
        if (!w) continue;
        next[dst] = combinePressure(next[dst], p * w * cfg.pressurePropagation);
      }
    }

    const left = next["left-cheek"];
    const right = next["right-cheek"];
    if (left > 0.15 && right < left * 0.85) {
      next["right-cheek"] = combinePressure(right, left * cfg.oppositeSideCompensation * 0.45);
    }
    if (right > 0.15 && left < right * 0.85) {
      next["left-cheek"] = combinePressure(left, right * cfg.oppositeSideCompensation * 0.45);
    }
    const total = Math.max(left, right, next.top, next.mouth);
    if (total > 0.2) {
      next.belly = combinePressure(next.belly, total * cfg.volumeCompensation * 0.22);
      next.top = combinePressure(next.top, total * cfg.volumeCompensation * 0.12);
    }

    // While releasing (wave), decay hard so the body pops back quickly.
    const speed = soft.isPressed && !this.waveActive
      ? cfg.propagationSpeed
      : cfg.propagationSpeed * 2.4;

    for (const key of PRESSURE_REGIONS) {
      soft.pressureField[key] = damp(soft.pressureField[key], next[key], speed, dt);
      if (!soft.isPressed) {
        soft.pressureField[key] = damp(soft.pressureField[key], 0, speed * 1.6, dt);
        if (soft.pressureField[key] < 0.005) soft.pressureField[key] = 0;
      }
    }
  }

  private updateStretch(
    soft: SoftBodyState,
    state: GameState,
    active: PointerState[],
    dt: number,
    cfg: SoftBodyPhysicsConfig,
  ): void {
    const primary = active[0];
    if (!primary || soft.isMultiTouch) {
      soft.stretchTarget.set(0, 0, 0);
    } else if (primary.dragging) {
      const dx = primary.x - primary.downX;
      const dy = primary.y - primary.downY;
      const maxPx = 180 * cfg.maxStretch;
      const nx = clamp(dx / maxPx, -1.25, 1.25);
      const ny = clamp(-dy / maxPx, -1.25, 1.25);
      const len = Math.hypot(nx, ny);
      const resist = 1 + cfg.stretchResistance * len * len;
      soft.stretchTarget.set(nx / resist, ny / resist, 0);
      soft.dragPixel.set(dx, dy);
      soft.isStretching = true;
      this.lastGestureKind = isEarRegion(primary.region) ? "earPull" : "stretch";
      soft.lockRegion = primary.region;
    } else {
      soft.stretchTarget.set(0, 0, 0);
    }

    const k = cfg.stretchSpring * (1 + soft.stretchAmount * cfg.nonLinearSpring);
    const c = cfg.stretchDamping * cfg.damping;
    soft.stretchVel.x += ((soft.stretchTarget.x - soft.stretch.x) * k - soft.stretchVel.x * c) * dt;
    soft.stretchVel.y += ((soft.stretchTarget.y - soft.stretch.y) * k - soft.stretchVel.y * c) * dt;
    soft.stretchVel.z += ((soft.stretchTarget.z - soft.stretch.z) * k - soft.stretchVel.z * c) * dt;
    soft.stretch.addScaledVector(soft.stretchVel, dt);
    soft.stretchAmount = clamp(soft.stretch.length(), 0, 1.2);

    if (soft.isStretching) {
      state.stretch.x = damp(state.stretch.x, soft.stretch.x * 0.45, 12, dt);
      state.stretch.y = damp(state.stretch.y, soft.stretch.y * 0.45, 12, dt);
      state.dragging = true;
    }
  }

  private updatePinch(
    soft: SoftBodyState,
    active: PointerState[],
    dt: number,
    cfg: SoftBodyPhysicsConfig,
  ): void {
    if (active.length < 2) {
      this.pinchStart = null;
      this.pinchPointerIds = "";
      const k = 90 * cfg.springK;
      const c = 12 * cfg.damping;
      const acc = -soft.pinchStrength * k - soft.pinchVelocity * c;
      soft.pinchVelocity += acc * dt;
      soft.pinchStrength = clamp(soft.pinchStrength + soft.pinchVelocity * dt, -1.2, 1.2);
      soft.pinchDistance = damp(soft.pinchDistance, 0, 10, dt);
      return;
    }

    const a = active[0];
    const b = active[1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    soft.pinchAxis.set(dx / dist, dy / dist);

    const pairKey = `${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;
    if (this.pinchPointerIds !== pairKey || this.pinchStart == null) {
      this.pinchPointerIds = pairKey;
      this.pinchStart = dist;
    }

    const delta = dist - soft.pinchDistance;
    soft.pinchVelocity = delta / Math.max(dt, 1e-4);
    soft.pinchDistance = dist;

    const ref = this.pinchStart;
    const pinchDelta = ref - dist; // + = pinch in
    const strength = clamp(pinchDelta / (ref * 0.45 || 1), -1, 1);
    soft.pinchStrength = damp(soft.pinchStrength, strength * cfg.pinchStrength, 14, dt);
    this.lastGestureKind = "pinch";
  }

  private updateReleaseWave(soft: SoftBodyState, dt: number, cfg: SoftBodyPhysicsConfig): void {
    if (!this.waveActive) {
      soft.releaseEnergy = damp(soft.releaseEnergy, 0, 8, dt);
      soft.releaseImpulse = damp(soft.releaseImpulse, 0, 8, dt);
      return;
    }
    this.waveTime += dt;
    soft.releaseEnergy *= Math.exp(-cfg.releaseWaveSpeed * 0.35 * dt);
    soft.releaseImpulse *= Math.exp(-cfg.releaseWaveSpeed * 0.5 * dt);
    if (soft.releaseEnergy < 0.02) {
      this.waveActive = false;
      soft.releaseEnergy = 0;
      soft.releaseImpulse = 0;
    }
  }

  /**
   * Ear grab: local stretch + tilt springs, independent of body pose.
   * Body only receives a mild follow via rotation targets elsewhere.
   */
  private updateEarPose(soft: SoftBodyState, state: GameState, dt: number): void {
    const rotCfg = this.rotConfig;
    const lock = soft.lockRegion;
    const isEar = lock === "left-ear" || lock === "right-ear";
    soft.earGrabSide = lock === "left-ear" ? -1 : lock === "right-ear" ? 1 : 0;

    // Local ear stretch target follows body stretch only while grabbing an ear.
    let tx = 0;
    let ty = 0;
    let tiltT = 0;
    if (isEar && soft.isPressed) {
      const amt = clamp(soft.stretchAmount, 0, 1.15);
      tx = soft.stretch.x * 1.15;
      ty = soft.stretch.y * 0.95;
      // Tilt ear toward pull direction (local Z rotation).
      tiltT = clamp(soft.stretch.x * soft.earGrabSide * -1.6, -1, 1) * rotCfg.maxEarTilt;
      // Pulling up/down also pitches the ear slightly via Y stretch → less Z tilt.
      if (Math.abs(soft.stretch.y) > Math.abs(soft.stretch.x)) {
        tiltT = clamp(soft.stretch.y * 0.35, -1, 1) * rotCfg.maxEarTilt * soft.earGrabSide;
      }
      void amt;
    }

    const kE = rotCfg.earStretchSpring;
    const cE = rotCfg.earStretchDamping;
    soft.earStretchVel.x += ((tx - soft.earStretch.x) * kE - soft.earStretchVel.x * cE) * dt;
    soft.earStretchVel.y += ((ty - soft.earStretch.y) * kE - soft.earStretchVel.y * cE) * dt;
    soft.earStretch.x += soft.earStretchVel.x * dt;
    soft.earStretch.y += soft.earStretchVel.y * dt;
    soft.earStretch.x = clamp(soft.earStretch.x, -1.4, 1.4);
    soft.earStretch.y = clamp(soft.earStretch.y, -1.4, 1.4);

    const kT = rotCfg.earTiltSpring;
    const cT = rotCfg.earTiltDamping;
    soft.earTiltVel += ((tiltT - soft.earTilt) * kT - soft.earTiltVel * cT) * dt;
    soft.earTilt += soft.earTiltVel * dt;
    soft.earTilt = clamp(soft.earTilt, -rotCfg.maxEarTilt * 1.25, rotCfg.maxEarTilt * 1.25);
    soft.earTiltVel = clamp(soft.earTiltVel, -10, 10);

    // When not grabbing, keep side at 0 after springs settle (for expression/debug).
    if (!isEar && Math.abs(soft.earStretch.x) < 0.01 && Math.abs(soft.earTilt) < 0.01) {
      soft.earGrabSide = 0;
    }
    void state;
  }

  /**
   * Unified body force result → scale + positionOffset from the same field.
   * Rotation targets are computed in updateRotation from the same sources
   * (pressureCenter / stretch / pinch) so pose stays coherent.
   */
  private composeBodyForce(
    soft: SoftBodyState,
    state: GameState,
    cfg: SoftBodyPhysicsConfig,
    dt: number,
  ): void {
    const left = soft.pressureField["left-cheek"] + soft.pressureField["left-ear"] * 0.5;
    const right = soft.pressureField["right-cheek"] + soft.pressureField["right-ear"] * 0.5;
    const top = soft.pressureField.top;
    const belly = soft.pressureField.belly;
    const mouth = soft.pressureField.mouth;
    const avg = (left + right + top + belly + mouth) / 5;

    const pinchIn = Math.max(soft.pinchStrength, 0);
    const pinchOut = Math.max(-soft.pinchStrength, 0);
    // Local dents carry the "press" feel — whole-body squash stays subtle.
    const targetSquash = clamp(avg * 0.22 + pinchIn * 0.28, 0, 0.65);
    const home = soft.isPressed ? 12 : 22;
    soft.squash = damp(soft.squash, targetSquash, home, dt);

    const axisHorizontal = Math.abs(soft.pinchAxis.x) >= Math.abs(soft.pinchAxis.y);
    let sx = 1 - avg * 0.03;
    let sy = 1 - avg * 0.015;
    let sz = 1 - avg * 0.015;

    if (Math.abs(soft.pinchStrength) > 0.01) {
      if (axisHorizontal) {
        sx *= 1 - pinchIn * cfg.pinchStrength + pinchOut * cfg.pinchStrength * 0.55;
        sy *= 1 + pinchIn * cfg.pinchBulge + pinchOut * 0.05;
        sz *= 1 + pinchIn * cfg.pinchBulge * 0.35;
      } else {
        sy *= 1 - pinchIn * cfg.pinchStrength + pinchOut * cfg.pinchStrength * 0.55;
        sx *= 1 + pinchIn * cfg.pinchBulge + pinchOut * 0.05;
        sz *= 1 + pinchIn * cfg.pinchBulge * 0.35;
      }
    }

    if (soft.stretchAmount > 0.01) {
      const s = soft.stretchAmount;
      sx += Math.abs(soft.stretch.x) * 0.22;
      sy += Math.abs(soft.stretch.y) * 0.18;
      sx -= s * 0.04;
      sy -= s * 0.03;
    }

    if (soft.releaseEnergy > 0.02) {
      const w = soft.releaseEnergy * 0.08;
      sx += w;
      sy += w * 0.6;
      sz += w * 0.4;
    }

    const scaleHome = soft.isPressed ? 16 : 26;
    soft.scale.x = damp(soft.scale.x, clamp(sx, 0.72, 1.4), scaleHome, dt);
    soft.scale.y = damp(soft.scale.y, clamp(sy, 0.72, 1.4), scaleHome, dt);
    soft.scale.z = damp(soft.scale.z, clamp(sz, 0.72, 1.4), scaleHome, dt);

    // Position: stretch pull + slight pressure-center lean (unified with rotation sources).
    const follow = this.rotConfig.stretchPositionFollow;
    const pullX = soft.stretch.x * (cfg.bodyPull + follow);
    const pullY = soft.stretch.y * (cfg.bodyPull + follow);
    // Ear grab: body barely moves; ear does the work.
    const earDamp = soft.earGrabSide !== 0 ? 0.35 : 1;
    const pressLeanX = soft.pressureCenter.x * soft.localPressure * 0.025;
    const targetX = pullX * earDamp + pressLeanX;
    const targetY = pullY * earDamp;
    soft.positionOffset.x = damp(soft.positionOffset.x, targetX, soft.isPressed ? 12 : 22, dt);
    soft.positionOffset.y = damp(soft.positionOffset.y, targetY, soft.isPressed ? 12 : 22, dt);
    soft.positionOffset.z = 0;

    // Legacy offset mirrors pose for any leftover consumers.
    soft.rotationOffset.x = soft.rotation.z;
    soft.rotationOffset.y = soft.rotation.x;
  }

  /**
   * Unified pose target + spring-damper.
   * Coordinate notes (body faces +Z / camera, +X = viewer right, +Y up):
   * - rotation.z > 0 tips top toward viewer left
   * - rotation.x > 0 tips top toward camera (lean back)
   * Press left cheek → lean right → rotation.z < 0.
   */
  /** Surface petting ripple + intensity decay. */
  private updatePet(soft: SoftBodyState, dt: number): void {
    if (!soft.isPressed) {
      soft.isPetting = false;
      soft.petStrength = damp(soft.petStrength, 0, 8, dt);
      soft.petWave = damp(soft.petWave, 0, 8, dt);
      if (soft.petStrength < 0.01) soft.petStrength = 0;
      if (soft.petWave < 0.01) soft.petWave = 0;
      return;
    }
    if (soft.isPetting) {
      // Expanding ring loops while rubbing.
      soft.petWave += dt * 1.7;
      if (soft.petWave > 1) soft.petWave -= 1;
    } else {
      soft.petStrength = damp(soft.petStrength, 0, 6, dt);
      soft.petWave = damp(soft.petWave, 0, 6, dt);
    }
    soft.petStrength = clamp(soft.petStrength, 0, 1);
  }

  private updateRotation(soft: SoftBodyState, state: GameState, dt: number): void {
    const rot = soft.rotation;
    const rotCfg = this.rotConfig;
    const amp = state.reduceMotion ? 0.4 : 1;

    // Weighted pressure center from field.
    let px = 0;
    let py = 0;
    let wsum = 0;
    for (const region of PRESSURE_REGIONS) {
      const p = soft.pressureField[region];
      if (p < 0.01) continue;
      const d = REGION_DIRS[region];
      px += d.x * p;
      py += d.y * p;
      wsum += p;
    }
    if (wsum > 0.02) {
      soft.pressureCenter.set(px / wsum, py / wsum, 0);
    } else {
      soft.pressureCenter.x = damp(soft.pressureCenter.x, 0, 10, dt);
      soft.pressureCenter.y = damp(soft.pressureCenter.y, 0, 10, dt);
      soft.pressureCenter.z = 0;
    }

    const p = soft.localPressure;
    const pc = soft.pressureCenter;
    let tX = 0;
    let tY = 0;
    let tZ = 0;

    // Pressure: lean away from contact (left press → +x center → tip right → z < 0).
    tZ += pc.x * p * rotCfg.pressureRotationFactor * amp;
    tX += -pc.y * p * rotCfg.pressureRotationFactor * 0.65 * amp;

    // Stretch / drag direction drives pose more strongly than pressure.
    const sx = soft.stretch.x;
    const sy = soft.stretch.y;
    const earBodyMul = soft.earGrabSide !== 0 ? 0.45 : 1;
    tZ += sx * rotCfg.stretchRotationFactor * earBodyMul * amp;
    tX += sy * rotCfg.stretchRotationFactor * 0.75 * earBodyMul * amp;

    // Ear pulls: body follows lightly; local ear pose is primary (updateEarPose).
    if (isEarRegion(soft.lockRegion) && soft.stretchAmount > 0.05) {
      tZ += sx * rotCfg.earRotationFactor * 0.55 * amp;
      tX += sy * rotCfg.earRotationFactor * 0.3 * amp;
    }

    // Pinch: only a subtle pose assist (deformation stays primary).
    const ps = soft.pinchStrength;
    if (Math.abs(ps) > 0.02) {
      const axisH = Math.abs(soft.pinchAxis.x) >= Math.abs(soft.pinchAxis.y);
      const kick = clamp(soft.pinchVelocity * rotCfg.velocityRotationFactor, -0.08, 0.08);
      if (axisH) {
        tZ += kick * rotCfg.pinchRotationFactor * 8 * amp;
        tY += (soft.pressureField["right-cheek"] - soft.pressureField["left-cheek"]) * 0.02 * amp;
      } else {
        tX += kick * rotCfg.pinchRotationFactor * 8 * amp;
      }
    }

    if (Math.abs(soft.pressureVelocity) > 1.5) {
      const impulse = clamp(soft.pressureVelocity * rotCfg.velocityRotationFactor * 0.5, -0.04, 0.04);
      tZ += pc.x * impulse * amp;
      tX += -pc.y * impulse * amp;
    }

    rot.targetX = clamp(tX, -rotCfg.maxRotationX, rotCfg.maxRotationX);
    rot.targetY = clamp(tY, -rotCfg.maxRotationY, rotCfg.maxRotationY);
    rot.targetZ = clamp(tZ, -rotCfg.maxRotationZ, rotCfg.maxRotationZ);

    // Spring-damper toward target (release impulse lives in velocity).
    const k = rotCfg.rotationSpring;
    const c = rotCfg.rotationDamping;
    rot.velX += ((rot.targetX - rot.x) * k - rot.velX * c) * dt;
    rot.velY += ((rot.targetY - rot.y) * k - rot.velY * c) * dt;
    rot.velZ += ((rot.targetZ - rot.z) * k - rot.velZ * c) * dt;
    rot.x += rot.velX * dt;
    rot.y += rot.velY * dt;
    rot.z += rot.velZ * dt;

    const maxV = rotCfg.maxReleaseRotationVelocity;
    rot.velX = clamp(rot.velX, -maxV, maxV);
    rot.velY = clamp(rot.velY, -maxV, maxV);
    rot.velZ = clamp(rot.velZ, -maxV, maxV);
    rot.x = clamp(rot.x, -rotCfg.maxRotationX * 1.35, rotCfg.maxRotationX * 1.35);
    rot.y = clamp(rot.y, -rotCfg.maxRotationY * 1.35, rotCfg.maxRotationY * 1.35);
    rot.z = clamp(rot.z, -rotCfg.maxRotationZ * 1.35, rotCfg.maxRotationZ * 1.35);
  }

  getFps(): number {
    return this.fpsEma;
  }

  getReleaseVelocity(): number {
    return this.releaseVel;
  }

  getLastGestureKind(): InteractionKind {
    return this.lastGestureKind;
  }

  isWaveActive(): boolean {
    return this.waveActive;
  }

  getWaveTime(): number {
    return this.waveTime;
  }
}
