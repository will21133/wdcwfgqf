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
