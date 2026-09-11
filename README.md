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
  softBody: SoftBodyState  // V3: pressureField / stretch / pinch / release
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

### V3 Soft Body Physics

在 V3 之上叠加轻量级软体近似（无 Ammo / Cannon / Rapier）：

| 系统 | 说明 |
|---|---|
| **Pressure Field** | 左/右脸、顶、腹、耳、嘴独立压力 |
| **Pressure Propagation** | 邻接权重 + 平滑传播，左脸按压会传到腹/右脸 |
| **Volume Compensation** | 左压右鼓、整体体积感补偿 |
| **Spring-Damper** | 非线性弹簧：变形越大回弹越强 |
| **Stretch / Drag** | 锁定区域后可拉脸；阻力随距离平方增大 |
| **Ear Stretch** | 拉耳朵独立形变，过猛触发 angry |
| **Multi-touch Pinch** | 双指沿连线轴向捏合/拉开（横/纵/斜） |
| **Release Wave** | 按释放速度产生 impulse + 全身波回弹 |
| **Pointer Map** | `Map<pointerId, PointerState>`，支持 pointercancel / capture |

调试：打开 `?debug=softbody` 查看 Mode / Pressure / Stretch / Pinch / FPS。

角色软体差异通过 `personality.soft` 配置（softness / propagation / stretchiness / releaseSnap），不复制逻辑。

### V3.2 角色生命感

不操作时也像活着；一操作情绪立刻接上。

| 层级 | 内容 |
|---|---|
| **L1 眼神** | hover/按住时眼珠跟 pointer（`glance` + NDC）；移开慢慢回中 |
| **L2 闲置** | 深呼吸、双眨、左右巡视、无聊、哈欠（`IdleSystem` 行为表） |
| **L3 情绪** | `mood`：happy / annoyed / excited / dizzy / bored / sleepy；优先级高于压力阶梯 |
| **L4 文案** | 「诶，你在看我吗？」「好无聊…」「哈～好困」等限频 badge |

情绪映射（摘要）：

- 轻捏 → happy  
- 拉耳 / 重捏 → annoyed / angry  
- combo≥5 → excited；连捏 → dizzy  
- 久等 → bored → 哈欠 → sleepy；再捏 → 吓一跳  

`prefers-reduced-motion`：保留表情/视线，弱化巡视与大动作。

### 抚摸 Pet / Boop

- **抚摸**：按住在表面小范围搓动（不拉扯身体）→ 扩散软波纹 + 轻粒子 + 柔和音 + 开心  
- **Boop**：&lt;0.3s 轻点且未拉扯 → 眨眼 + 小 bounce + 「啵！」+ 专用音效  
- 拉伸阈值略提高，避免小搓动被误判成 Stretch

### 性能

- **画质锁定**：手机/桌面均为 96 段球、透射/清漆/光泽、DPR 2、AA；**不**运行时自动降画质
- **V4 GPU 形变（默认开）**：`MeshPhysicalMaterial.onBeforeCompile` 注入顶点形变 + 有限差分法线；CPU 只写 uniforms  
  - 回退：`?gpuDeform=0`
- P0 CPU 路径（回退时仍更快）：FrameContext、`restDir` 缓存、活跃区域循环
- 脸部 Canvas 限频（iOS）；空闲法线隔帧

Debug：`?debug=softbody` 可看 FPS / draw calls / **Deform: GPU|CPU**。

### V3.1 Soft Body Pose Feedback

身体姿态随软体受力变化（**不是**自由旋转 / OrbitControls）：

| 来源 | 姿态反馈 |
|---|---|
| **Pressure** | 左脸按 → 向右歪；右脸按 → 向左歪；顶/腹影响前后倾 |
| **Stretch** | 拖拽方向驱动 roll / pitch，幅度随拉伸量增大 |
| **Ear Pull** | 耳朵先被拉走，身体只轻微跟倾 |
| **Pinch** | 辅助姿态（挤压仍是主反馈） |
| **Release** | 保留角速度 → 回正 overshoot → 稳定 |

实现要点：

- 统一 `rotationTarget` + Spring-Damper（`force = -k·x - c·v`）
- 角度 clamp（身体约 ±8°），速度 clamp，`prefers-reduced-motion` 降幅度
- 角色差异：`soft.rotationSpring` / `rotationDamping` / `rotationAmount`
- 层级：SoftBody Rotation → Body → Head/Ear Secondary Motion

**V3.1.1 姿态统一 / 耳朵抓取**

- `composeBodyForce`：Scale / Position / Rotation 共用同一套 pressureCenter + stretch + pinch 输入
- 拉耳：局部 `earStretch` + `earTilt` 独立弹簧（可到 ~14°），身体只轻微跟倾
- 松手：耳 snap-back impulse + 身体 follow-through
- 哪吒发髻 bun mesh 有独立 offset / 拉长 / 局部 rotation

Debug：`?debug=softbody` 显示 Rotation / Target / Velocity / Ear（角度）。

### 表情与反馈（P1–P2）

- 压力阶梯：惊讶 → 痛苦 → 强压；高 Combo 兴奋；狂捏晕眩
- 拉伸：drag → pain → angry；双指：surprised / pain；快松：dizzy
- Canvas 脸 + 开合量平滑 blend（非硬切）
- **Combo**：2s 窗口、`COMBO × N`、effect cap；一次完整 gesture 只计 1 次
- **粒子**：角色类型（star / dust / bubble / heart / spark），池化复用
- **音效**：捏 / 拉伸 / snap / pinch / 松 / Combo；首次交互 unlock；可开关
- **相机**：重捏轻 zoom，高 Combo 微 shake（`prefers-reduced-motion` 时关闭）

### 角色人格（P2）

五个角色，配置驱动：

| 角色 | 粒子 | 物理倾向 | Soft Body |
|---|---|---|---|
| 圆宝 | star | 基准软弹 | 软、传播明显、回弹慢 |
| 布丁仔 | dust | 更塌、更抖 | 最软、易形变、略晃 |
| 滴滴 | bubble | 浅压、回弹快 | 轻、传播浅、snap 强 |
| 爪爪 | heart | 中等、有弹性 | 拉伸感强 |
| 哪吒 | spark | 更硬、更弹 | 硬、overshoot 最明显 |

每角色可配：`squishStrength` / `springK` / `damping` / `soft` / `particleType` / `lines` / `face`。

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
6. 软体为区域压力场近似，非 FEM / PBD / SPH  
7. 双指捏合轴向压缩为屏幕轴近似，非任意 3D 轴投影  

---

## 架构迁移说明

项目由单文件 HTML（`legacy/index.legacy.html`）迁移为 Vite + TypeScript 模块化架构：

- Three.js 从全局脚本改为 npm 依赖  
- 业务拆分为 `core` / `three` / `game` / `ui` / `storage` / `data`  
- 视觉与交互行为保持与 V1 一致，并在其上完成 V2 软体与游戏层升级  
- V3 在现有架构上增量加入 SoftBodySystem / 多指 / 压力传播，未推翻角色与反馈系统  

旧文件保留在 `legacy/` 与 `assets/` 供对照，运行时不再引用。
