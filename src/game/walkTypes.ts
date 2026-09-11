import type * as THREE from "three";
import { PERF } from "../core/perf";

export type StageMode = "squish" | "walk";

export type WalkSceneId = "forest" | "meadow" | "kitchen" | "cloud";

export interface WalkSceneDef {
  id: WalkSceneId;
  name: string;
  accent: string;
}

export const ALL_WALK_SCENES: WalkSceneDef[] = [
  { id: "forest", name: "森林小径", accent: "#7BC47F" },
  { id: "meadow", name: "软糖草地", accent: "#8FD9A8" },
  { id: "kitchen", name: "果冻厨房", accent: "#E8B86D" },
  { id: "cloud", name: "云上小岛", accent: "#9EC9F5" },
];

/** Mobile: forest only. PC: full list. */
export function listWalkScenes(): WalkSceneDef[] {
  if (PERF.isMobile) return ALL_WALK_SCENES.filter((s) => s.id === "forest");
  return ALL_WALK_SCENES;
}

export function defaultWalkSceneId(): WalkSceneId {
  return PERF.isMobile ? "forest" : "meadow";
}

export interface WalkBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WalkSceneContent {
  root: THREE.Group;
  bounds: WalkBounds;
  groundY: number;
  update?: (charZ: number) => void;
  dispose: () => void;
}
