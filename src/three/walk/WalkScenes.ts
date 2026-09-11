import * as THREE from "three";
import type { WalkSceneContent, WalkSceneId } from "../../game/walkTypes";

function jellyMat(color: string, opacity = 0.92): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.35,
    metalness: 0,
    transparent: opacity < 1,
    opacity,
    clearcoat: 0.4,
    clearcoatRoughness: 0.3,
    envMapIntensity: 0.8,
  });
}

function softMat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.75,
    metalness: 0,
    envMapIntensity: 0.55,
  });
}

/** 主场景：软糖草地 · 浮岛小径 */
function buildMeadow(): WalkSceneContent {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Island ground — rounded soft disc
  const groundGeo = track(new THREE.CircleGeometry(9, 48));
  const groundMat = track(softMat("#B8E6C8"));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = false;
  root.add(ground);

  // Path stones
  const stoneGeo = track(new THREE.CylinderGeometry(0.55, 0.65, 0.12, 10));
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const x = Math.sin(t * Math.PI * 1.2) * 2.2;
    const z = -5.5 + t * 11;
    const stone = new THREE.Mesh(stoneGeo, track(softMat(i % 2 ? "#F5D0A9" : "#F0C4D8")));
    stone.position.set(x, 0.06, z);
    root.add(stone);
  }

  // Candy rocks
  const rockGeo = track(new THREE.IcosahedronGeometry(0.55, 1));
  const rockColors = ["#FF9FBC", "#C4B5FD", "#FDE68A", "#7DD3FC"];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 4.5 + (i % 3) * 1.1;
    const rock = new THREE.Mesh(rockGeo, track(jellyMat(rockColors[i % 4], 0.88)));
    rock.position.set(Math.cos(a) * r, 0.35 + (i % 2) * 0.1, Math.sin(a) * r * 0.85);
    rock.scale.set(1 + (i % 3) * 0.15, 0.7 + (i % 2) * 0.3, 1);
    rock.rotation.y = a;
    root.add(rock);
  }

  // Lollipops
  const stickGeo = track(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6));
  const candyGeo = track(new THREE.SphereGeometry(0.38, 16, 12));
  for (const [x, z, col] of [
    [-3.2, 1.5, "#FF6B9D"],
    [3.5, -2.2, "#A78BFA"],
    [-2.4, -3.8, "#F6D06B"],
  ] as const) {
    const stick = new THREE.Mesh(stickGeo, track(softMat("#F5F0E8")));
    stick.position.set(x, 0.6, z);
    const candy = new THREE.Mesh(candyGeo, track(jellyMat(col, 0.95)));
    candy.position.set(x, 1.35, z);
    root.add(stick, candy);
  }

  // Clouds
  const cloudGeo = track(new THREE.SphereGeometry(0.7, 12, 10));
  const cloudMat = track(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }));
  const clouds: THREE.Mesh[] = [];
  for (const [x, y, z, s] of [
    [-5, 4.2, -6, 1.2],
    [4, 5, -4, 0.9],
    [0, 4.6, -8, 1.4],
  ] as const) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.position.set(i * 0.55 - 0.5, (i % 2) * 0.15, 0);
      puff.scale.setScalar(s * (0.8 + i * 0.15));
      g.add(puff);
    }
    g.position.set(x, y, z);
    root.add(g);
    clouds.push(g as unknown as THREE.Mesh);
  }

  // Floating mini islands
  const miniGeo = track(new THREE.CylinderGeometry(1.1, 0.7, 0.45, 10));
  for (const [x, y, z] of [
    [-6.5, 2.2, -2],
    [6.2, 2.8, 1.5],
  ] as const) {
    const mini = new THREE.Mesh(miniGeo, track(softMat("#D8F0E0")));
    mini.position.set(x, y, z);
    root.add(mini);
  }

  const t0 = performance.now();
  return {
    root,
    bounds: { minX: -7.5, maxX: 7.5, minZ: -7.5, maxZ: 7.5 },
    groundY: 0,
    dispose: () => {
      root.clear();
      for (const d of disposables) d.dispose();
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...( { tick: (now: number) => {
      const t = (now - t0) / 1000;
      for (let i = 0; i < clouds.length; i++) {
        clouds[i].position.y += Math.sin(t * 0.6 + i) * 0.002;
      }
    } } as any),
  };
}

/** 备选：果冻厨房台面 */
function buildKitchen(): WalkSceneContent {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const table = new THREE.Mesh(
    track(new THREE.BoxGeometry(16, 0.4, 12)),
    track(softMat("#E8C4A0")),
  );
  table.position.y = -0.2;
  root.add(table);

  // Cutting board
  const board = new THREE.Mesh(
    track(new THREE.BoxGeometry(4.5, 0.12, 3)),
    track(softMat("#D4A574")),
  );
  board.position.set(0, 0.06, 1);
  root.add(board);

  // Giant spoon
  const spoonHandle = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 8)),
    track(softMat("#F5E6D3")),
  );
  spoonHandle.rotation.z = Math.PI / 2.4;
  spoonHandle.position.set(-4.5, 0.5, -2);
  const spoonBowl = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.7, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
    track(softMat("#F5E6D3")),
  );
  spoonBowl.rotation.x = Math.PI;
  spoonBowl.position.set(-5.8, 0.55, -2);
  root.add(spoonHandle, spoonBowl);

  // Bowl of jelly cubes
  const bowl = new THREE.Mesh(
    track(new THREE.SphereGeometry(1.4, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)),
    track(jellyMat("#F8F4FF", 0.7)),
  );
  bowl.position.set(4.2, 1.35, -1.5);
  root.add(bowl);
  const cubeGeo = track(new THREE.BoxGeometry(0.45, 0.45, 0.45));
  for (let i = 0; i < 6; i++) {
    const cube = new THREE.Mesh(cubeGeo, track(jellyMat(["#FF9FBC", "#A78BFA", "#FDE68A"][i % 3], 0.9)));
    cube.position.set(4.2 + (i % 3) * 0.35 - 0.35, 0.9 + Math.floor(i / 3) * 0.4, -1.5 + (i % 2) * 0.3);
    cube.rotation.y = i;
    root.add(cube);
  }

  // Fruit
  const fruitGeo = track(new THREE.SphereGeometry(0.45, 12, 10));
  for (const [x, z, col] of [
    [-2.5, 3, "#FF6B6B"],
    [-1.8, 3.4, "#FF9F43"],
    [2.8, 3.2, "#A78BFA"],
  ] as const) {
    const f = new THREE.Mesh(fruitGeo, track(jellyMat(col, 0.95)));
    f.position.set(x, 0.45, z);
    root.add(f);
  }

  return {
    root,
    bounds: { minX: -6.5, maxX: 6.5, minZ: -4.5, maxZ: 4.5 },
    groundY: 0,
    dispose: () => {
      root.clear();
      for (const d of disposables) d.dispose();
    },
  };
}

/** 备选：云上小岛 */
function buildCloud(): WalkSceneContent {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const island = new THREE.Mesh(
    track(new THREE.CylinderGeometry(6.5, 4.2, 1.2, 24)),
    track(softMat("#E8F4FF")),
  );
  island.position.y = -0.6;
  root.add(island);

  const grass = new THREE.Mesh(
    track(new THREE.CircleGeometry(6.4, 32)),
    track(softMat("#C5E8F5")),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0.02;
  root.add(grass);

  // Bridge planks toward void (visual only)
  const plankGeo = track(new THREE.BoxGeometry(0.7, 0.08, 0.45));
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(plankGeo, track(softMat("#E0D0B8")));
    p.position.set(0, 0.05, 6.5 + i * 0.55);
    root.add(p);
  }

  // Cloud sea below
  const seaGeo = track(new THREE.SphereGeometry(0.9, 10, 8));
  const seaMat = track(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95 }));
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = 9 + (i % 4);
    const puff = new THREE.Mesh(seaGeo, seaMat);
    puff.position.set(Math.cos(a) * r, -2.5 - (i % 3) * 0.4, Math.sin(a) * r);
    puff.scale.setScalar(1.2 + (i % 3) * 0.4);
    root.add(puff);
  }

  // Star poles
  const poleGeo = track(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6));
  const starGeo = track(new THREE.OctahedronGeometry(0.28, 0));
  for (const [x, z] of [
    [-3, -2],
    [3.5, -1],
    [-2, 3],
  ] as const) {
    const pole = new THREE.Mesh(poleGeo, track(softMat("#FFFFFF")));
    pole.position.set(x, 0.9, z);
    const star = new THREE.Mesh(starGeo, track(jellyMat("#FFE566", 0.95)));
    star.position.set(x, 2, z);
    root.add(pole, star);
  }

  return {
    root,
    bounds: { minX: -5.5, maxX: 5.5, minZ: -5.5, maxZ: 7.5 },
    groundY: 0,
    dispose: () => {
      root.clear();
      for (const d of disposables) d.dispose();
    },
  };
}

export function buildWalkScene(id: WalkSceneId): WalkSceneContent {
  switch (id) {
    case "kitchen":
      return buildKitchen();
    case "cloud":
      return buildCloud();
    case "meadow":
    default:
      return buildMeadow();
  }
}
