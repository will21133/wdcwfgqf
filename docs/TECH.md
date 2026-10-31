# 技术设计 (Tech Design)

> 程序部

## 技术栈
- **TypeScript + Vite**，零运行时依赖，自研轻量引擎。
- 发行：Web（单文件 HTML，可直接游玩）+ Electron 封装（Steam 版，见 `docs/STEAM.md`）。

## 渲染管线（每帧）

```
[世界层 Canvas2D 640x360]
  地板(房间预渲染) → 贴花层(持久: 血迹/焦痕) → Y 排序实体 + 墙立面 → 墙顶 → 粒子
        │
        ├─ × 光照图 (multiply)：环境色 + 点光源(lighter)
        ├─ + 发光层 (lighter)：子弹、残响、火花
        ▼
[WebGL2 后期]  泛光(1/2→1/4 降采样模糊) · 色差 · 暗角 · 颗粒 · 色彩分级 · 回溯扭曲 · 受击红晕
        ▼
[屏幕 canvas#screen]  锐利双线性（或整数倍）放大，黑边居中

[UI 层 canvas#ui，设备分辨率，叠在 #screen 之上，不经过任何后期]  (2.0 / F1)
  逻辑坐标仍是 640x360（上下文带 setTransform(s)）；文字/数字以整数倍 m=textMul(s) 位块贴图并对齐设备像素，
  fillRect / drawImage 自动对齐设备网格。世界标签（交互提示、路牌、伤害数字、横幅、商店说明、NPC 气泡）
  通过 r.label() / r.worldUi() 在世界之后、HUD 之前画进这一层，所以回溯扭曲、色差、泛光都碰不到它们。
```

## 模块

```
src/
  main.ts                启动、加载字体、生成美术资源、进入标题
  engine/
    loop.ts              固定步长 60Hz 更新，可变渲染
    input.ts             键鼠/手柄、可重绑定、输入缓冲
    gfx/                 renderer, post(WebGL), sprite(调色板 DSL → canvas, 自动描边/闪白), font(像素字体阈值化缓存), light, camera
    audio/               合成器、音效定义、音乐音序器、混响
    particles.ts, tween.ts, math.ts, rng.ts(种子随机), save.ts, scene.ts(场景栈 + 转场)
  art/                   palette、角色/敌人/道具/图标/立绘的像素定义、程序化瓦片
  game/
    data/                weapons, enemies, memories, parts, events, rooms, i18n（全部数据驱动）
    entities/            player, echo, enemies/*, projectiles, pickups, props
    systems/             combat(伤害/状态/顿帧), rewind(记录/回放), effects(钩子事件总线)
    world/               room(瓦片/碰撞/生成), floor(房间图), run(一局状态)
    ui/                  hud, panels, menus, dialogue, cards
    scenes/              title, hub, game, death, victory, credits
```

## 关键系统

### 回溯 (rewind.ts)
- 环形缓冲记录 `Frame {x, y, aim, anim, hp, fixedDmgAcc}`，60Hz，容量 = 窗口 × 60。
- 动作事件 `{tick, type, payload}` 单独记录。
- 回溯：复制缓冲 → 生成 `Echo`，Echo 每 tick 读取下一帧并触发同一 tick 的事件，调用**同一套武器代码**（`owner.isEcho = true`，伤害乘系数）。

### 效果钩子 (effects.ts)
回忆/零件/校准全部通过事件总线挂钩：`onHit, onKill, onDash, onRewind, onEchoSpawn, onEchoAttack, onParadox, onRoomClear, onDamaged, modifyDamage, modifyStats …`。新增内容 = 新增数据条目，不改核心代码。

### 碰撞
- 地形：瓦片网格 AABB 解算（分轴）。
- 实体：空间哈希，圆形碰撞体；攻击为一次性 Hitbox（圆/扇形/胶囊），每个 Hitbox 对同一目标只命中一次。

### 存档
`localStorage`（Electron 版写入用户目录）：局外进度、设置、图鉴、统计。局内不存档（肉鸽标准），但支持"暂停并退出后继续"的快照。

- **存档 v2**（`src/game/save.ts`，键 `secondhand.profile.v2`，PLAN2 §1.11）：1.0 字段 + 注册表字段（`achievements secrets flags unlocks chimes cosmetics hints stats mastery affinity rescued contracts clockNodes lastSeen deathTapes prologueDone daily termSeen taught migration`）。读取时用 `normalize()` 补齐缺失字段，坏档另存为 `….v2.corrupt`。
- **v1 迁移**：没有 v2 档但有 `secondhand.profile.v1` 时自动迁移：按冻结的 1.0 成本表 `V1_NODE_COSTS` 退还主发条碎片（武器节点保留、不退款，因为武器保留），保留武器/计数/图鉴/lore/伊妮丝进度，`wins ≥ 1` 解锁 `contracts`，`profile.migration = {from:1, refund, nodes}` 供工坊提示。v1 键原样保留作备份。测试档：`tools/fixtures/profile_v1.json`（3 个节点，退还 77 → 100 碎片）。
- 设置（`secondhand.settings.v1`）新增：`textSize 100|125`、`hudLabels`/`termHints 'auto'|'always'|'off'`、`rewindMode 'both'|'tap'`、`flashLimit`；`showDamage` 已接入伤害数字。`?lang=` 在本次会话里优先于存档语言。

### 共享注册表（F1，PLAN2 §1.2）
- `meta/registry.ts`：成就 / 解锁 / 外观 / 十一响 / Flags / Stats / Secrets / Terms / Teach。首次获得时弹右上角提示（`ui/notices.ts`，全局层，main.ts 在场景之后绘制）并在当前世界总线上发 `achievement|secret|chime {id}`；`onMeta()` 收所有首次事件。Stats/Flags/Terms 标脏，每 4 秒或页面隐藏时写盘。
- `strings.ts`：`registerStrings / S`，术语表 `TERMS`（GDD2 §9.8 全部 24 条：name / plain / detail）。`widgets.drawTermLabel` 读它，白话行是否显示由 `Terms.showPlain(id)` 决定（设置 auto = 每个词前 3 次）。打开展示术语的界面时调用一次 `Terms.seen(id)`（1.5 秒内重复调用只算一次）。
- `ui/hints.ts`：伊妮丝的便条。每存档一次、20 秒节流、每房间一张、首领战期间与转阶段后 4 秒内排队（`hintsHooks.busy`、`Hints.hold`），换房间时丢弃未显示的。`pause:true` 在单人时推一个阻塞 overlay 冻结游戏。卡片在左下角（x 8，底边 326，宽 232），由 main.ts 在场景之后绘制；带 `hidesNotes` 的面板（暂停、设置、构筑、账簿……）打开时隐藏并暂停计时。
- `ui/panels.ts`、`debugRoutes.ts`（boot 先跑路由；内置 `?scene=…` 与 `?debug=registry` 也是路由）、`clock.ts`（`RealClock`，`?fakeTime=2026-10-31T23:59:30` 从该时刻起走）。
- QA 句柄：`window.__reg`（注册表）、`__save`（存档模块，`__save.profile`）、`__hints`。`tools/shot.cjs` 脚本步骤支持 `setStorage / removeStorage / reload / eval`。
- 文字大小 125%：`textScale.boost` 让文字倍率在 ≤150% 的前提下升一级整数倍（窗口太小时不变）；`textScale.r` 是本帧相对 100% 的放大比，固定行高的布局（`MenuList.rh`）按它放大。
