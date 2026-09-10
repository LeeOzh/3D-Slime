import "./styles/main.css";
import * as THREE from "three";
import { CHARACTERS, TINTS } from "./core/constants";
import { eventBus } from "./core/EventBus";
import type { CharacterDef, GameState } from "./core/types";
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
    pressPeak: 0,
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

  const loop = new AnimationLoop((dt, time) => {
    comboMgr.update();
    state.combo = comboMgr.count;
    state.comboLevel = comboMgr.level;
    idleSys.update(dt);
    motion.update(dt, state, state.character);
    deformation.update(characters, state, time, cameraManager.camera);
    motion.applyToMesh(characters.slime, sceneManager.shadowMesh, state);
    expressions.applyPressureExpression(state);
    expressions.update(state, state.character, characters.faceContext, characters.faceTex);
    // Dynamic badge owns idle / rest / sleepy copy.
    if (!state.pressing) {
      const line = dynamicCopy.sample({
        pressing: state.pressing,
        pressure: state.squish.pressure,
        combo: state.combo,
        recentPressCount: state.recentPressTimes.length,
        sleepy: state.sleepy,
      });
      if (line) badge.say(line);
    }
    particles.update(dt, state.color);
    characters.material.color.copy(state.color);
    characters.material.attenuationColor.copy(state.atten);
    cameraFeedback.update(dt, cameraManager.camera);
    statsUi.setPress(state.pressStrength);
    statsUi.setWobble(state.wobbleVel);
    renderer.render(sceneManager.scene, cameraManager.camera);
  });
  loop.start();
}

bootstrap();
