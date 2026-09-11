import * as THREE from "three";

export class CameraManager {
  readonly camera: THREE.PerspectiveCamera;
  private baseZ = 5.55;
  private restFov = 35;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      this.restFov,
      window.innerWidth / window.innerHeight,
      0.1,
      80,
    );
    this.camera.position.set(0, 0.12, this.baseZ);
  }

  get restZ(): number {
    return this.baseZ;
  }

  get restFovValue(): number {
    return this.restFov;
  }

  setFov(fov: number): void {
    if (Math.abs(this.camera.fov - fov) < 0.01) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  resetFov(): void {
    this.setFov(this.restFov);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.baseZ = width < 640 ? 6.7 : width < 900 ? 6.0 : 5.55;
    this.camera.position.z = this.baseZ;
    this.camera.updateProjectionMatrix();
  }
}
