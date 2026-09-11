import type { CharacterDef, TintDef } from "./types";

export const RADIUS = 1.1;

export const CHARACTERS: CharacterDef[] = [
  {
    id: "mochi",
    name: "圆宝",
    shape: "ball",
    color: "#A78BFA",
    atten: "#C4B5FF",
    blush: "#FF8FB8",
    lines: {
      idle: "温柔地等你来捏",
      press: "嗯…有点扁了",
      release: "弹回来啦～",
      drag: "被拉长了啦！",
      happy: "圆宝开心转圈！",
    },
    face: { eye: "soft", mouth: "smile", blink: true },
    personality: { breath: 1, jiggle: 1, bounce: 1, squishStrength: 1, springK: 1, damping: 1, soft: { softness: 1.1, propagation: 1.15, stretchiness: 1.0, releaseSnap: 0.9, rotationSpring: 0.85, rotationDamping: 1.0, rotationAmount: 1.1 } },
    particleType: "star",
  },
  {
    id: "pudding",
    name: "布丁仔",
    shape: "pudding",
    color: "#F6D06B",
    atten: "#FDE68A",
    blush: "#FF9A7A",
    lines: {
      idle: "我是焦糖布丁，轻轻抖",
      press: "布丁要塌啦！",
      release: "Q弹回正！",
      drag: "别把焦糖拉丝…",
      happy: "布丁跳舞！",
    },
    face: { eye: "happy", mouth: "open-smile", blink: false },
    // Soft pudding: deeper squash, slower spring, more jiggle, less overshoot.
    personality: { breath: 0.85, jiggle: 1.45, bounce: 0.9, squishStrength: 1.15, springK: 0.85, damping: 1.15, soft: { softness: 1.28, propagation: 1.25, stretchiness: 1.12, releaseSnap: 0.78, rotationSpring: 0.75, rotationDamping: 0.9, rotationAmount: 1.2 } },
    caramel: true,
    particleType: "dust",
  },
  {
    id: "drop",
    name: "滴滴",
    shape: "drop",
    color: "#5EC8E8",
    atten: "#A5F3FC",
    blush: "#7DD3FC",
    lines: {
      idle: "有点害羞…轻一点哦",
      press: "呜…要哭了",
      release: "还好还好…",
      drag: "水滴要被拉断了！",
      happy: "闪闪发光！",
    },
    face: { eye: "sparkle", mouth: "small-o", blink: true },
    // Water drop: shallow dent, snappy restore.
    personality: { breath: 1.1, jiggle: 0.85, bounce: 1.1, squishStrength: 0.85, springK: 1.15, damping: 0.9, soft: { softness: 0.9, propagation: 0.82, stretchiness: 0.9, releaseSnap: 1.2, rotationSpring: 1.25, rotationDamping: 1.05, rotationAmount: 0.75 } },
    particleType: "bubble",
  },
  {
    id: "cat",
    name: "爪爪",
    shape: "cat",
    color: "#5EEAD4",
    atten: "#99F6E4",
    blush: "#FDA4AF",
    lines: {
      idle: "喵呜…来捏一下嘛",
      press: "喵嗷——！",
      release: "呼噜呼噜",
      drag: "尾巴被拽住了喵！",
      happy: "开心到炸毛！",
    },
    face: { eye: "cat", mouth: "cat", blink: true },
    // Cat: medium, lively bounce.
    personality: { breath: 1, jiggle: 1.05, bounce: 1.15, squishStrength: 0.95, springK: 1.05, damping: 0.92, soft: { softness: 0.98, propagation: 0.95, stretchiness: 1.18, releaseSnap: 1.05, rotationSpring: 1.1, rotationDamping: 0.95, rotationAmount: 1.05 } },
    particleType: "heart",
  },
  {
    id: "nezha",
    name: "哪吒",
    shape: "nezha",
    color: "#E11D48",
    atten: "#FB7185",
    blush: "#F97316",
    lines: {
      idle: "我命由我不由天",
      press: "敢捏小爷？",
      release: "火尖枪伺候！",
      drag: "混天绫都拉不住！",
      happy: "三头六臂也开心！",
    },
    face: { eye: "nezha", mouth: "smirk", blink: true },
    // Nezha: firmer, springier, strong rebound.
    personality: { breath: 0.95, jiggle: 1.1, bounce: 1.3, squishStrength: 0.8, springK: 1.2, damping: 0.85, soft: { softness: 0.72, propagation: 0.78, stretchiness: 0.88, releaseSnap: 1.32, rotationSpring: 1.35, rotationDamping: 1.2, rotationAmount: 0.85 } },
    qiankun: true,
    particleType: "spark",
  },
];

export const TINTS: TintDef[] = [
  { name: "原色", mul: 1.0, sat: 1.0 },
  { name: "更透", mul: 1.12, sat: 0.85 },
  { name: "更浓", mul: 0.88, sat: 1.15 },
  { name: "樱花", hueShift: -0.04, mul: 1.05 },
  { name: "海盐", hueShift: 0.08, mul: 1.05 },
];
