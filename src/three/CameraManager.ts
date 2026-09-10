import * as THREE from "three";

export class CameraManager {
  readonly camera: THREE.PerspectiveCamera;
  private baseZ = 5.55;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      35,
      window.innerWidth / window.innerHeight,
      0.1,
      50,
    );
    this.camera.position.set(0, 0.12, this.baseZ);
  }

  get restZ(): number {
    return this.baseZ;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.baseZ = width < 640 ? 6.7 : width < 900 ? 6.0 : 5.55;
    this.camera.position.z = this.baseZ;
    this.camera.updateProjectionMatrix();
  }
}
