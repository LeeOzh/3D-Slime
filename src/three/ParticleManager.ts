import * as THREE from "three";
import { PERF } from "../core/perf";
import type { ParticleType } from "../core/types";

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  spin: number;
  type: ParticleType;
}

const POOL_SIZE = PERF.particlePool;

/**
 * Pooled particles (shared geometry). Types tint motion/scale slightly.
 * Press = small burst at hit; release = wider soft scatter; combo = a few extra.
 */
export class ParticleManager {
  private readonly particles: Particle[] = [];
  private enabled = true;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.032, 6, 6);
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.7,
        spin: 0,
        type: "star",
      });
    }
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) {
      for (const p of this.particles) {
        p.life = 0;
        p.mesh.visible = false;
      }
    }
  }

  spawn(
    at: THREE.Vector3,
    strength: number,
    color: THREE.Color,
    reduceMotion: boolean,
    type: ParticleType = "star",
    comboLevel = 0,
  ): void {
    if (!this.enabled || reduceMotion) return;
    const base = Math.floor(strength * 5) + 2;
    const extra = Math.floor(comboLevel * 4);
    const count = Math.min(10, base + extra);
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= count) break;
      if (p.life > 0) continue;
      this.initParticle(p, at, strength, color, type, false);
      spawned++;
    }
  }

  spawnRelease(
    at: THREE.Vector3,
    strength: number,
    color: THREE.Color,
    reduceMotion: boolean,
    type: ParticleType = "star",
  ): void {
    if (!this.enabled || reduceMotion) return;
    const count = Math.min(8, Math.floor(strength * 4) + 2);
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= count) break;
      if (p.life > 0) continue;
      this.initParticle(p, at, strength, color, type, true);
      spawned++;
    }
  }

  private initParticle(
    p: Particle,
    at: THREE.Vector3,
    strength: number,
    color: THREE.Color,
    type: ParticleType,
    release: boolean,
  ): void {
    p.life = p.maxLife = release ? 0.85 : 0.65;
    p.type = type;
    p.mesh.visible = true;
    p.mesh.position.copy(at);
    const mat = p.mesh.material as THREE.MeshBasicMaterial;
    mat.color.copy(color);
    // Slight lighten for sparkle feel
    mat.color.lerp(new THREE.Color(0xffffff), type === "spark" || type === "star" ? 0.25 : 0.1);
    mat.opacity = 0.9;
    const scaleBase =
      type === "bubble" ? 0.9 : type === "heart" ? 0.75 : type === "dust" ? 0.45 : type === "energy" ? 0.85 : 0.6;
    p.mesh.scale.setScalar(scaleBase + Math.random() * 0.5);
    p.spin = (Math.random() - 0.5) * 8;

    const spread = release ? 1.6 : 1.1;
    p.vel
      .set((Math.random() - 0.5) * 2, Math.random() * (release ? 1.1 : 1.5) + 0.35, (Math.random() - 0.5) * 2)
      .normalize()
      .multiplyScalar((0.9 + strength * 1.6 + Math.random() * 0.6) * spread);

    // Type-specific tweaks
    if (type === "bubble") {
      p.vel.y = Math.abs(p.vel.y) * 0.6 + 0.4;
      p.vel.multiplyScalar(0.7);
    } else if (type === "dust") {
      p.vel.multiplyScalar(0.55);
      p.vel.y *= 0.4;
    } else if (type === "spark") {
      p.vel.multiplyScalar(1.35);
    } else if (type === "heart") {
      p.vel.y *= 0.7;
    }
  }

  update(dt: number, color: THREE.Color): void {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const isBubble = p.type === "bubble";
      p.vel.y += (isBubble ? 0.85 : -4.2) * dt;
      p.vel.multiplyScalar(1 - Math.min(dt * 1.8, 0.15));
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.z += p.spin * dt;
      const lifeT = Math.max(p.life / p.maxLife, 0);
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = lifeT * 0.85;
      // Keep hue near character color but don't fight white-lerp too hard.
      mat.color.lerp(color, Math.min(dt * 4, 1));
      const s = p.mesh.scale.x;
      p.mesh.scale.setScalar(Math.max(0.05, s * (1 - dt * 0.6)));
      if (p.life <= 0) p.mesh.visible = false;
    }
  }
}
