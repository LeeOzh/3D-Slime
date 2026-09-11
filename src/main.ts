import "./styles/main.css";
import * as THREE from "three";
import { CHARACTERS, TINTS } from "./core/constants";
import { eventBus } from "./core/EventBus";
import type { CharacterDef, GameState } from "./core/types";
import { createSoftBodyState } from "./core/softBody";
import { PERF } from "./core/perf";
import { AnimationLoop } from "./three/AnimationLoop";
import { CameraFeedback } from "./three/CameraFeedback";
import { CameraManager } from "./three/CameraManager";
import {
  CharacterManager,
  applyTint,
} from "./three/CharacterManager";
import { CharacterMotionSystem } from "./three/CharacterMotionSystem";
import { DeformationSystem } from "./three/DeformationSystem";
import { ExpressionSystem } from "./three/ExpressionSystem";
import { ParticleManager } from "./three/ParticleManager";
import { RendererManager } from "./three/RendererManager";
import { SceneManager } from "./three/SceneManager";
import { SoftBodySystem } from "./three/SoftBodySystem";
import { SoundManager } from "./three/SoundManager";
import { SquishSystem } from "./three/SquishSystem";
import { BadgePanel } from "./ui/BadgePanel";
import { CharacterPanel } from "./ui/CharacterPanel";
import { ColorPanel } from "./ui/ColorPanel";
import { ComboIndicator } from "./ui/ComboIndicator";
import { StatsPanel } from "./ui/StatsPanel";
import { ComboManager } from "./game/ComboManager";
import { AchievementManager } from "./game/AchievementManager";
import { ReportPanel } from "./game/DailyReport";
import { IdleSystem } from "./game/IdleSystem";
import { DynamicCopy } from "./ui/DynamicCopy";
import { ToastHost } from "./ui/ToastHost";
import { StorageManager } from "./storage/StorageManager";
import { WalkStage } from "./three/walk/WalkStage";
import { WalkController } from "./three/walk/WalkController";
import { ScenePanel } from "./ui/ScenePanel";
import {
  defaultWalkSceneId,
  listWalkScenes,
  type StageMode,
  type WalkSceneId,
} from "./game/walkTypes";

function showError(message: string): void {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div style="position:fixed;inset:auto 16px 16px 16px;z-index:99;padding:12px 16px;border-radius:12px;background:#2B2140;color:#fff;font:14px/1.5 system-ui,sans-serif;">${message}</div>`,
  );
}

function bootstrap(): void {
  const canvas = document.getElementById("c") as HTMLCanvasElement | null;
  if (!canvas) {
    showError("页面缺少 canvas#c，无法启动 3D 场景。");
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const character = CHARACTERS[0];

  const state: GameState = {
    character,
    tintIndex: 0,
    pressing: false,
    dragging: false,
    hovering: false,
    pressStrength: 0,
    pressTarget: 0,
    pressVel: 0,
    dragVec: new THREE.Vector3(),
    dragTarget: new THREE.Vector3(),
    squash: 0,
    squashVel: 0,
    stretch: new THREE.Vector3(),
    stretchVel: new THREE.Vector3(),
    wobble: 0,
    wobbleVel: 0,
    happyBounce: 0,
    happyVel: 0,
    lean: new THREE.Vector2(),
    leanTarget: new THREE.Vector2(),
    pressCount: 0,
    lastPointer: new THREE.Vector2(),
    movedFar: false,
    color: new THREE.Color(character.color),
    atten: new THREE.Color(character.atten),
    targetColor: new THREE.Color(character.color),
    targetAtten: new THREE.Color(character.atten),
    expr: "idle",
    exprUntil: 0,
    blink: 1,
    nextBlink: 2 + Math.random() * 3,
    faceDirty: true,
    faceCenter: new THREE.Vector3(0, 0.1, 1.1),
    reduceMotion,
    squish: {
      isPressing: false,
      pressure: 0,
      area: "unknown",
      velocity: 0,
      duration: 0,
      totalCount: 0,
      lastSquishTime: 0,
    },
    earLag: new THREE.Vector2(),
    earLagVel: new THREE.Vector2(),
    headLag: new THREE.Vector2(),
    headLagVel: new THREE.Vector2(),
    sideComp: 0,
    sideCompVel: 0,
    combo: 0,
    comboLevel: 0,
    recentPressTimes: [],
    lastInteractionAt: 0,
    sleepy: false,
    idleFidgetAt: 0,
    mood: "neutral",
    moodHold: 0,
    glance: 0,
    glanceNdc: new THREE.Vector2(),
    boredom: 0,
    yawn: 0,
    breathBoost: 1,
    lastGapMs: 0,
    pressPeak: 0,
    softBody: createSoftBodyState(),
  };

  let renderer: RendererManager;
  try {
    renderer = new RendererManager(canvas);
  } catch {
    return;
  }

  const cameraManager = new CameraManager();
  const sceneManager = new SceneManager(renderer);
  const characters = new CharacterManager(sceneManager.scene, state);
  const expressions = new ExpressionSystem();
  const deformation = new DeformationSystem();
  const motion = new CharacterMotionSystem();
  const storage = new StorageManager();
  const particles = new ParticleManager(sceneManager.scene);
  const sound = new SoundManager();
  const cameraFeedback = new CameraFeedback();
  const softBodySys = new SoftBodySystem();
  softBodySys.resolveConfig(character);

  // --- Walk mode ---
  let stageMode: StageMode = "squish";
  let walkSceneId: WalkSceneId = defaultWalkSceneId();
  const walkSceneList = listWalkScenes();
  const walkStage = new WalkStage(sceneManager.scene);
  const walkCtrl = new WalkController();
  const modeTag = document.getElementById("mode-tag");
  const sceneRow = document.getElementById("scene-row");
  const walkBar = document.getElementById("walk-bar");
  const walkExit = document.getElementById("walk-exit");
  const walkPad = document.getElementById("walk-pad");
  const restCamPos = new THREE.Vector3(0, 0.12, cameraManager.restZ);
  const walkCamPos = new THREE.Vector3(0, 5.2, 7.5);
  const walkCamLook = new THREE.Vector3();
  let walkUiHideAt = 0;

  function setWalkUi(on: boolean): void {
    document.body.classList.toggle("is-walk", on);
    if (sceneRow) sceneRow.hidden = !on || PERF.isMobile;
    if (walkBar) walkBar.hidden = !on;
    if (modeTag) modeTag.textContent = on ? "散步" : "捏捏";
  }

  function enterWalk(): void {
    if (stageMode === "walk") return;
    stageMode = "walk";
    walkStage.ensure(walkSceneId);
    walkStage.setEnabled(true);
    walkCtrl.enabled = true;
    walkCtrl.resetToOrigin();
    squish.setInputEnabled(false);
    characters.slime.position.set(0, 0, 0);
    characters.slime.rotation.y = 0;
    sceneManager.shadowMesh.position.set(0, -1.4, 0);
    restCamPos.copy(cameraManager.camera.position);
    setWalkUi(true);
    const hint = document.getElementById("hint");
    if (hint) {
      hint.textContent = PERF.isMobile
        ? "按住小家伙拖动走路 · 返回捏捏退出"
        : "按住角色拖动 / 方向键走路 · Esc 返回";
    }
    badge.say("按住我拖着走");
    idleSys.markInteraction();
    sound.playSpecial("character");
  }

  function exitWalk(): void {
    if (stageMode === "squish") return;
    stageMode = "squish";
    walkCtrl.enabled = false;
    walkStage.setEnabled(false);
    squish.setInputEnabled(true);
    cameraManager.resetFov();
    characters.slime.position.set(0, 0, 0);
    characters.slime.rotation.set(0, 0, 0);
    sceneManager.shadowMesh.position.set(0, -1.4, 0);
    cameraManager.camera.position.copy(restCamPos);
    cameraManager.camera.lookAt(0, 0, 0);
    setWalkUi(false);
    document.body.classList.remove("is-walk-moving");
    const hint = document.getElementById("hint");
    if (hint) hint.textContent = "按住捏扁 · 拖脸拉伸 · 双指捏合 · 按方向键走路 · 双击开心跳";
    badge.say("回来捏捏啦");
    idleSys.markInteraction();
  }

  function selectWalkScene(id: WalkSceneId): void {
    walkSceneId = id;
    if (stageMode === "walk") {
      walkStage.ensure(id);
      walkCtrl.resetToOrigin();
    }
    scenePanel?.setActive(id);
    const def = walkSceneList.find((s) => s.id === id);
    if (def) badge.say(`场景 · ${def.name}`);
  }

  let scenePanel: ScenePanel | null = null;
  const scenesRoot = document.getElementById("scenes");
  // Mobile has a single scene — hide the picker.
  if (sceneRow && PERF.isMobile) sceneRow.hidden = true;
  if (scenesRoot && !PERF.isMobile) {
    scenePanel = new ScenePanel(scenesRoot, walkSceneList, selectWalkScene, walkSceneId);
  }

  walkExit?.addEventListener("click", () => exitWalk());
  document.getElementById("walk-enter")?.addEventListener("click", () => enterWalk());
  // Grab-drag walk on the character (mobile primary control).
  walkCtrl.bindCharacter(canvas, cameraManager.camera, characters.slime);

  // Virtual d-pad
  if (walkPad) {
    const map: Record<string, [number, number]> = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    };
    const dirs = new Map<string, [number, number]>();
    const applyStick = () => {
      let x = 0;
      let y = 0;
      for (const [dx, dy] of dirs.values()) {
        x += dx;
        y += dy;
      }
      walkCtrl.setStick(x, y);
    };
    walkPad.querySelectorAll<HTMLButtonElement>("button[data-dir]").forEach((btn) => {
      const dir = btn.dataset.dir || "";
      const down = (e: Event) => {
        e.preventDefault();
        if (!map[dir]) return;
        dirs.set(dir, map[dir]);
        if (stageMode !== "walk") enterWalk();
        applyStick();
      };
      const up = (e: Event) => {
        e.preventDefault();
        dirs.delete(dir);
        applyStick();
      };
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointerleave", up);
      btn.addEventListener("pointercancel", up);
    });
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === "Escape" && stageMode === "walk") {
      exitWalk();
      return;
    }
    if (
      k === "ArrowUp" ||
      k === "ArrowDown" ||
      k === "ArrowLeft" ||
      k === "ArrowRight" ||
      k === "w" ||
      k === "a" ||
      k === "s" ||
      k === "d"
    ) {
      if (stageMode !== "walk") enterWalk();
    }
  });


  const settings0 = storage.getSettings();
  sound.setEnabled(settings0.soundEnabled);
  particles.setEnabled(settings0.particleEnabled);
  cameraFeedback.setReduceMotion(reduceMotion);
  cameraFeedback.setBaseZ(cameraManager.restZ);

  const elBadge = document.getElementById("badge")!;
  const elHint = document.getElementById("hint")!;
  const elStatPress = document.getElementById("stat-press")!;
  const elStatWobble = document.getElementById("stat-wobble")!;
  const elStatCount = document.getElementById("stat-count")!;
  const charRoot = document.getElementById("chars")!;
  const swatchRoot = document.getElementById("swatches")!;

  const badge = new BadgePanel(elBadge, elHint);
  const statsUi = new StatsPanel(elStatPress, elStatWobble, elStatCount);
  const comboMgr = new ComboManager();
  const comboUi = new ComboIndicator(document.querySelector(".ui")!);
  const toastUi = new ToastHost(document.querySelector(".ui")!);
  const achievements = new AchievementManager(storage);
  const reportPanel = new ReportPanel(storage, document.querySelector(".ui")!);
  const idleSys = new IdleSystem(state);
  const dynamicCopy = new DynamicCopy();

  eventBus.on("idle:sleepy", () => {
    expressions.setExpression(state, "sleepy", 99);
    badge.say(DynamicCopy.LINES.sleepy);
    const zzz = document.getElementById("sleepy-zzz");
    if (zzz) zzz.hidden = false;
  });
  eventBus.on("idle:wake", () => {
    achievements.notifySleepWake();
    expressions.setExpression(state, "surprised", 1.0);
    const zzz = document.getElementById("sleepy-zzz");
    if (zzz) zzz.hidden = true;
  });
  eventBus.on("squish:releasedHard", (payload) => {
    dynamicCopy.noteRelease(!!payload);
  });

  eventBus.on("toast:show", (payload) => {
    const t = payload as { name: string; desc: string; kind: "achievement" | "egg" };
    toastUi.show(t.kind === "egg" ? `彩蛋 · ${t.name}` : `解锁成就 · ${t.name}`, t.desc, t.kind);
  });

  const reportBtn = document.getElementById("report-toggle");
  reportBtn?.addEventListener("click", () => reportPanel.toggle());

  function selectCharacter(ch: CharacterDef): void {
    idleSys.markInteraction();
    state.character = ch;
    softBodySys.resolveConfig(ch);
    softBodySys.reset(state.softBody);
    characterPanel.setActive(ch.id);
    characters.rebuildRestShape(state);
    characters.setExtrasVisible(ch);
    characters.applyMaterialForCharacter(ch);
    applyTint(state, ch.color, ch.atten, state.tintIndex, TINTS);
    colorPanel.refresh(ch);
    expressions.setExpression(state, "happy", 0.55);
    badge.say(ch.lines.idle);
    dynamicCopy.pokeIdle();
    badge.hideHint();
    state.wobbleVel += 3;
    state.happyVel += 6;
    state.faceDirty = true;
    sound.playSpecial("character");
    if (squish && squish.raycastSlime()) {
      particles.spawn(
        squish.hitPoint,
        0.6,
        state.color,
        state.reduceMotion,
        ch.particleType ?? "star",
        state.comboLevel,
      );
    }
    eventBus.emit("character:change", ch);
  }

  const characterPanel = new CharacterPanel(charRoot, selectCharacter, character.id);

  const colorPanel = new ColorPanel(swatchRoot, state, character, (index) => {
    idleSys.markInteraction();
    state.tintIndex = index;
    applyTint(state, state.character.color, state.character.atten, state.tintIndex, TINTS);
    badge.say(`${state.character.name} · ${TINTS[index].name}`);
    badge.hideHint();
    state.wobbleVel += 2;
    state.faceDirty = true;
    eventBus.emit("character:colorChange", index);
  });

  const squish = new SquishSystem(
    canvas,
    cameraManager.camera,
    characters,
    deformation,
    expressions,
    particles,
    state,
    comboMgr,
    sound,
    cameraFeedback,
    idleSys,
    softBodySys,
    {
      hideHint: () => badge.hideHint(),
      say: (text) => badge.say(text),
      setPressingCursor: (pressing) => canvas.classList.toggle("is-pressing", pressing),
      onCountChange: (count) => {
        storage.pressCount = count;
        statsUi.setCount(count);
      },
      onSquishRecord: (pressure, area, combo) => {
        storage.recordSquish(pressure, area, combo);
      },
      onReleaseRecord: () => {
        storage.recordRelease();
      },
      onCombo: (combo, level) => {
        state.combo = combo;
        state.comboLevel = level;
        comboUi.show(combo, level);
      },
    },
  );

  // Sound toggle (P2)
  const soundBtn = document.getElementById("sound-toggle");
  if (soundBtn) {
    const syncSoundUi = () => {
      const on = sound.isEnabled();
      soundBtn.classList.toggle("is-off", !on);
      soundBtn.setAttribute("aria-pressed", String(on));
      soundBtn.title = on ? "关闭音效" : "开启音效";
    };
    syncSoundUi();
    soundBtn.addEventListener("click", () => {
      const next = !sound.isEnabled();
      sound.setEnabled(next);
      storage.setSoundEnabled(next);
      syncSoundUi();
      if (next) sound.unlock();
    });
  }

  function onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    cameraManager.resize(w, h);
    cameraFeedback.setBaseZ(cameraManager.restZ);
    renderer.resize(w, h);
  }
  window.addEventListener("resize", onResize);
  onResize();

  characters.rebuildRestShape(state);
  applyTint(state, character.color, character.atten, state.tintIndex, TINTS);
  characters.faceTex.needsUpdate = true;
  state.faceDirty = true;
  // Restore lifetime count into the session counter.
  state.pressCount = storage.getStats().totalSquishCount;
  statsUi.setCount(state.pressCount);
  badge.say(character.lines.idle);

  // Soft-body debug: ?debug=softbody
  const debugEnabled = new URLSearchParams(window.location.search).get("debug") === "softbody";
  let debugEl: HTMLElement | null = null;
  if (debugEnabled) {
    debugEl = document.createElement("pre");
    debugEl.id = "softbody-debug";
    debugEl.style.cssText = [
      "position:fixed",
      "left:12px",
      "bottom:120px",
      "z-index:40",
      "margin:0",
      "padding:10px 12px",
      "border-radius:10px",
      "background:rgba(20,14,36,.82)",
      "color:#E9D5FF",
      "font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace",
      "pointer-events:none",
      "white-space:pre",
      "max-width:280px",
    ].join(";");
    document.body.appendChild(debugEl);
  }

  const loop = new AnimationLoop((dt, time) => {
    comboMgr.update();
    state.combo = comboMgr.count;
    state.comboLevel = comboMgr.level;
    idleSys.update(dt);
    // Soft-body physics runs after input, before deformation.
    softBodySys.update(state, squish.getPointerList(), dt);
    motion.update(dt, state, state.character);
    deformation.update(characters, state, time, cameraManager.camera);
    motion.applyToMesh(characters.slime, sceneManager.shadowMesh, state);

    if (stageMode === "walk") {
      walkCtrl.update(dt, state, walkStage.bounds, walkStage.groundY);
      walkStage.update(walkCtrl.position.z);
      walkCtrl.applyToMesh(characters.slime);
      sceneManager.shadowMesh.position.x = walkCtrl.position.x;
      sceneManager.shadowMesh.position.z = walkCtrl.position.z;
      // Portrait phones need a wider FOV + more pull-back to see the path.
      const aspect = cameraManager.camera.aspect;
      const portrait = aspect < 1.05;
      cameraManager.setFov(portrait ? 52 : 40);
      const camY = portrait ? 14 : 9.8;
      const camBack = portrait ? 16 : 12;
      const follow = portrait ? 0.12 : 0.25;
      walkCamPos.set(walkCtrl.position.x * follow, camY, walkCtrl.position.z * follow + camBack);
      cameraManager.camera.position.lerp(walkCamPos, 1 - Math.exp(-3.5 * dt));
      walkCamLook.set(
        walkCtrl.position.x * 0.3,
        walkCtrl.position.y + 0.4,
        walkCtrl.position.z * 0.3,
      );
      cameraManager.camera.lookAt(walkCamLook);
      // Hide option dock while walking; show again after a short idle.
      const nowMs = performance.now();
      if (walkCtrl.getSpeed() > 0.35) {
        walkUiHideAt = nowMs + 280;
        document.body.classList.add("is-walk-moving");
      } else if (nowMs > walkUiHideAt) {
        document.body.classList.remove("is-walk-moving");
      }
    } else {
      document.body.classList.remove("is-walk-moving");
      sceneManager.shadowMesh.position.x = 0;
      sceneManager.shadowMesh.position.z = 0;
    }

    expressions.applyPressureExpression(state);
    expressions.update(state, state.character, characters.faceContext, characters.faceTex);
    // Dynamic badge owns idle / rest / sleepy copy.
    if (!state.pressing && stageMode !== "walk") {
      const line = dynamicCopy.sample({
        pressing: state.pressing,
        pressure: state.squish.pressure,
        combo: state.combo,
        recentPressCount: state.recentPressTimes.length,
        sleepy: state.sleepy,
        glance: state.glance,
        boredom: state.boredom,
        yawn: state.yawn,
      });
      if (line) badge.say(line);
    }
    particles.update(dt, state.color);
    characters.material.color.copy(state.color);
    characters.material.attenuationColor.copy(state.atten);
    if (stageMode !== "walk") {
      cameraFeedback.update(dt, cameraManager.camera);
    }
    statsUi.setPress(Math.max(state.pressStrength, state.softBody.localPressure));
    statsUi.setWobble(state.wobbleVel);
    if (debugEl) {
      const soft = state.softBody;
      const field = soft.pressureField;
      const rot = soft.rotation;
      const rad = (v: number) => `${((v * 180) / Math.PI).toFixed(1)}°`;
      debugEl.textContent = [
        "---------------------",
        "SOFT BODY DEBUG",
        "---------------------",
        `Mode: ${soft.mode}`,
        `Mood: ${state.mood}  glance ${state.glance.toFixed(2)}  bored ${state.boredom.toFixed(2)}  yawn ${state.yawn.toFixed(2)}`,
        `Pressure: ${soft.localPressure.toFixed(2)}`,
        `  L-cheek ${field["left-cheek"].toFixed(2)}  R-cheek ${field["right-cheek"].toFixed(2)}`,
        `  top ${field.top.toFixed(2)}  belly ${field.belly.toFixed(2)}`,
        `  L-ear ${field["left-ear"].toFixed(2)}  R-ear ${field["right-ear"].toFixed(2)}`,
        `Center: ${soft.pressureCenter.x.toFixed(2)} ${soft.pressureCenter.y.toFixed(2)}`,
        `Stretch: ${soft.stretchAmount.toFixed(2)}`,
        `Pet: ${soft.isPetting ? "Y" : "n"} ${soft.petStrength.toFixed(2)} wave ${soft.petWave.toFixed(2)}`,
        `Ear: side ${soft.earGrabSide} tilt ${((soft.earTilt * 180) / Math.PI).toFixed(1)}° stretch ${soft.earStretch.x.toFixed(2)} ${soft.earStretch.y.toFixed(2)}`,
        `Pinch: ${soft.pinchStrength.toFixed(2)}`,
        `Release: ${soft.releaseImpulse.toFixed(2)} / E ${soft.releaseEnergy.toFixed(2)}`,
        `Scale: ${soft.scale.x.toFixed(2)} ${soft.scale.y.toFixed(2)} ${soft.scale.z.toFixed(2)}`,
        `Rotation:`,
        `  X ${rad(rot.x)}  Y ${rad(rot.y)}  Z ${rad(rot.z)}`,
        `Target:`,
        `  X ${rad(rot.targetX)}  Y ${rad(rot.targetY)}  Z ${rad(rot.targetZ)}`,
        `Velocity:`,
        `  X ${rot.velX.toFixed(2)}  Y ${rot.velY.toFixed(2)}  Z ${rot.velZ.toFixed(2)}`,
        `Pointers: ${squish.getPointerList().length}`,
        `FPS: ${softBodySys.getFps().toFixed(0)}  iOS: ${PERF.isIOS ? "Y" : "n"}  segs: ${PERF.sphereSegments}`,
        `Draws: ${renderer.renderer.info.render.calls}  tris: ${renderer.renderer.info.render.triangles}`,
        `Deform: ${deformation.isGpu ? "GPU" : "CPU"}  segs: ${PERF.sphereSegments}`,
        `Stage: ${stageMode}  scene: ${walkSceneId}`,
        "---------------------",
      ].join("\n");
    }
    renderer.render(sceneManager.scene, cameraManager.camera);
  });
  loop.start();
}

bootstrap();
