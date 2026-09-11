import * as THREE from "three";
import type { WalkSceneContent, WalkSceneId } from "../../game/walkTypes";
import { buildWalkScene } from "./WalkScenes";

/**
 * Holds walk-mode scenery. Character mesh stays in the main scene;
 * this group is toggled and the character root is repositioned onto the ground.
 */
export class WalkStage {
  private content: WalkSceneContent | null = null;
  private sceneId: WalkSceneId | null = null;
  readonly group = new THREE.Group();
  private loaded = false;

  constructor(scene: THREE.Scene) {
    this.group.visible = false;
    scene.add(this.group);
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  get currentId(): WalkSceneId | null {
    return this.sceneId;
  }

  get bounds() {
    return this.content?.bounds ?? { minX: -6, maxX: 6, minZ: -6, maxZ: 6 };
  }

  get groundY(): number {
    return this.content?.groundY ?? 0;
  }

  ensure(id: WalkSceneId): void {
    if (this.loaded && this.sceneId === id) return;
    this.unload();
    this.content = buildWalkScene(id);
    this.group.add(this.content.root);
    this.sceneId = id;
    this.loaded = true;
  }

  setEnabled(on: boolean): void {
    this.group.visible = on;
  }

  private unload(): void {
    if (!this.content) return;
    this.group.remove(this.content.root);
    this.content.dispose();
    this.content = null;
    this.loaded = false;
  }
}
