export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "FIRST_SQUISH", name: "初次解压", desc: "第一次捏" },
  { id: "COMBO_10", name: "手感不错", desc: "Combo ×10" },
  { id: "COMBO_20", name: "解压大师", desc: "Combo ×20" },
  { id: "SQUISH_100", name: "百捏达人", desc: "累计 100 次" },
  { id: "SQUISH_1000", name: "千捏传说", desc: "累计 1000 次" },
  { id: "MAX_PRESSURE", name: "全力以赴", desc: "达到最大压力" },
  { id: "GENTLE", name: "温柔手指", desc: "连续 20 次轻捏" },
  { id: "MIDNIGHT_PLAYER", name: "深夜解压", desc: "凌晨 0–5 点打开" },
  { id: "ALL_AREAS", name: "全身探索", desc: "捏过所有区域" },
];

export const EASTER_EGGS: AchievementDef[] = [
  { id: "EGG_66", name: "六六大顺", desc: "累计捏 66 次" },
  { id: "EGG_100", name: "百发百中", desc: "累计捏 100 次" },
  { id: "EGG_666", name: "六六六", desc: "累计捏 666 次" },
  { id: "EGG_888", name: "发发发", desc: "累计捏 888 次" },
  { id: "EGG_1000", name: "千锤百炼", desc: "累计捏 1000 次" },
  { id: "EGG_COMBO_50", name: "连击狂魔", desc: "Combo ×50" },
  { id: "EGG_SLEEP", name: "吵醒它了", desc: "从睡眠状态捏醒" },
];

export const AREA_LABELS: Record<string, string> = {
  "left-cheek": "左脸",
  "right-cheek": "右脸",
  top: "头顶",
  belly: "肚子",
  "left-ear": "左耳",
  "right-ear": "右耳",
  mouth: "嘴巴",
  unknown: "身体",
};

/** Areas required for ALL_AREAS (skip unknown). */
export const REQUIRED_AREAS = [
  "left-cheek",
  "right-cheek",
  "top",
  "belly",
  "left-ear",
  "right-ear",
  "mouth",
] as const;
