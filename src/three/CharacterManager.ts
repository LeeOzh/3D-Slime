import * as THREE from "three";
import { RADIUS } from "../core/constants";
import { PERF } from "../core/perf";
import type { CharacterDef, GameState, ShapeKind } from "../core/types";

interface ShapeResult {
  sxz: number;
  sy: number;
  bump: number;
}

export class CharacterManager {
  readonly slime: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  readonly faceMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly caramelCap: THREE.Mesh;
  readonly qiankunRing: THREE.Mesh;
  readonly bunL: THREE.Mesh;
  readonly bunR: THREE.Mesh;

  readonly rest: Float32Array;
  readonly restShaped: Float32Array;
  readonly vertexCount: number;

  private readonly faceCanvas: HTMLCanvasElement;
  private readonly faceCtx: CanvasRenderingContext2D;
  readonly faceTex: THREE.CanvasTexture;

  constructor(scene: THREE.Scene, state: GameState) {
    const geo = new THREE.SphereGeometry(RADIUS, PERF.sphereSegments, PERF.sphereSegments);
    const posAttr = geo.attributes.position;
    this.vertexCount = posAttr.count;
    this.rest = new Float32Array(posAttr.array as ArrayLike<number>);
    this.restShaped = new Float32Array(this.rest.length);

    // Transmission + clearcoat + sheen tank mobile FPS — use a cheaper jelly look there.
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(state.character.color),
      roughness: PERF.useTransmission ? 0.22 : 0.38,
      metalness: 0,
      transmission: PERF.useTransmission ? 0.72 : 0,
      thickness: PERF.useTransmission ? 1.85 : 0,
      ior: 1.36,
      attenuationColor: new THREE.Color(state.character.atten),
      attenuationDistance: PERF.useTransmission ? 0.9 : 0,
      clearcoat: PERF.useClearcoat ? 0.35 : 0,
      clearcoatRoughness: 0.35,
      sheen: PERF.useSheen ? 0.45 : 0,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color("#ffffff"),
      envMapIntensity: PERF.useTransmission ? 1.0 : 0.65,
      specularIntensity: 0.85,
      // Fake translucency without transmission pass.
      transparent: !PERF.useTransmission,
      opacity: PERF.useTransmission ? 1 : 0.94,
    });

    this.slime = new THREE.Mesh(geo, material);
    scene.add(this.slime);

    const capGeo = new THREE.SphereGeometry(
      RADIUS * 1.02,
      PERF.capSegments,
      Math.max(12, PERF.capSegments * 0.65),
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.38,
    );
    const capMat = new THREE.MeshPhysicalMaterial({
      color: "#C47A2C",
      roughness: 0.35,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
      transparent: true,
      opacity: 0.92,
    });
    this.caramelCap = new THREE.Mesh(capGeo, capMat);
    this.caramelCap.visible = false;
    scene.add(this.caramelCap);

    const ringGeo = new THREE.TorusGeometry(0.72, 0.07, 16, 48);
    const ringMat = new THREE.MeshPhysicalMaterial({
      color: "#F5C542",
      metalness: 0.85,
      roughness: 0.25,
      clearcoat: 0.6,
      envMapIntensity: 1.3,
    });
    this.qiankunRing = new THREE.Mesh(ringGeo, ringMat);
    this.qiankunRing.visible = false;
    this.qiankunRing.rotation.x = Math.PI / 2;
    scene.add(this.qiankunRing);

    const bunGeo = new THREE.SphereGeometry(0.26, 24, 24);
    const bunMat = new THREE.MeshPhysicalMaterial({
      color: "#1C1917",
      roughness: 0.45,
      clearcoat: 0.3,
    });
    this.bunL = new THREE.Mesh(bunGeo, bunMat);
    this.bunR = new THREE.Mesh(bunGeo, bunMat);
    this.bunL.visible = this.bunR.visible = false;
    scene.add(this.bunL, this.bunR);

    this.faceCanvas = document.createElement("canvas");
    this.faceCanvas.width = this.faceCanvas.height = PERF.faceCanvasSize;
    this.faceCtx = this.faceCanvas.getContext("2d")!;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.anisotropy = 4;

    const faceMat = new THREE.MeshBasicMaterial({
      map: this.faceTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    faceMat.depthTest = false;
    this.faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), faceMat);
    this.faceMesh.position.set(0, 0.05, RADIUS * 0.95);
    this.faceMesh.renderOrder = 3;
    this.slime.add(this.faceMesh);
  }

  get material(): THREE.MeshPhysicalMaterial {
    return this.slime.material;
  }

  get geometry(): THREE.SphereGeometry {
    return this.slime.geometry;
  }

  get positionAttr(): THREE.BufferAttribute {
    return this.slime.geometry.attributes.position as THREE.BufferAttribute;
  }

  get faceContext(): CanvasRenderingContext2D {
    return this.faceCtx;
  }

  get faceCanvasEl(): HTMLCanvasElement {
    return this.faceCanvas;
  }

  shapeScale(nx: number, ny: number, nz: number, shape: ShapeKind): ShapeResult {
    const y = ny;
    switch (shape) {
      case "ball":
        return { sxz: 1, sy: 1, bump: 0 };
      case "pudding": {
        const sxz = y > 0 ? 1 - y * 0.3 : 1 + -y * 0.2;
        const sy = y > 0.5 ? 1 - (y - 0.5) * 0.35 : 1 + Math.max(0, -y) * 0.04;
        return { sxz, sy, bump: 0 };
      }
      case "drop": {
        const sxz = y > 0 ? Math.pow(1 - y, 0.55) * 0.85 + 0.15 : 1 + -y * 0.2;
        const sy = y > 0 ? 1 - y * 0.12 : 1 + -y * 0.06;
        return { sxz, sy, bump: 0 };
      }
      case "mochi": {
        const sxz = 1 + Math.max(0, -y) * 0.1 - Math.max(0, y) * 0.08;
        const sy = 1 + Math.max(0, -y) * 0.04 - Math.max(0, y) * 0.1;
        return { sxz, sy, bump: 0 };
      }
      case "ghost": {
        let bump = 0;
        if (y < -0.35) {
          const hem = (-y - 0.35) / 0.65;
          bump = Math.sin(Math.atan2(nz, nx) * 5) * 0.1 * hem - hem * 0.06;
        }
        return { sxz: 1 + Math.max(0, -y) * 0.04, sy: 1, bump };
      }
      case "cat": {
        const earL = Math.exp(-((nx + 0.55) ** 2 + (ny - 0.72) ** 2 + nz * nz) * 18);
        const earR = Math.exp(-((nx - 0.55) ** 2 + (ny - 0.72) ** 2 + nz * nz) * 18);
        const bump = (earL + earR) * 0.45;
        return {
          sxz: 1 + Math.max(0, -y) * 0.05,
          sy: 1 - y * 0.04,
          bump,
        };
      }
      case "nezha": {
        const bunL = Math.exp(-((nx + 0.38) ** 2 + (ny - 0.88) ** 2 + nz * nz) * 22);
        const bunR = Math.exp(-((nx - 0.38) ** 2 + (ny - 0.88) ** 2 + nz * nz) * 22);
        const bump = (bunL + bunR) * 0.55;
        return {
          sxz: 1 + Math.max(0, -y) * 0.08 - Math.max(0, y) * 0.04,
          sy: 1 - y * 0.06,
          bump,
        };
      }
      default:
        return { sxz: 1, sy: 1, bump: 0 };
    }
  }

  shapeRadius(nx: number, ny: number, nz: number, shape: ShapeKind): number {
    const s = this.shapeScale(nx, ny, nz, shape);
    return (s.sxz + s.sy) * 0.5 + s.bump;
  }

  rebuildRestShape(state: GameState): void {
    const shape = state.character.shape;
    for (let i = 0; i < this.rest.length; i += 3) {
      const x = this.rest[i];
      const y = this.rest[i + 1];
      const z = this.rest[i + 2];
      const rl = Math.hypot(x, y, z) || 1;
      const nx = x / rl;
      const ny = y / rl;
      const nz = z / rl;
      const s = this.shapeScale(nx, ny, nz, shape);
      const bump = 1 + s.bump;
      this.restShaped[i] = x * s.sxz * bump;
      this.restShaped[i + 1] = y * s.sy * bump;
      this.restShaped[i + 2] = z * s.sxz * bump;
    }
    const posAttr = this.positionAttr;
    (posAttr.array as Float32Array).set(this.restShaped);
    posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    state.faceDirty = true;
  }

  applyMaterialForCharacter(ch: CharacterDef): void {
    const material = this.material;
    if (!PERF.useTransmission) {
      material.transmission = 0;
      material.thickness = 0;
      material.roughness = ch.id === "nezha" ? 0.42 : ch.caramel ? 0.45 : 0.38;
      material.clearcoat = 0;
      material.needsUpdate = true;
      return;
    }
    material.transmission = ch.id === "nezha" ? 0.35 : ch.caramel ? 0.4 : ch.id === "cat" ? 0.55 : 0.7;
    material.thickness = ch.id === "nezha" ? 1.6 : 1.85;
    material.roughness = ch.id === "nezha" ? 0.26 : ch.caramel ? 0.3 : 0.22;
    material.clearcoat = ch.id === "nezha" ? 0.5 : 0.35;
  }

  setExtrasVisible(ch: CharacterDef): void {
    this.caramelCap.visible = !!ch.caramel;
    this.qiankunRing.visible = !!ch.qiankun;
    this.bunL.visible = this.bunR.visible = !!ch.qiankun;
  }
}

export function applyTint(
  state: GameState,
  baseHex: string,
  attenHex: string,
  tintIndex: number,
  tints: { name: string; mul: number; sat?: number; hueShift?: number }[],
): void {
  const tint = tints[tintIndex];
  const c = new THREE.Color(baseHex);
  const a = new THREE.Color(attenHex);
  if (tint.hueShift !== undefined) {
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL((hsl.h + tint.hueShift + 1) % 1, hsl.s, hsl.l);
    a.getHSL(hsl);
    a.setHSL((hsl.h + tint.hueShift + 1) % 1, hsl.s, hsl.l);
  }
  if (tint.sat !== undefined) {
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h, Math.min(1, hsl.s * tint.sat), hsl.l);
  }
  c.multiplyScalar(tint.mul);
  a.multiplyScalar(tint.mul);
  state.targetColor.copy(c);
  state.targetAtten.copy(a);
}
