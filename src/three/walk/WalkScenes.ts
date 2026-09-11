import * as THREE from "three";
import type { WalkSceneContent, WalkSceneId } from "../../game/walkTypes";

function jellyMat(color: string, opacity = 0.92): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.32,
    metalness: 0,
    transparent: opacity < 1,
    opacity,
    clearcoat: 0.45,
    clearcoatRoughness: 0.28,
    envMapIntensity: 0.85,
  });
}

function softMat(color: string, roughness = 0.78): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    envMapIntensity: 0.55,
  });
}

type Tracker = <T extends { dispose: () => void }>(x: T) => T;

function makeTracker(): { track: Tracker; list: Array<{ dispose: () => void }> } {
  const list: Array<{ dispose: () => void }> = [];
  const track = (<T extends { dispose: () => void }>(x: T) => {
    list.push(x);
    return x;
  }) as Tracker;
  return { track, list };
}

function addTree(
  root: THREE.Group,
  track: Tracker,
  x: number,
  z: number,
  trunkH: number,
  crownR: number,
  crownColor: string,
): void {
  const trunk = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.12, 0.18, trunkH, 7)),
    track(softMat("#C4A484", 0.85)),
  );
  trunk.position.set(x, trunkH / 2, z);
  const crown = new THREE.Mesh(
    track(new THREE.SphereGeometry(crownR, 14, 12)),
    track(jellyMat(crownColor, 0.95)),
  );
  crown.position.set(x, trunkH + crownR * 0.55, z);
  crown.scale.y = 1.15;
  root.add(trunk, crown);
}

function addFlower(root: THREE.Group, track: Tracker, x: number, z: number, petal: string): void {
  const stem = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.03, 0.04, 0.45, 5)),
    track(softMat("#7BC47F", 0.9)),
  );
  stem.position.set(x, 0.22, z);
  const center = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.08, 8, 6)),
    track(jellyMat("#FFE566", 1)),
  );
  center.position.set(x, 0.48, z);
  root.add(stem, center);
  const petalGeo = track(new THREE.SphereGeometry(0.09, 8, 6));
  const petalMat = track(jellyMat(petal, 0.95));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = new THREE.Mesh(petalGeo, petalMat);
    p.position.set(x + Math.cos(a) * 0.12, 0.48, z + Math.sin(a) * 0.12);
    p.scale.set(1, 0.55, 1);
    root.add(p);
  }
}

/** 主场景：软糖草地 · 浮岛小径 */
function buildMeadow(): WalkSceneContent {
  const root = new THREE.Group();
  const { track, list } = makeTracker();

  // Layered island: skirt + top
  const skirt = new THREE.Mesh(
    track(new THREE.CylinderGeometry(9.2, 6.2, 1.4, 40)),
    track(softMat("#9BC9A8", 0.9)),
  );
  skirt.position.y = -0.75;
  const ground = new THREE.Mesh(
    track(new THREE.CircleGeometry(9.1, 56)),
    track(softMat("#B8E6C8", 0.7)),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.01;
  // Inner lighter meadow pad
  const pad = new THREE.Mesh(
    track(new THREE.CircleGeometry(5.5, 40)),
    track(softMat("#C8EFD4", 0.65)),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.02;
  root.add(skirt, ground, pad);

  // Curved path of stones
  const stoneGeo = track(new THREE.CylinderGeometry(0.52, 0.62, 0.1, 12));
  const stoneMats = [track(softMat("#F5D0A9")), track(softMat("#F0C4D8")), track(softMat("#E8D5F5"))];
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const x = Math.sin(t * Math.PI * 1.6) * 2.6;
    const z = -6.2 + t * 12.4;
    const stone = new THREE.Mesh(stoneGeo, stoneMats[i % 3]);
    stone.position.set(x, 0.07, z);
    stone.rotation.y = t * 2;
    root.add(stone);
  }

  // Candy rock ring
  const rockGeo = track(new THREE.IcosahedronGeometry(0.5, 1));
  const rockColors = ["#FF9FBC", "#C4B5FD", "#FDE68A", "#7DD3FC", "#86EFAC"];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.2;
    const r = 5.2 + (i % 4) * 0.85;
    const rock = new THREE.Mesh(rockGeo, track(jellyMat(rockColors[i % 5], 0.9)));
    rock.position.set(Math.cos(a) * r, 0.28 + (i % 3) * 0.12, Math.sin(a) * r * 0.9);
    rock.scale.set(0.85 + (i % 3) * 0.2, 0.65 + (i % 2) * 0.35, 0.9);
    rock.rotation.set(i * 0.3, a, i * 0.15);
    root.add(rock);
  }

  // Trees
  addTree(root, track, -4.8, -2.5, 1.4, 0.85, "#7DCE8A");
  addTree(root, track, 5.0, 1.8, 1.6, 1.0, "#6BC47A");
  addTree(root, track, -3.6, 3.8, 1.2, 0.7, "#8FDB9A");
  addTree(root, track, 2.2, -4.6, 1.5, 0.9, "#74C982");

  // Lollipop grove
  const stickGeo = track(new THREE.CylinderGeometry(0.055, 0.055, 1.3, 6));
  const candyGeo = track(new THREE.SphereGeometry(0.4, 16, 12));
  for (const [x, z, col] of [
    [-3.2, 1.5, "#FF6B9D"],
    [3.5, -2.2, "#A78BFA"],
    [-2.4, -3.8, "#F6D06B"],
    [4.6, 3.2, "#5EC8E8"],
    [-5.2, 0.2, "#FF9FBC"],
  ] as const) {
    const stick = new THREE.Mesh(stickGeo, track(softMat("#F7F2EA")));
    stick.position.set(x, 0.65, z);
    const candy = new THREE.Mesh(candyGeo, track(jellyMat(col, 0.96)));
    candy.position.set(x, 1.45, z);
    root.add(stick, candy);
  }

  // Flowers
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.4;
    const r = 2.2 + (i % 5) * 0.9;
    addFlower(
      root,
      track,
      Math.cos(a) * r,
      Math.sin(a) * r * 0.85,
      ["#FF8FB8", "#C4B5FD", "#FDE68A", "#FFB4A2"][i % 4],
    );
  }

  // Grass tufts (tiny cones)
  const tuftGeo = track(new THREE.ConeGeometry(0.06, 0.28, 5));
  const tuftMat = track(softMat("#8FD9A8", 0.85));
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 * 3.7;
    const r = 1.5 + ((i * 17) % 50) / 10;
    const t = new THREE.Mesh(tuftGeo, tuftMat);
    t.position.set(Math.cos(a) * r, 0.14, Math.sin(a) * r * 0.8);
    t.rotation.z = ((i % 5) - 2) * 0.08;
    root.add(t);
  }

  // Clouds
  const cloudGeo = track(new THREE.SphereGeometry(0.7, 12, 10));
  const cloudMat = track(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.92 }));
  const clouds: THREE.Object3D[] = [];
  for (const [x, y, z, s] of [
    [-5, 4.4, -6, 1.2],
    [4.2, 5.2, -4, 0.95],
    [0, 4.8, -8, 1.45],
    [6, 3.8, -7, 0.8],
    [-7, 3.5, -3, 0.7],
  ] as const) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.position.set(i * 0.5 - 0.75, (i % 2) * 0.18, (i % 3) * 0.12);
      puff.scale.setScalar(s * (0.75 + i * 0.12));
      g.add(puff);
    }
    g.position.set(x, y, z);
    root.add(g);
    clouds.push(g);
  }

  // Floating mini islands + tiny trees
  const miniGeo = track(new THREE.CylinderGeometry(1.2, 0.75, 0.5, 12));
  for (const [x, y, z] of [
    [-6.8, 2.4, -2],
    [6.4, 3.0, 1.8],
    [-5.5, 3.6, 3.5],
  ] as const) {
    const mini = new THREE.Mesh(miniGeo, track(softMat("#D8F0E0")));
    mini.position.set(x, y, z);
    root.add(mini);
    addTree(root, track, x, z, 0.7, 0.4, "#8FDB9A");
  }

  // Gate arch at path end
  const postGeo = track(new THREE.CylinderGeometry(0.14, 0.18, 1.8, 8));
  const postL = new THREE.Mesh(postGeo, track(softMat("#F0C4D8")));
  postL.position.set(-1.1, 0.9, 5.8);
  const postR = new THREE.Mesh(postGeo, track(softMat("#F0C4D8")));
  postR.position.set(1.1, 0.9, 5.8);
  const arch = new THREE.Mesh(
    track(new THREE.TorusGeometry(1.1, 0.12, 8, 20, Math.PI)),
    track(jellyMat("#FF8FB8", 0.95)),
  );
  arch.position.set(0, 1.8, 5.8);
  root.add(postL, postR, arch);

  return {
    root,
    bounds: { minX: -7.8, maxX: 7.8, minZ: -7.8, maxZ: 7.2 },
    groundY: 0,
    dispose: () => {
      root.clear();
      for (const d of list) d.dispose();
    },
  };
}

/** 备选：果冻厨房台面 */
function buildKitchen(): WalkSceneContent {
  const root = new THREE.Group();
  const { track, list } = makeTracker();

  const table = new THREE.Mesh(
    track(new THREE.BoxGeometry(18, 0.5, 13)),
    track(softMat("#E8C4A0", 0.8)),
  );
  table.position.y = -0.25;
  const runner = new THREE.Mesh(
    track(new THREE.BoxGeometry(16, 0.04, 2.2)),
    track(softMat("#FFF5EB", 0.7)),
  );
  runner.position.set(0, 0.02, 0);
  root.add(table, runner);

  const board = new THREE.Mesh(
    track(new THREE.BoxGeometry(5, 0.14, 3.2)),
    track(softMat("#D4A574", 0.75)),
  );
  board.position.set(-1, 0.08, 1.2);
  root.add(board);

  // Spoon + fork
  const utensil = track(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8));
  const spoonHandle = new THREE.Mesh(utensil, track(softMat("#F5E6D3")));
  spoonHandle.rotation.z = Math.PI / 2.3;
  spoonHandle.position.set(-5.2, 0.45, -2.2);
  const spoonBowl = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.72, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
    track(softMat("#F5E6D3")),
  );
  spoonBowl.rotation.x = Math.PI;
  spoonBowl.position.set(-6.6, 0.5, -2.2);
  const forkTine = track(new THREE.BoxGeometry(0.08, 0.06, 0.7));
  const forkBase = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.55, 0.08, 0.45)),
    track(softMat("#E8E4F0")),
  );
  forkBase.position.set(-4.2, 0.12, -3.4);
  forkBase.rotation.y = 0.4;
  root.add(spoonHandle, spoonBowl, forkBase);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(forkTine, track(softMat("#E8E4F0")));
    t.position.set(-4.2 + (i - 1.5) * 0.12, 0.12, -3.0);
    t.rotation.y = 0.4;
    root.add(t);
  }

  // Bowl + jelly cubes
  const bowl = new THREE.Mesh(
    track(new THREE.SphereGeometry(1.55, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)),
    track(jellyMat("#F8F4FF", 0.72)),
  );
  bowl.position.set(4.8, 1.5, -1.8);
  root.add(bowl);
  const cubeGeo = track(new THREE.BoxGeometry(0.42, 0.42, 0.42));
  for (let i = 0; i < 10; i++) {
    const cube = new THREE.Mesh(
      cubeGeo,
      track(jellyMat(["#FF9FBC", "#A78BFA", "#FDE68A", "#7DD3FC"][i % 4], 0.92)),
    );
    cube.position.set(4.8 + ((i % 4) - 1.5) * 0.38, 0.85 + Math.floor(i / 4) * 0.38, -1.8 + ((i % 2) - 0.5) * 0.35);
    cube.rotation.y = i * 0.4;
    root.add(cube);
  }

  // Fruit bowl
  const fruitBowl = new THREE.Mesh(
    track(new THREE.SphereGeometry(1.1, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)),
    track(softMat("#F0E6D8")),
  );
  fruitBowl.position.set(-5.5, 1.1, 2.5);
  root.add(fruitBowl);
  const fruitGeo = track(new THREE.SphereGeometry(0.42, 12, 10));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const f = new THREE.Mesh(
      fruitGeo,
      track(jellyMat(["#FF6B6B", "#FF9F43", "#A78BFA", "#F6D06B"][i % 4], 0.95)),
    );
    f.position.set(-5.5 + Math.cos(a) * 0.45, 0.9 + (i % 2) * 0.2, 2.5 + Math.sin(a) * 0.45);
    root.add(f);
  }

  // Rolling pin
  const pin = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.28, 0.28, 3.2, 12)),
    track(softMat("#E0C09A")),
  );
  pin.rotation.z = Math.PI / 2;
  pin.position.set(2, 0.3, 3.5);
  const pinH = track(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6));
  const pinL = new THREE.Mesh(pinH, track(softMat("#C4A484")));
  pinL.rotation.z = Math.PI / 2;
  pinL.position.set(0.2, 0.3, 3.5);
  const pinR = new THREE.Mesh(pinH, track(softMat("#C4A484")));
  pinR.rotation.z = Math.PI / 2;
  pinR.position.set(3.8, 0.3, 3.5);
  root.add(pin, pinL, pinR);

  // Stacked plates
  const plateGeo = track(new THREE.CylinderGeometry(1.0, 0.95, 0.08, 20));
  for (let i = 0; i < 4; i++) {
    const plate = new THREE.Mesh(plateGeo, track(softMat(i % 2 ? "#F8F0F5" : "#EEF6FF", 0.6)));
    plate.position.set(6.2, 0.06 + i * 0.1, 2.8);
    root.add(plate);
  }

  // Sugar jar
  const jar = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.55, 0.6, 1.1, 14)),
    track(jellyMat("#FFF8FC", 0.55)),
  );
  jar.position.set(6.5, 0.55, -3.5);
  const jarLid = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.58, 0.58, 0.12, 14)),
    track(softMat("#FF8FB8")),
  );
  jarLid.position.set(6.5, 1.15, -3.5);
  root.add(jar, jarLid);

  // Cookie pile
  const cookieGeo = track(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 12));
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(cookieGeo, track(softMat("#D2A679", 0.85)));
    c.position.set(-2.8 + (i % 2) * 0.15, 0.08 + i * 0.1, -2.8 + (i % 3) * 0.1);
    c.rotation.y = i;
    root.add(c);
  }

  return {
    root,
    bounds: { minX: -7, maxX: 7, minZ: -5, maxZ: 5 },
    groundY: 0,
    dispose: () => {
      root.clear();
      for (const d of list) d.dispose();
    },
  };
}

/** 备选：云上小岛 */
function buildCloud(): WalkSceneContent {
  const root = new THREE.Group();
  const { track, list } = makeTracker();

  const island = new THREE.Mesh(
    track(new THREE.CylinderGeometry(6.8, 4.0, 1.5, 28)),
    track(softMat("#E8F4FF", 0.85)),
  );
  island.position.y = -0.78;
  const grass = new THREE.Mesh(
    track(new THREE.CircleGeometry(6.7, 36)),
    track(softMat("#C5E8F5", 0.65)),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0.02;
  const inner = new THREE.Mesh(
    track(new THREE.CircleGeometry(4, 28)),
    track(softMat("#D8F0FA", 0.6)),
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.03;
  root.add(island, grass, inner);

  // Bridge
  const plankGeo = track(new THREE.BoxGeometry(0.75, 0.1, 0.42));
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(plankGeo, track(softMat("#E0D0B8")));
    p.position.set(Math.sin(i * 0.3) * 0.15, 0.06, 6.8 + i * 0.52);
    root.add(p);
  }
  const ropeGeo = track(new THREE.CylinderGeometry(0.03, 0.03, 4.2, 5));
  const ropeL = new THREE.Mesh(ropeGeo, track(softMat("#C4B5A0")));
  ropeL.rotation.x = Math.PI / 2.2;
  ropeL.position.set(-0.4, 0.35, 8.8);
  const ropeR = ropeL.clone();
  ropeR.position.x = 0.4;
  root.add(ropeL, ropeR);

  // Cloud sea
  const seaGeo = track(new THREE.SphereGeometry(0.95, 10, 8));
  const seaMat = track(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95 }));
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = 8.5 + (i % 5) * 0.9;
    const puff = new THREE.Mesh(seaGeo, seaMat);
    puff.position.set(Math.cos(a) * r, -2.8 - (i % 4) * 0.35, Math.sin(a) * r);
    puff.scale.setScalar(1.1 + (i % 4) * 0.35);
    root.add(puff);
  }

  // Star poles
  const poleGeo = track(new THREE.CylinderGeometry(0.06, 0.07, 2.0, 6));
  const starGeo = track(new THREE.OctahedronGeometry(0.3, 0));
  for (const [x, z] of [
    [-3.2, -2.2],
    [3.8, -1.2],
    [-2.2, 3.2],
    [2.5, 3.5],
    [0, -4.2],
  ] as const) {
    const pole = new THREE.Mesh(poleGeo, track(softMat("#FFFFFF", 0.5)));
    pole.position.set(x, 1.0, z);
    const star = new THREE.Mesh(starGeo, track(jellyMat("#FFE566", 0.95)));
    star.position.set(x, 2.2, z);
    root.add(pole, star);
  }

  // Soft hills
  const hillGeo = track(new THREE.SphereGeometry(1.2, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2));
  for (const [x, z, s] of [
    [-4, 2, 1.1],
    [4.2, -3, 0.9],
    [1.5, 4.5, 0.75],
  ] as const) {
    const h = new THREE.Mesh(hillGeo, track(softMat("#B8DCF0", 0.7)));
    h.position.set(x, 0, z);
    h.scale.set(s, s * 0.55, s);
    root.add(h);
  }

  // Moon disc
  const moon = new THREE.Mesh(
    track(new THREE.CircleGeometry(1.6, 24)),
    track(new THREE.MeshBasicMaterial({ color: "#FFF6C8", transparent: true, opacity: 0.85 })),
  );
  moon.position.set(-8, 6.5, -10);
  moon.lookAt(0, 0, 0);
  root.add(moon);

  return {
    root,
    bounds: { minX: -5.8, maxX: 5.8, minZ: -5.8, maxZ: 7.8 },
    groundY: 0,
    dispose: () => {
      root.clear();
      for (const d of list) d.dispose();
    },
  };
}

/**
 * 森林小径：移动端主场景。沿 -Z 无限向前，道具循环回收。
 */
function buildForestPath(): WalkSceneContent {
  const root = new THREE.Group();
  const { track, list } = makeTracker();

  const PATH_W = 3.2;
  const SEG_LEN = 8;
  const SEG_COUNT = 12;
  const recyc: THREE.Object3D[] = [];

  // Ground strip (long, mostly static; we also recycle path tiles)
  const tileGeo = track(new THREE.PlaneGeometry(PATH_W * 2.4, SEG_LEN));
  const tileMat = track(softMat("#8FBF88", 0.8));
  const edgeMat = track(softMat("#6FA86A", 0.85));
  const edgeGeo = track(new THREE.PlaneGeometry(3.5, SEG_LEN));
  const tiles: THREE.Mesh[] = [];
  for (let i = 0; i < SEG_COUNT; i++) {
    const z = 4 - i * SEG_LEN;
    const path = new THREE.Mesh(tileGeo, tileMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.01, z);
    root.add(path);
    tiles.push(path);
    const eL = new THREE.Mesh(edgeGeo, edgeMat);
    eL.rotation.x = -Math.PI / 2;
    eL.position.set(-PATH_W - 1.2, 0.005, z);
    const eR = eL.clone();
    eR.position.x = PATH_W + 1.2;
    root.add(eL, eR);
    recyc.push(path, eL, eR);
  }

  // Bamboo
  const bambooGeo = track(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6));
  const bambooMat = track(softMat("#5A9E62", 0.7));
  const bambooJoint = track(new THREE.CylinderGeometry(0.095, 0.095, 0.06, 6));
  const jointMat = track(softMat("#4A8A52", 0.75));
  function addBambooCluster(x: number, z: number): void {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const bx = x + (Math.random() - 0.5) * 0.6;
      const bz = z + (Math.random() - 0.5) * 1.2;
      const h = 2 + Math.random() * 1.4;
      const culm = new THREE.Mesh(bambooGeo, bambooMat);
      culm.scale.y = h / 2.4;
      culm.position.set(bx, h / 2, bz);
      culm.rotation.z = (Math.random() - 0.5) * 0.08;
      root.add(culm);
      for (let j = 1; j <= 3; j++) {
        const ring = new THREE.Mesh(bambooJoint, jointMat);
        ring.position.set(bx, (h * j) / 4, bz);
        root.add(ring);
      }
      recyc.push(culm);
    }
  }

  // Broadleaf trees
  const trunkGeo = track(new THREE.CylinderGeometry(0.14, 0.22, 1.6, 7));
  const trunkMat = track(softMat("#8B6B4A", 0.85));
  const crownGeo = track(new THREE.SphereGeometry(0.95, 12, 10));
  function addTree(x: number, z: number): void {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 0.8, z);
    const crown = new THREE.Mesh(crownGeo, track(jellyMat("#4F9B58", 0.95)));
    crown.position.set(x, 1.9, z);
    crown.scale.set(1.1, 0.9 + Math.random() * 0.3, 1.1);
    root.add(trunk, crown);
    recyc.push(trunk, crown);
  }

  // Grass tufts
  const tuftGeo = track(new THREE.ConeGeometry(0.07, 0.32, 5));
  const tuftMat = track(softMat("#7CBF7A", 0.85));
  function addTuft(x: number, z: number): void {
    const t = new THREE.Mesh(tuftGeo, tuftMat);
    t.position.set(x, 0.15, z);
    t.rotation.z = (Math.random() - 0.5) * 0.3;
    root.add(t);
    recyc.push(t);
  }

  // Stones
  const pebbleGeo = track(new THREE.IcosahedronGeometry(0.22, 0));
  const pebbleMat = track(softMat("#A8B8A0", 0.8));
  function addPebble(x: number, z: number): void {
    const p = new THREE.Mesh(pebbleGeo, pebbleMat);
    p.position.set(x, 0.12, z);
    p.scale.set(1, 0.55, 1);
    p.rotation.y = Math.random() * Math.PI;
    root.add(p);
    recyc.push(p);
  }

  // Initial fill ahead of origin (walk goes -Z)
  function fillSide(side: number, z0: number): void {
    const xBase = side * (PATH_W + 0.6 + Math.random() * 1.4);
    const roll = Math.random();
    if (roll < 0.4) addBambooCluster(xBase, z0);
    else if (roll < 0.7) addTree(xBase * 1.15, z0);
    else {
      addTuft(xBase * 0.7, z0);
      addPebble(xBase * 0.5, z0 + 1);
    }
  }
  for (let i = 0; i < SEG_COUNT; i++) {
    const z = 2 - i * SEG_LEN;
    fillSide(-1, z);
    fillSide(1, z - 3);
    addTuft((Math.random() - 0.5) * PATH_W * 1.4, z - 1);
  }

  // Distant fog-ish backdrop plane
  const back = new THREE.Mesh(
    track(new THREE.PlaneGeometry(40, 16)),
    track(new THREE.MeshBasicMaterial({ color: "#A8D4A0", transparent: true, opacity: 0.35 })),
  );
  back.position.set(0, 6, -SEG_COUNT * SEG_LEN - 4);
  root.add(back);

  const recycleAhead = (charZ: number) => {
    // Character walks toward -Z. Props far behind (larger Z) get pushed further ahead.
    const behind = charZ + 12;
    const spawnSpan = SEG_COUNT * SEG_LEN;
    for (const obj of recyc) {
      if (obj.position.z > behind) {
        obj.position.z -= spawnSpan;
        // jitter x slightly so sides don't look cloned
        obj.position.x += (Math.random() - 0.5) * 0.4;
      }
    }
    // Keep backdrop ahead
    if (back.position.z > charZ + 4) {
      back.position.z = charZ - spawnSpan + 8;
    }
  };

  return {
    root,
    // Wide lateral bounds; Z unbounded in practice (recycled).
    bounds: { minX: -2.6, maxX: 2.6, minZ: -10000, maxZ: 6 },
    groundY: 0,
    update: recycleAhead,
    dispose: () => {
      root.clear();
      for (const d of list) d.dispose();
    },
  };
}

export function buildWalkScene(id: WalkSceneId): WalkSceneContent {
  switch (id) {
    case "forest":
      return buildForestPath();
    case "kitchen":
      return buildKitchen();
    case "cloud":
      return buildCloud();
    case "meadow":
    default:
      return buildMeadow();
  }
}
