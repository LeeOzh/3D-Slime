import * as THREE from "three";
import type { RendererManager } from "./RendererManager";

export class SceneManager {
  readonly scene = new THREE.Scene();
  private shadow: THREE.Mesh;

  constructor(renderer: RendererManager) {
    this.scene.environment = this.makeEnvironment(renderer);

    const key = new THREE.DirectionalLight(0xfff0f5, 1.35);
    key.position.set(2.5, 3.5, 4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd4c4ff, 0.7);
    fill.position.set(-3, 1, 2);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffc0e0, 0.55);
    rim.position.set(0, -2, -3);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0xfff5fa, 0.35));

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshBasicMaterial({
        map: this.makeShadowTexture(),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = -1.4;
    this.scene.add(this.shadow);
  }

  get shadowMesh(): THREE.Mesh {
    return this.shadow;
  }

  private makeEnvironment(renderer: RendererManager): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#ffe4f0");
    g.addColorStop(0.45, "#e8d4ff");
    g.addColorStop(1, "#fff4ea");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    for (const [x, y, r, col] of [
      [80, 60, 50, "rgba(255,255,255,0.85)"],
      [190, 90, 40, "rgba(255,200,230,0.7)"],
      [130, 180, 55, "rgba(200,180,255,0.55)"],
    ] as const) {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, 256, 256);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer.renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    pmrem.dispose();
    return env;
  }

  private makeShadowTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    g.addColorStop(0, "rgba(43,33,64,0.28)");
    g.addColorStop(0.45, "rgba(43,33,64,0.14)");
    g.addColorStop(1, "rgba(43,33,64,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }
}
