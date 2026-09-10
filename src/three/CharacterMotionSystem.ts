import type * as THREE from "three";
import type { CharacterDef, GameState } from "../core/types";

/** Springs, blink, idle expression timeout — ported from legacy updateSlime physics block. */
export class CharacterMotionSystem {
  update(dt: number, state: GameState, character: CharacterDef): void {
    // color lerp
    state.color.lerp(state.targetColor, 1 - Math.exp(-6 * dt));
    state.atten.lerp(state.targetAtten, 1 - Math.exp(-6 * dt));

    const pers = character.personality;
    const springK = pers.springK ?? 1;
    const damping = pers.damping ?? 1;

    // press spring
    {
      const target = state.pressTarget;
      const k = (state.pressing ? 220 : 160) * springK;
      const c = (state.pressing ? 22 : 10) * damping;
      const acc = (target - state.pressStrength) * k - state.pressVel * c;
      state.pressVel += acc * dt;
      state.pressStrength += state.pressVel * dt;
      state.pressStrength = Math.min(1.15, Math.max(0, state.pressStrength));
    }

    state.dragVec.lerp(state.dragTarget, 1 - Math.exp(-10 * dt));
    state.lean.x += (state.leanTarget.x - state.lean.x) * (1 - Math.exp(-8 * dt));
    state.lean.y += (state.leanTarget.y - state.lean.y) * (1 - Math.exp(-8 * dt));

    {
      const target = state.pressing ? state.pressStrength * 0.42 : 0;
      const k = (state.pressing ? 200 : 140) * springK;
      const c = (state.pressing ? 18 : 7.5) * damping;
      const acc = (target - state.squash) * k - state.squashVel * c;
      state.squashVel += acc * dt;
      state.squash += state.squashVel * dt;
    }

    {
      const k = (state.dragging ? 180 : 120) * springK;
      const c = (state.dragging ? 16 : 6.5) * damping;
      state.stretchVel.x += ((state.dragVec.x - state.stretch.x) * k - state.stretchVel.x * c) * dt;
      state.stretchVel.y += ((state.dragVec.y - state.stretch.y) * k - state.stretchVel.y * c) * dt;
      state.stretchVel.z += ((state.dragVec.z - state.stretch.z) * k - state.stretchVel.z * c) * dt;
      state.stretch.addScaledVector(state.stretchVel, dt);
    }

    {
      const acc = -state.wobble * 90 - state.wobbleVel * 8 * damping;
      state.wobbleVel += acc * dt;
      state.wobble += state.wobbleVel * dt;
    }
    {
      const acc = -state.happyBounce * 120 - state.happyVel * 7 * damping;
      state.happyVel += acc * dt;
      state.happyBounce += state.happyVel * dt;
    }

    // Secondary motion springs — softer / slower than primary lean so they lag behind.
    if (!state.reduceMotion) {
      // Ear lag: delayed follow of leanTarget (plus impulse from release).
      {
        const k = 48;
        const c = 7.5;
        const tx = state.leanTarget.x * 0.85;
        const ty = state.leanTarget.y * 0.85;
        state.earLagVel.x += ((tx - state.earLag.x) * k - state.earLagVel.x * c) * dt;
        state.earLagVel.y += ((ty - state.earLag.y) * k - state.earLagVel.y * c) * dt;
        state.earLag.x += state.earLagVel.x * dt;
        state.earLag.y += state.earLagVel.y * dt;
      }
      // Head lag: even slower, slightly smaller amplitude.
      {
        const k = 36;
        const c = 6.5;
        const tx = state.leanTarget.x * 0.55;
        const ty = state.leanTarget.y * 0.55;
        state.headLagVel.x += ((tx - state.headLag.x) * k - state.headLagVel.x * c) * dt;
        state.headLagVel.y += ((ty - state.headLag.y) * k - state.headLagVel.y * c) * dt;
        state.headLag.x += state.headLagVel.x * dt;
        state.headLag.y += state.headLagVel.y * dt;
      }
      // Opposite-side compensation settles back to 0.
      {
        const acc = -state.sideComp * 55 - state.sideCompVel * 9;
        state.sideCompVel += acc * dt;
        state.sideComp += state.sideCompVel * dt;
      }
    } else {
      state.earLag.set(0, 0);
      state.earLagVel.set(0, 0);
      state.headLag.set(0, 0);
      state.headLagVel.set(0, 0);
      state.sideComp = 0;
      state.sideCompVel = 0;
    }

    // Keep unified SquishState.pressure in sync with the press spring.
    state.squish.pressure = Math.min(state.pressStrength, 1);
    state.squish.isPressing = state.pressing;

    if (character.face.blink && !state.reduceMotion) {
      state.nextBlink -= dt;
      if (state.nextBlink <= 0) {
        state.blink = 0;
        state.faceDirty = true;
        state.nextBlink = 2.2 + Math.random() * 3.5;
      }
      if (state.blink < 1) {
        state.blink = Math.min(1, state.blink + dt * 8);
        state.faceDirty = true;
      }
    }
  }

  applyToMesh(
    slime: THREE.Object3D,
    shadow: THREE.Mesh,
    state: GameState,
  ): void {
    const stretchLen = state.stretch.length();
    const shadowScale = 1 + state.squash * 0.35 + stretchLen * 0.4;
    shadow.scale.set(shadowScale, shadowScale, 1);
    const shadowMat = Array.isArray(shadow.material) ? shadow.material[0] : shadow.material;
    (shadowMat as THREE.MeshBasicMaterial).opacity = 0.85 + state.squash * 0.2;
    slime.rotation.x = -state.lean.y * 0.35;
    slime.rotation.z = -state.lean.x * 0.25;
    slime.position.y = state.happyBounce * 0.18;
  }
}
