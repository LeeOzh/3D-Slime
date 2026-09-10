# 捏捏乐 · 3D Squishy Toy

基于 **Vite + TypeScript + Three.js** 的 3D 数字解压玩具。

捏 → 局部形变 → 表情 → 音效 → 粒子 → 弹性回弹 → Combo / 成就 / 睡眠。

---

## 快速开始

```bash
npm install
npm run dev      # http://localhost:8765
npm run build    # tsc --noEmit && vite build → dist/
npm run preview
```

也可双击项目根目录的 `打开本地服务.command`。

---

## 技术栈

| 项 | 选型 |
|---|---|
| 构建 | Vite 5 |
| 语言 | TypeScript（strict） |
| 3D | Three.js r170（npm） |
| UI | 原生 DOM + CSS（无 React / Vue） |
| 音效 | Web Audio 合成（无外部资源） |
| 持久化 | localStorage |

约 **4400 行**，31 个源文件。无后端、无账号、无商城。

---

## 目录结构

```
3d-slime-squeeze/
├── index.html              # 壳：canvas + UI 骨架 + /src/main.ts
├── package.json
├── vite.config.ts
├── tsconfig.json
├── assets/                 # 旧全局 Three 包（已不引用）
├── legacy/                 # 迁移前单文件备份
└── src/
    ├── main.ts             # bootstrap：模块接线 + 主动画循环
    ├── core/               # EventBus · types · constants · utils
    ├── three/              # 场景 / 角色 / 形变 / 交互 / 粒子 / 音效 / 相机
    ├── game/               # Combo · 成就 · 日报 · Idle
    ├── data/               # 成就 / 彩蛋 / 区域文案
    ├── storage/            # StorageManager
    ├── ui/                 # 面板 / Toast / 动态文案
    └── styles/main.css
```

### 模块关系

```
                    main.ts
                       │
              AnimationLoop（单一 RAF）
                       │
     ┌─────────────────┼─────────────────┐
     ▼                 ▼                 ▼
 CharacterMotion   Deformation      Expression
     │                 │                 │
     └──── GameState（共享可变状态）──────┘
                       ▲
                       │
                 SquishSystem ── EventBus ── UI / Storage / Achievements
                       │
              Combo · Sound · Particles · CameraFeedback · Idle
```

**设计原则**

- UI 层不直接操作 Three 核心逻辑
- 系统间用轻量 EventBus 通知
- 形变 / 表情 / 粒子 / 音效均从统一 `SquishState.pressure` 派生
- 单一 `requestAnimationFrame` 主循环

---

## 核心数据

### GameState（会话内共享状态）

```ts
GameState {
  character, pressStrength, squash, stretch, wobble, ...
  squish: { isPressing, pressure, area, velocity, duration, ... }
  combo, comboLevel, sleepy, pressPeak
  earLag / headLag / sideComp   // Secondary Motion
}
```

### localStorage

| Key | 内容 |
|---|---|
| `squishy_stats` | 总次数 / 今日 / Combo / 压力 / 区域 / 按日 |
| `squishy_collection` | 成就 / 彩蛋解锁 |
| `squishy_settings` | 音效 / 粒子开关 |

损坏 JSON 会安全回退到默认值。

---

## 功能

### 交互（P0）

- Pointer Events + Raycaster，鼠标 / 触摸统一
- **局部凹陷**：smoothstep falloff，按哪凹哪
- 外圈鼓起、拖拽横向 rub
- **Spring 回弹** + overshoot
- **Secondary Motion**：耳滞后、头滞后、对侧补偿
- **区域识别**：左/右脸、头顶、肚子、左/右耳、嘴

### 表情与反馈（P1–P2）

- 压力阶梯：惊讶 → 痛苦 → 强压；高 Combo 兴奋；狂捏晕眩
- Canvas 脸 + 开合量平滑 blend（非硬切）
- **Combo**：2s 窗口、`COMBO × N`、effect cap
- **粒子**：角色类型（star / dust / bubble / heart / spark），池化复用
- **音效**：捏 / 松 / Combo / 特殊；首次交互后 unlock；可开关
- **相机**：重捏轻 zoom，高 Combo 微 shake（`prefers-reduced-motion` 时关闭）

### 角色人格（P2）

五个角色，配置驱动：

| 角色 | 粒子 | 物理倾向 |
|---|---|---|
| 圆宝 | star | 基准软弹 |
| 布丁仔 | dust | 更塌、更抖 |
| 滴滴 | bubble | 浅压、回弹快 |
| 爪爪 | heart | 中等、有弹性 |
| 哪吒 | spark | 更硬、更弹 |

每角色可配：`squishStrength` / `springK` / `damping` / `particleType` / `lines` / `face`。

### 游戏层（P3–P4）

- **统计**：累计 / 今日 / 最高 Combo / 平均压力 / 最常捏区域
- **成就** 9 项 + **彩蛋** 7 项 + 轻量 Toast
- **今日报告 + 图鉴**（右上 📊）
- **Sleepy**：30s 无操作 → 闭眼 💤，捏醒
- **Idle**：呼吸 + 每 8–15 秒微动作
- **动态 badge**：轻捏 / 连捏 / 狂捏 / 松手 / 睡着等限频文案

### 产品边界

刻意不做：商城、账号、后端、排行榜、重型物理引擎、Dashboard 式 UI。

---

## 质量状态

| 项 | 状态 |
|---|---|
| `tsc --noEmit` | 通过 |
| `vite build` | 通过 |
| Console error | 0 |
| 统计双计 | 已修复（UI 次数 = localStorage total） |
| 报告层遮罩 | 已修复（`hidden` 时不挡交互） |

---

## 已知边界

1. 角色为程序化球体 + Canvas 脸，非 GLTF 绑定模型  
2. 粒子为 Mesh 池（48 个），非 InstancedMesh  
3. 表情为状态 + 开合 blend，非全权重交叉淡化  
4. 无场景主题 / 皮肤系统  
5. 未做真机 FPS profiling  

---

## 架构迁移说明

项目由单文件 HTML（`legacy/index.legacy.html`）迁移为 Vite + TypeScript 模块化架构：

- Three.js 从全局脚本改为 npm 依赖  
- 业务拆分为 `core` / `three` / `game` / `ui` / `storage` / `data`  
- 视觉与交互行为保持与 V1 一致，并在其上完成 V2 软体与游戏层升级  

旧文件保留在 `legacy/` 与 `assets/` 供对照，运行时不再引用。
