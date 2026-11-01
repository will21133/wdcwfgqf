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
  r.label / r.worldUi 只能在渲染代码里调用（每帧队列，begin() 清空；在 update 里调用会在开发模式警告一次）。
  m = round(s)（GDD2 §12.1）。于是文字是布局尺寸的 k = m/s 倍：960×540 以上的窗口为 0.8–1.33
  （1280×720 / 1920×1080 恰好 1.0），更小的窗口 0.67–1.0；文字大小 125% 再升一级，最多到 1.5。所有装文字的框都从 Text.lineH / measure / inkH 推出尺寸，
  固定高度的行、键帽、芯片、横幅里的文字用 valign:'middle'（按字身居中），所以任何 k 下都不溢出、不偏。
  UI 上下文的变换在 JS 里有镜像（ctx.__t），逐字/逐矩形取变换不分配对象。
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

- **存档 v2**（`src/game/save.ts`，键 `secondhand.profile.v2`，PLAN2 §1.11）：1.0 字段 + 注册表字段（`achievements secrets flags unlocks chimes cosmetics hints stats mastery affinity rescued contracts clockNodes lastSeen deathTapes prologueDone daily termSeen taught migration`）。读取时用 `normalize()` 补齐缺失字段，坏档另存为 `….v2.corrupt.<时间戳>`（每次一份，不覆盖），然后若有 1.0 存档就重新迁移，否则新档。`lastSeen` 用真实时钟 `Date.now()`（不受 `?fakeTime=` / 冻结时钟影响）。
- **v1 迁移**：没有 v2 档但有 `secondhand.profile.v1` 时自动迁移：按冻结的 1.0 成本表 `V1_NODE_COSTS` 退还全部已花费的主发条碎片（GDD2 §10.3"退还所有已花费的碎片，保留已解锁武器"：武器节点也退款，武器照样保留；武器节点等级仍记在 `nodes` 里，免得 1.0 发条台在 P6 替换之前再卖一次已有的武器），保留武器/计数/图鉴/lore/伊妮丝进度，`wins ≥ 1` 解锁 `contracts`，`profile.migration = {from:1, refund, nodes}` 供工坊提示。v1 键原样保留作备份。测试档：`tools/fixtures/profile_v1.json`（3 个节点，退还 77 → 100 碎片）。
- 设置（`secondhand.settings.v1`）新增：`textSize 100|125`、`hudLabels`/`termHints 'auto'|'always'|'off'`、`rewindMode 'both'|'tap'`、`flashLimit`；`showDamage` 已接入伤害数字。`?lang=` 在本次会话里优先于存档语言，直到玩家在菜单里换语言。`settingsLive.{rewindMode,hudLabels}` 为 false 时这两项不出现在设置菜单里（F3 / P1 接好后改为 true）。

### 共享注册表（F1，PLAN2 §1.2）
- `meta/registry.ts`：成就 / 解锁 / 外观 / 十一响 / Flags / Stats / Secrets / Terms / Teach。首次获得时弹右上角提示（`ui/notices.ts`，全局层，main.ts 在场景之后绘制）并在当前世界总线上发 `achievement|secret|chime {id}`；`onMeta()` 收所有首次事件。Stats/Flags/Terms 标脏，每 4 秒或页面隐藏时写盘。
- `strings.ts`：`registerStrings / S`，术语表 `TERMS`（GDD2 §9.8 全部 24 条：name / plain / detail）。`widgets.drawTermLabel` 读它，白话行是否显示由 `Terms.showPlain(id)` 决定（设置 auto = 每个词前 3 次）。打开展示术语的界面时调用一次 `Terms.seen(id)`（1.5 秒内重复调用只算一次）。
- `ui/hints.ts`：伊妮丝的便条。每存档一次、20 秒节流、每房间一张、首领战期间与转阶段后 4 秒内排队（`hintsHooks.busy`、`Hints.hold`），换房间时丢弃旧房间里排队的（进入新房间那一帧——构造函数、enter()——请求的便条属于新房间，经 `G.scenes.onSwitch` 判定）；排队的便条只在本可以显示的时间里计 30 秒寿命（首领战不算）。`pause:true` 在单人时推一个阻塞 overlay 冻结游戏。卡片在左下角（x 8，底边 326，宽 232），由 main.ts 在场景之后绘制；带 `hidesNotes` 的面板（暂停、设置、构筑、账簿……）打开时隐藏并暂停计时。
- `ui/panels.ts`、`debugRoutes.ts`（boot 先跑路由；内置 `?scene=…` 与 `?debug=registry` 也是路由）、`clock.ts`（`RealClock`，`?fakeTime=2026-10-31T23:59:30` 从该时刻起走）。
- QA 句柄：`window.__reg`（注册表）、`__save`（存档模块，`__save.profile`）、`__hints`。`tools/shot.cjs` 脚本步骤支持 `setStorage / removeStorage / reload / eval`。
- 文字大小 125%：`textScale.boost` 让文字倍率在 ≤150% 的前提下升一级整数倍（窗口太小时不变）；`Text.k` 是本帧文字相对布局的大小，`MenuList.rh` 等固定行高按 `Text.lineH` 增长；奖励卡按实测文字加宽（3 张时最多 200）、加高、下移，实在放不下时先去掉页眉引言，再把描述 / "将替换"降到 10px。
- 字体子集：`tools/subset-fonts.py` 写 `build/fonts/*.woff2` 和 `.stamp`；缺 fontTools 时删除旧子集；`vite.config.ts` 只在 `.stamp` 比所有源文件都新时使用子集，否则打完整字体并警告。

### 输入、设备与玩家槽位（F2a，PLAN2 §1.3）
- `engine/input.ts`：`raw`（键盘/鼠标 + 按 `gp.index` 的每个手柄，边沿锁存到本 tick 结束）、`PlayerInput`（每个槽位一个：`down/pressed/released/consume/heldFor/move/aim/nav/rumble`，`slot device kind lastDevice bindings bot?`）、`input`（= `G.input`，1.0 API 的菜单聚合：所有已加入设备的 OR，无人加入时 = 全部设备）。三套键盘表 `KB.kbm / kbL / kbR`（GDD2 §2.1–2.2；`settings.bindings` / `settings.bindingsKb` 分别重绑），手柄表 `PAD_BUTTONS`（LB 回溯 / RB 分岔，`settings.padSwap` 交换）。新动作 `fork tabL tabR`。
- `engine/devices.ts`：`devices`（= `G.devices`）管理槽位：`claim / release / joinPressed / ensureSolo / onDisconnect / onJoin / onSequence / offSequence / recentCodes`。**单人规则**：只有一名真人时他的 `PlayerInput.merged = true`，读取所有键盘、鼠标与手柄（与 1.0 完全一样，单人随时换手柄/键鼠）；他最后实际用的设备（`raw.lastPhys`，鼠标移动不算）属于他。因此单人旁边的空闲设备要**按住** A/Start/Enter `JOIN_HOLD`（0.8 秒）才加入（`devices.joinHold` 给出进度，`renderJoinHold` 画顶部中央的"按住：第二根指针加入"；轻按仍是单人自己的冲刺/确认，工坊里轻按后提示 1.6 秒）；已有两名以上真人、或在标题的加入面板（`devices.setLobby(true)`：谁都不合并，每个座位只读自己的设备）时轻按即加入。第二名真人加入时单人固定到自己正在用的设备（按下加入键之前的那个）；`claim()` 绝不驱逐合并中的单人（唯一已知设备就是被认领的设备时拒绝并返回单人的输入）。还没碰过任何设备时，第一下按键属于他（不会加入新玩家）。菜单聚合 `G.input` 只在没有真人入座时才包含机器人（否则机器人的随机确认会关掉暂停菜单）。被释放的 `PlayerInput` 什么也不读。`devices.lostSlots()`：已入座但断开且没回来的手柄（工坊/房间/标题每帧轮询，所以在结算、过场里断开的手柄也会弹出断线暂停；从未连接过的手柄——如 `?devices=pad0` 而没有手柄——不算）。
- `engine/rumble.ts`：`rumblePad(index,…)`、`rumbleAll(…)`（已加入玩家的手柄；单人 = 全部）；玩家自己的震动用 `p.input.rumble(…)`，命中等归属效果用 `players.rumbleOwner(owner,…)`。`window.__rumbles[index]` 记录每个手柄收到的效果数。
- `game/players.ts`：`SLOT_COLOR SLOT_SHAPE ROMAN SLOT_SCARF SLOT_RAMP drawSlotBadge ensurePlayers rumbleOwner initPlayersFromUrl`。`art/sprites/tick.ts` 的 `buildTick(pal?, variant?)` 按 (variant, pal) 缓存帧；`Player` 由 `tickFramesFor(slot, hand)` 取带槽位围巾色的帧，多人时脚下画槽位色像素环、头顶 3px 画形状徽记、内圈小灯染槽位色。
- 调试：`?bot=1`（槽 I 为机器人，1.0）、`?bot=1&players=N`（N 个机器人）、`?players=N`（你 + N−1 个机器人）、`?devices=kbm,pad0,kbL,…`（按顺序入座；`players` 可再补机器人）。带 `players`/`devices` 时与 `seed` 一样直接进局；`?scene=hub&players=N` 在工坊入座。工坊热加入（最小版）：空闲手柄按 A/Start 或空闲键盘按 Enter，新表针从落地钟前出现（F2c 补钟门动画、铭牌、离开与标题加入面板）。测试：`node tools/padtest4.cjs "scene=hub"`（4 个虚拟手柄）。

### 世界、局状态拆分、停摆与共享镜头（F2b，PLAN2 §1.4 / §1.5，GDD2 §5.3–5.5、§5.8）
- **局状态** `run.ts`：`Run`（共享：`config rng seed floor roomIndex time brass shards stats history lore eventsSeen floorState flags overwind bonuses loadouts`，`lo(slot) addBrass spendBrass recompute registerHooks(w)`）+ `Loadout`（每人：`hand weapon hp sand charges mods memories hourglass parts calibrations keystone pact rerolls banishes locks tape tempo bonuses luck autoRewindLeft shieldReady revivesUsed`，`recompute registerHooks(w,p) addSand spendSand sandMax has ctx liveCtx key`）。`run.lo(slot)` 按需建档（局中加入的玩家拿到新档，继承局级元加成）。1.0 的"充能"经济暂留在 `Loadout.charges`（F3 改为单一时砂池）。`RunConfig` + `Flow.startRun(config?)`（默认从已入座玩家生成；`Flow.configFromSeats()`）。
- **钩子**：`HookCtx { w, run, lo, p, on, onMine }`；`onMine` 只收 `e.player === p` 的事件。所有回忆/零件/校准里玩家相关的订阅（hit kill attack special dash dashEnd rewind paradox perfectDodge damaged）都改成 `onMine`；`tick/roomClear` 仍是 `on`，内部只处理自己的东西（自己的炮台、自己挂的灼烧/定格）。中途获得的物品用 `lo.liveCtx(owner)` 注册；字符串 id 的 bus owner 用 `lo.key(id)`（两人可拥有同一零件）。
- **归属**：`players.ownerPlayer(x)` 把 Player / 残响(`echo.player`) / 带 `owner` 的效果实体解析成玩家；`loOf(x)` 取其 Loadout。`combat.applyDamage` 的时砂返还、`hit/kill` 的 `player`、knockMul/freshDmg 都按攻击者；灼烧/锈蚀/定格/共鸣记录施加者（`st.burnBy rustBy stasisBy resonanceBy`），其后续伤害、上限与倍率按施加者的 Loadout；幽灵指针的时砂给最近的存活队友。治疗类（花、机油、回忆）作用于拥有者；机油（奖励球/商店/首领掉落）治疗全队。
- **世界** `world.ts`：`players player alive() playerCount nearestPlayer(x,y,{alive,taunts}) playersIn(shape) hurtPlayers(shape|pred, info, once?) targetFor(enemy) targetSlotFor(enemy) after every cancelTimers rng timeScaleAt`。`world.after/every` 走模拟时间（暂停、顿帧、倍速都会影响），替换了 maul/memories/parts/special 里的 setTimeout。`world.rng` 由房间种子（来自 `run.rng`）派生，首领出招队列用它洗牌。
- **仇恨**（GDD2 §5.8）：`Enemy.target` = 存活玩家（及 `echo.taunt > 0` 的残响）中评分最高者，评分 `1/距离(格) + 0.5 × 最近 3 秒对它造成伤害的占比`，锁定至少 1.5 秒；单人 = 玩家本人（1.0）。没有目标时敌人原地待命（修复了 1.0 玩家死亡时小螨虫空指针的潜在崩溃）。多人时预警线/扇形尖端画目标玩家颜色的小点。导航：多源 BFS 流场 + 每个玩家一张，敌人朝自己的目标寻路。
- **停摆** `systems/downed.ts`：`Player.state = 'alive' | 'stopped' | 'ghost'`，`Player.revive(frac, by, source)`。单人"最后一秒"：1.5 秒 0.2× + 屏幕中央"回溯！"，按回溯（或分岔键，F2a 的临时映射）照常付费回溯；否则 1.0 的停摆画面。多人：12 刻度环（1.25 秒灭一格，15 秒）、头顶裂开的小钟面、队友 20px 内按住交互 1.2 秒上弦（35%，1.5 秒无敌，钥匙转 4 圈，进度条用上弦者颜色）、队友已就绪残响走过 = 20%、前 3 秒可自救、15 秒后变幽灵（可移动、轻点 1 伤害），下个房间开始 25% 复活。全员停摆/幽灵（且没有人还在自救窗口里）→ 本局结束。F3/P5 的接缝：`DownedHooks.rewindOut / canRewindOut / pullBack / windupTime`。
- **共享镜头** `world/coopCamera.ts`（仅多人）：存活玩家中点、无前瞻；拴绳 600×340 以镜头目标为中心（不受镜头滞后影响），碰边时屏幕边缘发推挤者颜色的光；出屏玩家在屏幕边缘显示其颜色的箭头 + 形状徽记（停摆者闪烁，避开 HUD）；出屏 2 秒自动"追赶回溯"到最近的队友。`Camera.centre() / centreOf(x,y)`。
- **门**：所有存活玩家站进同一扇门 → 进入；超过半数站进 2.5 秒 → 进入；多人时门旁显示 `n/N` 与已进门玩家的形状，等待的玩家画在门洞前面。单人一踏进就走（1.0）。
- **人数缩放** `world/coopScale.ts`（GDD2 §5.8 表）：普通/精英首领生命（`Enemy.added`）、波次预算（`planWaves(..., budgetMul)`）、黄铜（敌人掉落、黄铜房）、每人残响上限（`Loadout.recompute`）；破绽条、精英额外词缀、首领额外弹幕只提供数值（P1/P2/P3 接入）。商店每多 1 人多 1 件零件；价格按买家的 shopMul。
- 测试：`tools/scripts/coop.json`（P2 停摆 → 截图 12 刻度环 → P1 机器人上弦 → eval 读出 `revived {source:'windup', frac:0.36}`）。

### 奖励、HUD 铭牌、加入流程、全局钩子与注册表（F2c，PLAN2 §1.5 / §1.6 / §1.7，GDD2 §5.1 / §5.8 / §12.2）
- **每人奖励**（`scenes/game.ts`）：多人时回忆/沙漏/校准门清场后每人掉一个 `RewardOrb(…, owner=slot)`（地面像素环 + 头顶形状徽记，只有本人——站着或幽灵——能拿；主人不在座时谁都能拿）；零件门每人各 roll 一个 `Chest(…, owner)`；机油、黄铜、碎片仍是一份。`openChoice` 在多人时打开 `ChoiceOverlay(…, place)`：`place = { input, rect, slot, blocks, anchor }`，由该玩家自己的设备操作（按键图标用他自己的键位，`drawHint(…, who)`），位于他那一半屏幕（I/III 左、II/IV 右，顶部铭牌之下），同侧有两人时改为四分之一屏（覆盖自己的铭牌）。紧凑列表：表头（槽位色条 + 徽记 + 罗马数字 + 图标 + 标题）、每行"图标 · 名称（稀有度色）· 标签"、下方是所选卡的说明框（按最长的说明定高，放不下时先去掉风味文字、再降为 10px）、按住怀表键（Tab / View）展开完整卡面。选卡的人原地锁定，其他人照常走动；房间里还有敌人时面板才冻结世界。同一人的第二个奖励排队等第一个关掉（`choiceQueue`）。有人在选时门不放人（`Door.hold`）、下一波不刷（`anyChoosing()`）。单人完全是 1.0 的全屏三卡。
- **商店**：多人按住交互 0.6 秒购买（提示下方"按住购买"进度条用买家颜色，买过/钱不够后要先松开），共享钱袋；单人仍是按一下（1.0）。**修理台**每人各用一次（`Interactable.accepts(p)`，`usedBy`）。**事件**由第一个交互的人决定，`EventOverlay(…, input)` 只读他的设备。`Toast` 多人时带归属色条与徽记，多个同时出现时分道堆叠。
- **HUD**（`ui/hud.ts`）：`Hud.register({ id, area, order, draw(ctx, p, rect), row?, width?, update?, visible? })`（同 id 替换）、`Hud.podRect(slot)`、`Hud.areaRect(area)`、`Hud.multi`。单人铭牌 176×44 左上、无框，F2 的 `hp`/`sand`/`dash`/`special` 组件按 1.0 的像素位置画（与 1.0 截图逐像素一致，仅沙漏辉光随时间变化）；多人 132×32 四角（`players.drawSlotPlate`：墨线描边 + 槽位色边框 + 亮顶边 + 着色徽记栏：形状 + 罗马数字），行 0 血条 + 数字，行 1 沙漏 + 冲刺点 + 特技表盘；停摆时显示"停摆 + 剩余秒数"并闪框，幽灵显示"幽灵指针"，局中加入待进场的槽位显示"下个房间加入"。中途加入的铭牌从屏幕边缘滑入。`corner` = 共享钱袋（单人右上 = 1.0，多人顶部中央小牌）；`bottom` = 槽位徽记（仅单人，P4 替换）与首领血条；鼠标准星只画给用鼠标的玩家（多人时中心点为其颜色）。便条卡片（`hintsHooks.bottom`）与成就提示（`noticesHooks.top`）在多人时让开铭牌；镜头出屏箭头的上/下边距加到 46。
- **加入流程**（`ui/joinPanel.ts`）：标题菜单"同行 Together"→ `JoinPanel`：4 张槽位卡，空闲设备按 A / Start / Enter / F（左半键盘）/ K（右半键盘）入座，卡上显示表针（槽位围巾、3 倍）、名字、设备标签，按确认 = 准备（盖章），按取消 = 取消准备 / 离开；全员准备 → 工坊。`joinSeat(id, slot)` / `leaveSeat(slot)` 占用/释放槽位并在当前房间总线发 `playerJoin` / `playerLeave`（入座那一下按键被吃掉，不会同时冲刺/确认/翻页）。工坊热加入：落地钟的钟门打开（槽位色光）、表针走出来、横幅"第二根指针醒了"、铭牌滑入；任何时候都能加入（对话、面板开着也行）。离开：多人时按住 View / Tab 1.5 秒（头顶进度条）或暂停菜单"离开（Ⅱ）"（只给打开菜单的那个人）。断线：已加入的手柄断开 → `DisconnectOverlay` 暂停，插回即继续，其他人按 Start / Esc 不带他继续（移除该表针、释放槽位）；标题画面上直接释放。`DeviceHub.release` 之后若只剩一名合并的单人玩家，"最后使用的设备"重置为他自己的设备（否则下一个加入者会把离开者的手柄分给他）。局中加入：空闲手柄 A / Start 或空闲键盘 Enter → 立即占座（铭牌显示"下个房间加入"）、下个房间进场，新 Loadout 带 `catchup = run.floor`，进场 0.7 秒后每层补选 1 个回忆（表头副标题"补选回忆"）。
- **全局钩子**（`hooks.ts`）：`GameHooks.onRunStart/onRoomStart/onRoomClear/onRunEnd/onHub/onTitle/onPauseTick` + `GameHooks.fire.*`（场景调用；监听器抛错只记日志）。`onRunStart` 在一局第一个房间进入时触发（含调试直开的局，`run.started`）；`onRoomStart` 在总线清空、全员钩子注册、`roomStart` 事件之后；`onRoomClear` 带评级（本房间受击 0 = S、≤2 = A、否则 B，`roomClear` 总线事件也带 `grade`）；`onRunEnd` 在 `Flow.endRun`；`onPauseTick` 每帧随暂停菜单。`Cutscenes.register(id, factory, {fade})` / `play(id, then)`：1.0 的 `intro` `ending` `credits` 由 `flow.ts` 注册为默认，未注册的 id 直接 `then()`。
- **注册表**：`rooms/registry.ts` 的 `RoomTypes.register(kind, { label, icon, color?, combat, weight(run, floor, roomIdx), oncePerFloor?, advancesRoom?, build(scene), doorInfo?, door?(run, rng) })`，注册了 1.0 的 combat / elite / shop / event / vault / rest / boss / tutorial；`GameScene.enter` 调 `build()`（非战斗房或没有可打的东西 = 开局即清场）。门表（`rewards.ts nextOptions`）= `COMBAT_REWARDS`（1.0 的六种战斗奖励权重，乘以 combat 类型的权重）+ 各注册类型的 `weight()`，顺序与 1.0 一致：7200 组（种子 × 房间号 × 上一个房间类型 × 楼层状态）与 1.0 原函数逐项比对 0 差异；保留"特殊房不连续出现两次"。`oncePerFloor` 按 `run.floorState.kinds` 计数。`routes.ts`：`Routes.floors(run)`（默认 4 层：id、主题、9 个房间、首领 id、名字、时间码 11:59:59.00/.25/.50/.75）、`floor(run, i?)`、`isLast`、`theme(f)`、`registerBranch({ id, afterFloor, cond, floor })`；`world/bosses.ts` 增加 `BOSS_IDS`、`registerBoss`、`makeBossById`。`progression/events.ts` 导出默认 `pickEvent(run, rng?)`（1.0 的均匀随机）；`progression/patrons.ts` 的 `Patrons.isRescued / rescue / addAffinity / level` 基于存档 `rescued` / `affinity`（P6 填规则）。`?debug=registry` 显示房间类型、楼层、钩子与过场。
- 其他：奖励球/宝箱落点若不在地板上，挪到 6 格内最近的地板（`floorNear`，某些房间中心是书架岛）；多人从入口进场的两列若被门内的道具挡住则改走中间（`lane`）。路线的首领 id 经 `makeBossById` 生成；`advancesRoom: false` 的房间不推进楼层房间计数。
- 测试：`node tools/jointest.cjs [outPrefix]`（标题加入面板 → 工坊、热加入钟门、按住离开、断线暂停/恢复/放弃、局中加入 + 补选；虚拟手柄 + 键盘，17 项检查）。调试：多人时 `?offer=oren` 给每个人各开一份。`tools/padtest4.cjs` 的按键按住时间改为 260 ms（无头浏览器约 7 fps 时 140 ms 的按下/松开会落在两帧之间被漏掉）。

### F2 修复轮（v2-F2 之前）
- **回溯不进墙**：`Player.record()` 只记录可站立的帧（碰撞开启且 `boxFree`）；入场走进门时（碰撞关闭）不录，所以进房间 3 秒内回溯不会回到封死的入口里。`coopCamera` 的追赶回溯也处理**卡住**：嵌在墙里或四个方向 3px 都走不动超过 2 秒 → 瞬移到最近的队友（GDD2 §5.3）。
- **武器架按玩家**：`metaPanels.SeatWeapons`（槽 I = `profile.weapon`，其他槽本次会话有效）；`WeaponOverlay(by)` 由走过去的那只手用自己的设备操作，co-op 时标题旁有槽位标签；`Flow.configFromSeats` 与局中加入都用它。`RunInfoPanel(run, slot, input?)` 与事件窗口在 co-op 时显示槽位标签（`players.drawSlotTag`），构筑面板由打开者自己的设备操作。
- **离开**：`run.away` 记录局中离开的槽位（保留构筑以便回来，但不再计入 `run.playerCount`：残响上限、奖励、门表权重）；最后一个站着的人离开时，剩下的停摆者进入单人"最后一秒"、幽灵按房间开始复活（`downed.nowSolo`）。
- **界面**：`joinPanel.SlotBanners`（UI 层顶部中央的槽位横幅：醒了/下个房间加入/离开了）；加入面板的空卡只显示此刻真能加入的按键，全员准备后有倒计时条，有人刚离开时等 3 秒再出发；断线暂停按剩下每种设备显示各自的暂停键（手柄 Start、键盘 Esc/Backspace），断线者的铭牌变灰显示"手柄断开"；门的 `n/N` 牌限制在屏幕内并避开顶部铭牌/钱袋；出屏箭头在首领血条出现时抬高；停摆 12 刻度环加大（38×16）并有暗色钟面底；单人"最后一秒"改为大字 + 下一行按键与 12px 说明，没时砂时不画按键；世界横幅互相重叠时向上堆叠；四人选卡面板按内容高度贴角并在中间留缝；选卡中的手不被队友推动；槽位 II/IV 围巾只用亮色阶，避免融进表壳/外套。
- **小修**：幽灵的 1 伤害轻点不触发自己构筑的 `onMine` 钩子；幽灵可以打开自己的零件箱；单人有嘲讽残响时也走仇恨评分（P5）；`revived{source:'room'}` 推迟到房间第一帧（钩子都已注册）；标题加入面板入座的 `playerJoin` 在下一个世界的总线上补发（`flushJoinEvents`）；分体键盘重绑拒绝另一半已用的键；分岔临时映射只保留手柄 RB（键盘 R / I 暂不回溯）；输入、`world.alive()`、HUD 组件排序去掉每 tick 分配。
- 测试：`tools/padtest4.cjs` 全部等待游戏状态（不再固定 sleep），并新增单人换设备/按住加入检查；`tools/jointest.cjs` 改为按住加入。
