import * as THREE from "three";

export class RendererManager {
  readonly renderer: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch (err) {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div style="position:fixed;left:16px;right:16px;bottom:16px;z-index:99;padding:12px 16px;border-radius:12px;background:#2B2140;color:#fff;font:14px/1.5 system-ui,sans-serif;">当前环境无法创建 WebGL，请用 Chrome / Edge / Safari 打开，并确认已开启硬件加速。</div>',
      );
      throw err;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }
}
