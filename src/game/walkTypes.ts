import * as THREE from "three";

export type StageMode = "squish" | "walk";

export type WalkSceneId = "meadow" | "kitchen" | "cloud";

export interface WalkSceneDef {
  id: WalkSceneId;
  name: string;
  /** Soft pastel chip color for the UI. */
  accent: string;
}

export const WALK_SCENES: WalkSceneDef[] = [
  { id: "meadow", name: "软糖草地", accent: "#8FD9A8" },
  { id: "kitchen", name: "果冻厨房", accent: "#E8B86D" },
  { id: "cloud", name: "云上小岛", accent: "#9EC9F5" },
];

export interface WalkBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WalkSceneContent {
  root: THREE.Group;
  bounds: WalkBounds;
  /** Ground Y for the character feet/center offset. */
  groundY: number;
  dispose: () => void;
}
