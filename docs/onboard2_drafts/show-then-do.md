# 回溯教学 2.0 · 方案稿 A：先看后做 (Show-then-Do) —— 前 10 分钟

> 角度：**最初 10 分钟**。把序章《最后一分钟》重做成一串"演示木偶 → 你来做 → 成功节拍"的小课，并设计演示木偶系统、字幕栏、失败处理、节奏、交接到第一局，以及暂停菜单里的"回溯怎么用"页。其余引导（即时教练、排练厅、死亡卡、多人）给到草图级。
> 依据：用户反馈（"玩不明白，需要多点教程，整个回溯机制不知道怎么用"；"名称/UI/风格保留，但第一次就要看懂"）、`docs/GDD2.md` §2/§3/§5.5–5.6/§9、`docs/PLAN2.md` §0.2/§1.2/§1.2b/§1.8/§3、`docs/TECH.md` F1–F3、盲测报告 `f3_clarity.md` 与其截图（`tools/out/F3/ux/`）。
> 本稿**替代 GDD2 §9.1 的 8 步表**：擦带、分岔、同步、紫色移出序章（与 §9.8 规则 2 一致），序章只教 轻按回溯 / 残响 / 悖论 三件核心事（外加约 50 秒的移动、攻击、冲刺）。
> 名字一律不改：时砂、磁带、旧影、残响、悖论、分岔、擦带……全部保留，第一次出现时配白话（TERMS）。

---

## 0. 一页摘要

| 问题（盲测/用户） | 本稿的回答 |
|---|---|
| 不知道回溯是什么、何时用 | 一句心智模型，全游戏同一说法（§1）；每课结尾点亮"模型条"上对应的一格 |
| 读说明 ≠ 会用 | 每个核心课 = **演示**（你自己的表针被录像驱动，粉笔描边，头顶按键气泡随按下动画）→ **你来做** → **成功节拍**（印章 + 音效 + 一句"为什么有用"）（§4、§5） |
| 教学文字盖住玩家/敌人/预警（S1#1）、教学房文字互相压（S1#2） | 所有教学文字只进**字幕栏**（顶部居中 / 多人时贴在各自铭牌下），世界里只画**聚光圈 + 虚线引线**，不画盒子；旧教学房的地刻全部删除（§3） |
| 轻按 0.18–0.3 s 被当成微擦带，花 25 却拿不回血（S1#3/#4） | **未教之前"按住 = 轻按"**（渐进揭示：擦带关闭），第一局第 1 间清场后用 25 秒教"按住"再打开（§2.4、§6.3） |
| 分岔误触扣 50 时砂冒出一个没解释的分身 | **未教之前分岔关闭**（按下只给一行字幕，不扣时砂），第 2 间清场后教（§2.4、§6.4） |
| 想复习 | 暂停 → **回溯怎么用**：6 个用真实精灵画的动画小循环 + 大字 + 当前设备按键（§7）；排练厅首访即开放（§8.2） |
| 老玩家嫌烦 | 首启二选一"第一次玩 / 玩过了：跳过"；演示可按住跳过；暂停可跳过本课/整段；设置里可关教练（§2.6） |
| 怎么证明有效 | 盲测代理只看自己用 `tools/shot.cjs` 截的图，说清 10 项；配套路由、`window.__tut` 钩子、参考脚本与评分表（§10、附 b） |

**时长**：序章 ≈ 4 分 40 秒（上限 6 分钟，含一次失败约 6 分）；工坊首访 ≈ 1 分钟；第一局前两间（含两节 25 秒"清场排练"）≈ 3 分钟。合计第一个 10 分钟内教完：轻按回溯、旧影、磁带、时砂、残响、悖论、按住擦带、分岔。

---

## 1. 一个心智模型（全游戏同一说法）

### 1.1 标准句 `MODEL`（strings key `onboard.model`）

| | 文案 |
|---|---|
| zh（标准句，逐字不改） | **回溯 = 撤销刚才几秒（伤也撤销），刚才的你变成残响，把刚才的动作再做一遍** |
| zh（三行排版，每行 ≤ 18 汉字） | `回溯 = 撤销刚才几秒（伤也撤销）` / `刚才的你变成残响，` / `把刚才的动作再做一遍` |
| en | **Rewind = undo the last few seconds (damage too). The you from those seconds becomes an Echo and does it all again.** |
| en（三行） | `Rewind = undo the last few seconds (damage too).` / `The you from those seconds becomes an Echo` / `and does it all again.` |

出现位置（同一字串，不得改写）：序章 L3 开场、L6 开场、成绩单底部、"回溯怎么用"页页眉、死亡卡底部、排练厅课程板页眉、楼层卡技巧轮换的第 1 条。

### 1.2 模型条 `ModelStrip`（新 widget，`src/game/onboard/modelStrip.ts`）

一条 5 格的图标 + 短词条，按课点亮，是"每课都回到同一句话"的视觉锚。

| 格 | 图标（12×12 像素，C3 青线稿） | zh | en | 由哪课点亮 |
|---|---|---|---|---|
| ① | ⟲ 逆时针箭头 | 撤销几秒 | Undo seconds | L3 尝试 A |
| ② | ✚ 心形 + 回卷箭头 | 伤也撤销 | Damage too | L3 尝试 A |
| ③ | ◌ 青色小人 | 刚才的你 = 残响 | Past you = Echo | L4 |
| ④ | ⚔ 青色刀 ×2 | 再做一遍 | Does it again | L4 |
| ⑤ | ◆ + 爆环 | 碰 ◆ = 爆炸 | Touch ◆ = boom | L5 |

- 尺寸：每格宽 = `max(28, Text.measure(label,'small').w + 6)`，高 = 12 + 2 + `Text.lineH('small')`；格间 "→"（K6，5 px）。未点亮：图标 K5、文字 K6（K6 只作为"未点亮"装饰态；点亮态文字 K8，符合 F1 对比度规则：可读的那一刻必须 ≥ K7）。
- 点亮动画：图标 0.15 s 从 K5 → C4 → C3，白色 1 px 外圈脉冲 r+0→r+6，`sfx('spotPing')`。
- API：`ModelStrip.draw(ctx, cx, y, lit: number /* bitmask */, o?: { size?: 'small'|'body'; pulse?: number })`，返回 `{w,h}`。

### 1.3 术语首见与白话（沿用 TERMS，补两个）

现有 TERMS（`src/game/strings.ts`）原样使用。本方案在 `src/game/strings/onboard.ts` 里 `defineTerm` 追加（PLAN2 §1.2b 允许各包追加）：

| id | name | plain（≤14 汉字） | 用途 |
|---|---|---|---|
| `rewind` | 回溯 Rewind | 撤销刚才几秒 · 伤也撤销 / Undo the last seconds, damage too | 字幕栏、暂停页、成绩单的"回溯"一词 |
| `scrub` | 按住回溯（擦带）Scrub | 按住选退多远 · 越近越便宜 / Hold to pick how far; shorter = cheaper | 第一局 §6.3 |

序章里每个术语**第一次**出现在哪一句、指着什么：

| 术语 | 第一次出现 | 聚光对象 |
|---|---|---|
| 旧影 | L3 演示 d0.6 "身后的淡影 = 3 秒前的你（旧影）" | 旧影轮廓 |
| 磁带 | L3 尝试 B 开头 "血条下这条是磁带：最近 3 秒" | HUD 磁带条 |
| 时砂 | L3 演示 d5.2 "代价：100 时砂（退了 3 秒）" | HUD 时砂数字 |
| 残响 | L4 演示 d3.4 "刚才的你（残响）再打一遍！" | 残响实体 |
| 悖论 | L5 演示 d4.0 "走进它 → 悖论（爆炸）" | 悖论预告虚线圈 |
| 就绪 ◆ | L5 演示 d3.7 "◆ 亮了 = 残响就绪" | ◆ 图标 |
| 分岔 | 第一局第 2 间清场 §6.4 | 脚下钟面记号 |
| 按住回溯（擦带） | 第一局第 1 间清场 §6.3 | 磁带光标 + 预览影 |

被聚光时同时调用 `Terms.seen(id)`，因此第一局的 HUD 白话牌会按 F1 规则自动减少出现次数。

---

## 2. 全局规则

### 2.1 "先看后做"循环（每节核心课）

```
intro（字幕 1.5–3 s，玩家可走动，道具不激活）
  → demo（演示木偶，≤ 8.5 s，玩家不可控；按住 {@confirm} 0.6 s 跳过）
  → wipe（"倒回开头"胶片擦除 0.4 s，重建舞台）
  → try[步骤 i]（玩家操作；字幕给出这一步要做的一件事）
       失败 → failBeat（1.8 s：一行具体原因 + 怎么做）→ wipe → try[步骤 i]（attempt++，帮助等级 = f(attempt)）
  → success（成功节拍 2.4 s，玩家保持操作）→ 下一课 / 出口门打开
```

### 2.2 成功节拍 `successBeat`（全课统一）

| 时刻 | 发生什么 |
|---|---|
| 0.00 | 顿帧 0.04 s（`world.stop`）；字幕栏切换为**成功卡**：左侧 ✓ 印章圈（G4），中间印章词（`title` 尺寸，C4，从 2× 砸到 1×，0.07 s，同 `drawStamp` 的手感），下方一句"为什么有用"（`body`，K10）；`sfx('lessonPass')`（两音上行 + 一声钟摆"嗒"） |
| 0.80 | 模型条在成功卡下方出现，点亮本课对应格（§1.2 动画） |
| 1.60 | 右上角序章时钟跳秒（如 11:59:15 → 11:59:27），`sfx('clockJump')` |
| 2.40 | 出口门开（`Door` 解锁动画）+ 字幕栏一行小字 "门开了 ↑ / The door is open ↑"（`small`，K8）；或直接进入下一步 |

印章永远在字幕栏里，**不在玩家或爆炸上方**（同时回应盲测 S2#6）。印章词用 `title` 尺寸放不下栏宽时（多人个人栏宽 200，或英文长词如 REHEARSAL COMPLETE）退回 `body` 尺寸 + C4 加粗描边。

### 2.3 失败与重试（绝不弹大段文字）

- **只从当前步骤重来**，不是整课。重来 = "倒回开头"胶片擦除（§4.7）+ 舞台重建；玩家血量/时砂/磁带回到该步骤起点。
- 失败字幕 = **发生了什么 + 下一次怎么做**，一行，≤ 18 汉字（各课逐条列出）。
- **帮助等级**（每步独立计数）：

| attempt | 帮助等级 | 效果 |
|---|---|---|
| 1 | 0 | 正常 |
| 2 | 1 | 失败字幕更具体；字幕栏页脚 `{@info} 再看一遍` 闪烁 |
| 3 | 2 | 自动询问"要不要再看一遍演示？"（`{@confirm}` 看 / 走开 = 不看）；只演示失败那一段的 2–3 s 片段（`DemoClip.segments`） |
| 4+ | 3 | 辅助：本步内世界 0.6×（时间气泡）、受击时冻结 + 大按键（§5 L3 尝试 A 的样式）、残响驻留 +1 s、预警 +0.4 s |
| 6+ | 3 | 额外出现 `{@confirm} 先跳过这一课（排练厅可补）`；跳过 = 动词开放但课程记为"未完成"，排练厅课程板显示空心 ○ |

- **闲置**：尝试阶段 8 s 无任何输入 → 重说本步字幕并让按键图标脉冲；16 s → 帮助等级 +1。
- **按错键**：按了本课未开放的动词 → 字幕 "这一课用 {@rewind} / This lesson uses {@rewind}"（每步最多一次）。

### 2.4 渐进揭示：未教的动词是**禁用**还是**不宣传**？

| 动词 / 概念 | 序章 | 第一局（教之前） | 决定 | 理由 |
|---|---|---|---|---|
| 轻按回溯 | L3 起开放 | 开放 | — | 核心 |
| 按住擦带 | **禁用**（按住 = 轻按） | **禁用**直到 §6.3 | 禁用 | 盲测 S1#3/#4：普通按键常持续 0.18–0.3 s，被判为微擦带（25 时砂、拿不回血），玩家结论是"回溯没用"。未教前让按住和轻按结果一致，消除最大误解；对老玩家无损（跳过即开）。实现 = 有效回溯模式 `Gate.rewindMode(p)` 返回 `'tap'`（复用已有的 `settings.rewindMode === 'tap'` 分支） |
| 分岔 | **禁用** | **禁用**直到 §6.4；按下 → 字幕 "分岔：下一间房清场后教你"（每房间一次），**不扣时砂、无拒绝音** | 禁用 | LB/RB 相邻，误按率高；误按 = 扣 50（池子的 1/4）+ 冒出一个没解释的青色分身（盲测：fork 后"时砂突然少 50"）。最多禁用 2 间房，代价极小 |
| 召回 | 禁用 | 由 `mods.recall` 解锁（现有规则） | 现有 | — |
| 特技 | 禁用 | 开放 + 第一局第 1 间目标行带一次 `{@special} 特技` | 禁用（序章） | 与回溯无关，序章里只会制造噪音（例如 L4 用特技打碎木人跳过残响） |
| 同步 / 元凶 / 完美回溯 / 卡秒 / 连锁 / 穿越 | 机制照常 | 机制照常；第一次发生只盖印章、**不挂白话框、不弹便条**，之后在安静时（排练厅 / 便条节流）再教 | **不宣传** | 它们没有按钮，不存在误触；禁用会改变战斗手感与数值；不宣传 = 不增加第一局信息量 |

开关数据：`Teach.has('scrub' | 'fork')`；`?onboard=skip`、首启"玩过了"、设置"跳过全部教学"、模式 ≠ `standard`（每日一秒、自定义、契约）、`?bot=1` 时一律视为已教。

### 2.5 节奏预算（序章）

| 段 | 目标 | 上限（含 1 次失败） | 时钟 |
|---|---|---|---|
| P0 首启选择 | 8 s | 15 s | — |
| L1 醒来·走 | 15 s | 25 s | 11:59:00 → :08 |
| L2 打·冲 | 35 s | 60 s | → :18 |
| L3 撤销（旧影 + 轻按） | 60 s | 95 s | → :30 |
| L4 残响 | 50 s | 80 s | → :42 |
| L5 悖论 | 50 s | 80 s | → :52 |
| L6 合起来 | 45 s | 75 s | → :59（停住） |
| 成绩单 + 尾声 | 17 s | 20 s | 11:59:59 |
| **合计** | **≈ 4 分 40 秒** | **≈ 7 分 30 秒（极端）** | |

`__tut.log` 记录每段的模拟时间与真实时间，参考脚本断言总模拟时间 ≤ 360 s（§10）。

### 2.6 跳过（老玩家）

1. **首启二选一**（P0，§5.0）："第一次：开始排练" / "玩过了：跳过教学"。1.0 存档迁移玩家默认焦点在"跳过"，并多一行"2.0 新增：旧影、按住回溯、分岔"。
2. 序章暂停菜单：`再看演示`、`跳过这一课`、`跳过序章`（后两项二次确认）。
3. 演示中按住 `{@confirm}` 0.6 s 跳过演示（按任意键先出现提示圈，防误跳）。
4. 设置 → 文字与提示：`教学指导 自动/总是/关闭`（教练）、`跳过全部教学（解锁全部操作）`、`重置教学进度`。
5. `Onboard.skipAll()`：`Teach.mark` 全部核心 + `scrub fork sync`；`profile.prologueDone = true`；教练计数设为已熟练（§8.1）；排练厅课程显示为未练习（○），不发奖励。

---

## 3. 字幕栏 Caption Rail 与世界聚光（解决 S1#1 / S1#2）

> F3 修复轮（任务 #65/#66）会先给旧教学房加一个基础字幕栏与术语框避让。本模块是它的完整版：F4 接手后旧的教学房字幕迁到 `Caption`，旧地刻删除。

### 3.1 规则

1. **所有教学文字只进字幕栏**：教练提示、课程步骤、失败原因、成功卡、伊妮丝的序章台词。
2. **世界里不画教学盒子**：需要指向世界物体时，画**聚光圈**（物体外 6 px 的 1 px C3 点线圈，2 Hz 脉冲）+ 从字幕栏到圈的**1 px 虚线引线**（C2，60%）。圈和线是细线，不遮挡；同时最多 2 个聚光。
3. 字幕栏一次只显示一条（每个栏位）；按优先级排队；同 `key` 替换。
4. 字幕栏不得盖住玩家、敌人、敌人预警、子弹、悖论预告圈（§3.4 的避让）。

### 3.2 位置与尺寸（逻辑 640×360，UI 层）

| 情况 | 锚点 | 矩形 |
|---|---|---|
| 单人，顶部（默认） | 顶部居中；若 P2 的目标行在显示，则紧贴其下方 2 px | x 中心 320，宽 = `clamp(文本宽 + 24, 120, 268)`（即最宽 x 186..454，避开左上铭牌的时砂数字 x≤180 与右上钱袋/序章时钟 x≥532）；y 顶 = 8（或目标行底 + 2）；高 = `4 + 行数 × Text.lineH('body') + 4`（+ 页脚行 `Text.lineH('small') + 2`） |
| 单人，底部（避让时） | 底部居中 | 同宽；y 底 = 352；若左下伊妮丝便条卡在显示，中心 x 改为 `max(320, 248 + 宽/2)` |
| 多人，个人栏 | 贴在该玩家铭牌下 | I：x 4..204，y 顶 = 铭牌底 + 4；II：x 436..636；III/IV：y 底 = 铭牌顶 − 4；宽 ≤ 200 |
| 多人，公共栏 | 顶部居中，共享钱袋下方 | x 220..420，y 顶 = 钱袋底 + 2 |
| 序章 / 排练厅舞台 | 顶部居中 | 舞台地面在屏幕 y ≥ 116（20×9 房）/ y ≥ 124（16×8 房），字幕栏 y 8..≤60 永远不压游戏区域 |

- 文本：`body`（FP12）K10，最多 3 行（文案每行 ≤ 18 汉字，因此在文字倍率 k ≤ 1.33 时最多折成 2 行）；页脚（如 `{@info} 再看一遍`、`按住 {@cancel} 跳过`）`small`（FP10）K8。
- 左侧说话人图标 12×12：伊妮丝头像（`buildInesPortrait(0)` 缩样）/ 系统 ⓘ（K8）/ 多人时玩家形状徽记（槽位色）。
- 样式：85% K0 底板，上边 1 px C2 细线；底边 1 px 引信条（剩余时间，S2）——与伊妮丝便条的视觉语言一致。
- 入场：下滑 6 px + 淡入 0.15 s；退场：淡出 0.2 s。
- 时长：`dur = clamp(1.2 + 0.09 × 字符数, 2.5, 6)`；`until` 条件型字幕（如"按 {@rewind} 撤销"）一直显示到条件满足。
- 所有尺寸从 `Text.measure / measureWrapped / lineH / inkH` 与 `promptW / promptH` 推出，不写死像素（F1 规则）。

### 3.3 富文本：内联按键 `{@action}`

`src/game/onboard/rich.ts`：`Rich.measure(s, size, who)` / `Rich.draw(ctx, s, x, y, o)`。

- 语法：`{@rewind}` `{@fork}` `{@attack}` `{@dash}` `{@special}` `{@confirm}` `{@cancel}` `{@info}` `{@pause}` `{@move}`。与 Text 已有的颜色标记 `{c:…}` `{g:…}` `{r:…}` `{v:…}` 共存（`{@` 前缀不冲突）。
- `{@move}`：键鼠/纯键盘画 W A S D 四个键帽（或方向键，若最近一次移动来自方向键），手柄画左摇杆 `LS`。
- 按键图标用 `drawPrompt(ctx, action, x, y, who)`，竖直居中到 `y + Text.inkMid('body') − promptH()/2`；左右各 2 px 间距。
- `who` = 该字幕所属玩家的 `PlayerInput`（单人 = 唯一玩家，因此随最后使用的设备切换：键鼠 ↔ 手柄）。
- **按下动画**：`Rich.draw(..., { pressed: Set<Action>, pulseT })`：被按下的图标下沉 1 px（逻辑），并在其外画 C3 1 px 圆角框扩张 0.25 s。演示木偶按键时，字幕里同名图标同步按下（§4.5）。
- **纯键盘列**：玩家用 J/K/L/I 那一列时，`{@rewind}` 应显示 `L` 而不是 `Q`。需要 `input.ts`（冻结）记录"最近一次按下的绑定在列表中的序号" `raw.kbColumn: 0|1`，`widgets.keyFor` 用 `table[a][kbColumn] ?? table[a][0]`（接口请求，见附 a）。

### 3.4 避让（运行时，每帧）

障碍（屏幕逻辑坐标）：所有存活玩家精灵 AABB 外扩 8 px；所有敌人 AABB；`Enemy.windup` 期间的预警形状外接矩形（`tele`）；敌方子弹；`Paradox.preview` 圈；Boss 血条区域。

| 情况 | 处理 |
|---|---|
| 任一**玩家**与字幕栏重叠 | 字幕栏换到备选锚点（单人：顶 ↔ 底；多人个人栏：铭牌下 ↔ 铭牌侧 x 偏移 140）。滞后 0.3 s 防抖 |
| 只有敌人/预警/子弹/预告圈重叠 | 字幕栏不透明度降到 0.35，**计时暂停**（不会错过） |
| 两个锚点都被玩家占 | 不透明度 0.3，计时暂停 |
| 楼层标题卡在显示 / 首领转阶段 | 字幕排队等候 |

`__tut.overlaps` 统计"字幕栏不透明度 > 0.5 且与任一障碍重叠"的帧数，验收要求 = 0（§10）。

### 3.5 聚光目标 `spot`

`Caption.say({..., spot: SpotRef | SpotRef[] })`，`SpotRef` 取值：

| 值 | 圈的位置 |
|---|---|
| `'shadow'` | 当前玩家旧影帧位置（`p.rewindPreview()` 的 x,y），圈半径 12 |
| `'shadowGain'` | 旧影头顶 `+N` 世界标签的外接框 |
| `'hpStripe'` | HUD 血条青色斜纹段（需要 `Hud.widgetRect('hp', slot)` + 段起止，接口请求） |
| `'tape'` / `'tapeNotch'` | HUD 磁带条 / 最近一道红刻痕 |
| `'sand'` | HUD 时砂数字 |
| `'armed'` | 指定残响头顶 ◆ |
| `'preview'` | 当前 `Paradox.preview(p)` 圈 |
| `Entity` | 实体 AABB 外扩 6 px |

HUD 目标画圆角矩形框而不是圆。引线从字幕栏底边最近点出发；若直线穿过玩家 AABB，经由偏移 16 px 的中点折一次。

### 3.6 API

```ts
// src/game/onboard/caption.ts
export interface CaptionOpts {
  key: string;                      // strings key in 'onboard'；同 key 替换
  text?: L10n | (() => string);     // 默认 S('onboard', key)；支持 {@action} 与 {n} 等占位
  vars?: Record<string, string | number>;
  who?: 'ines' | 'sys' | number;    // 说话人；number = 槽位
  player?: number;                  // 多人：放到该玩家的个人栏；省略 = 单人顶栏 / 多人公共栏
  prio?: 0 | 1 | 2 | 3;             // 3 = 教练/成功卡，2 = 课程步骤，1 = 提示，0 = 闲话
  dur?: number;                     // 秒（真实时间）；省略 = 按字数
  until?: () => boolean;            // 条件型：满足即退场
  spot?: SpotRef | SpotRef[];
  footer?: L10n;                    // 小字页脚
  pressed?: () => Set<Action>;      // 演示时同步按下动画
  kind?: 'line' | 'success';        // success = 成功卡（印章 + why）
  stamp?: L10n;                     // kind === 'success' 时的印章词
}
export const Caption: {
  say(o: CaptionOpts): { close(): void };
  clear(key?: string, player?: number): void;
  rect(player?: number): Rect | null;   // 避让、测试
  busy(player?: number): boolean;
  update(dt: number): void;             // main.ts 每帧（场景之后、便条之前）
  render(r: Renderer): void;            // UI 层
};
```

字幕显示期间对 `Hints.hold(1)`（单人顶栏）——便条与字幕不同时出现。

---

## 4. 演示木偶系统 DemoDirector（深度）

### 4.1 选型：让**你自己的表针**被录像驱动

| 方案 | 能演示回溯？ | 风险 | 结论 |
|---|---|---|---|
| A 纯残响回放（`Echo` + 预录 `Recording`） | **不能**：残响不会回溯、不会产生旧影/新残响 | 低 | 只能演示"残响打人"，不够 |
| B 另造一个木偶 `Player`（隐藏槽位） | 能 | 高：大量系统按 `world.players` 遍历（受伤、仇恨、镜头、HUD、门），木偶不在列表里就不会被打中，放进去又会出现第二个铭牌 | 否 |
| C 画中画小世界 | 能 | 很高：渲染管线、后期都绑在 `G.r` | 否 |
| **D 自动驾驶玩家本人的表针，演完"倒回开头"** | **能**：走的就是真实的回溯/残响/悖论/HUD 代码 | 中：需要换输入、重建舞台（§4.7） | **采用** |

D 的好处：演示里旧影、`+12`、血条青段、磁带红刻痕、时砂 `−100` 全是真实 HUD 与真实数字；玩家看到的就是"等会儿我自己做时会看到的东西"。演示结束用胶片擦除把舞台倒回开头，木偶"变成你"。

### 4.2 数据：`DemoClip` 与步骤 DSL

```ts
// src/game/onboard/demo.ts
export interface DemoClip {
  id: string;
  start: { x: number; y: number; face?: 'left' | 'right' | 'up' | 'down'; hp?: number; sand?: number };
  steps: DemoStep[];
  captions: DemoCaption[];          // 与步骤同步的字幕（见各课时间轴）
  maxDur: number;                   // 超时保护（秒，模拟时间）
  segments?: Record<string, [number, number]>;  // 帮助等级 2 时只回放的片段（按步骤序号）
}
export type DemoStep =
  | { k: 'walkTo'; x: number; y: number; speed?: number }   // 转向驱动：朝目标的单位向量，3 px 内停
  | { k: 'wait'; s: number }
  | { k: 'waitFor'; ev: DemoEvent; timeout: number; force?: () => void }  // 等事件；超时则 force 并记 desync
  | { k: 'tap'; a: Action }                    // 按下 4 tick 后松开（< 0.18 s，必为轻按）
  | { k: 'hold'; a: Action; s: number }        // 按住 s 秒后松开
  | { k: 'press'; a: Action } | { k: 'release'; a: Action }
  | { k: 'aimAt'; x: number; y: number } | { k: 'aimAtNearest' }
  | { k: 'combo'; n: number }                  // 连按攻击 n 下，间隔取武器连段窗口的 60%
  | { k: 'cue'; id: string };                  // 让舞台执行一个脚本事件（如 dropGearA）
export type DemoEvent = 'hit' | 'rewindLand' | 'echoSpawn' | 'echoArmed' | 'paradox' | 'propBroken' | 'echoEnd' | `cue:${string}`;
export interface DemoCaption { at: number | DemoEvent | `${DemoEvent}+${number}` | `press:${Action}`; key: string; spot?: SpotRef | SpotRef[]; dur?: number }
```

- **转向驱动**而不是录制原始摇杆值：移速、武器连段时间被调参后演示仍然走到位。
- 所有 `waitFor` 都有 `timeout` 与 `force`：例如"等齿轮砸中"超时 → `force` 直接对木偶 `hurt({amount:12, kind:'melee'})`；"等木人碎"超时 → 直接 `kill`。每次 force 记一条 `__tut.log {ev:'demo-desync', data:{clip, step}}` 并在开发模式 `console.warn`。CI 要求 desync = 0（§10、风险 1）。

### 4.3 输入替换

```ts
class DemoDirector extends Entity {
  constructor(run: LessonRun, p: Player, clip: DemoClip)
  added():  // ① this.real = p.input
            // ② this.bot = new PlayerInput(p.slot, `bot${8 + p.slot}`)；p.input = this.bot
            //    （PlayerInput 构造即注册视图；结束时 this.bot.dispose()）
            // ③ p.renderTint = PUPPET_TINT（§4.4）；p.rw = null；p.forkHold = -1
  update(dt): // 按模拟时间推进步骤机；每 tick 写 this.bot.bot = { move, aimX, aimY, held, pressed }
            //   跳过：this.real.down('confirm') 累计 ≥ 0.6 s → finish(true)
  finish(skipped): // p.input = this.real；this.bot.dispose()；p.renderTint = null；
            //   消耗 real 上所有动作（consume），并要求 0.2 s 无按键（"中立输入"）后才交还控制
            //   emit custom {id:'demoEnd', data:{clip, skipped}}
}
```

- 演示期间木偶不会死：`Player.hurt` 的结果若使 hp ≤ 0，`LessonRun` 把 hp 夹到 1（舞台专用，见 §4.7）。
- 演示中真实设备的按键被忽略（除跳过与暂停）。暂停菜单可打开（演示暂停）。
- 按键图标的设备族始终取 `this.real`（玩家真正在用的设备），**不是** bot。

### 4.4 木偶外观：粉笔描边（与旧影、残响都不撞色）

| 东西 | 外观 | 区分点 |
|---|---|---|
| 旧影 | 空心 C3 虚线轮廓 | 青、空心 |
| 残响 | 青色实心身体 | 青、实心 |
| **演示木偶** | 玩家本来的颜色，整体 85% 不透明、饱和度 −50%，外加 **1 px K10 白色虚线描边**（"粉笔"，3 实 2 空，沿轮廓缓慢流动 8 px/s） | 白、暖、非青 |

- 接口：`Player.renderTint?: { alpha: number; desat: number; outline: ColorKey; dashed: boolean }`（player.ts 接口请求；`render()` 里套用，outline 用 `engine/gfx/outline.ts` 的 `outlineOf`）。
- **演示画框**（UI 层）：屏幕四角各一个 10×10 的 K9 L 形角标（距边 4 px）；顶部中央、字幕栏正上方一枚小牌 `▶ 演示 0:04`（`small`，K9，85% K0 底；数字为剩余秒，5×7 数字）。**不加上下黑边**——HUD 必须完整可见（演示里 HUD 的变化本身就是教学内容）。
- 演示期间 `post` 色彩分级饱和度 −15%（全屏轻微），回到"你来"时恢复——给"这是放映"一个整体信号，但青/品红/紫依旧可辨。

### 4.5 按键气泡（头顶的按键动画）

在木偶头顶（世界坐标 `p.x, p.y − 34`，经 `r.worldUi` 画在 UI 层）显示**当前设备**的按键图标，2× 大小（UI 上下文以锚点为中心 `scale(2,2)`，整数倍保持锐利）。

| 阶段 | 时间 | 画面 |
|---|---|---|
| 预告 anticipation | 按下前 0.6 s | 图标淡入，上下浮动 1 px（2 Hz）；下方小字 `轻按 / Tap` 或 `按住 / Hold`（`small`，K9） |
| 按下 press | 按下瞬间 | 图标下沉 1 px（逻辑）、键面颜色加深一级；C3 圆环从 r10 扩到 r20（0.25 s）；`sfx('glyphPress')`（很轻的"咔"）；字幕栏里同名 `{@action}` 同步下沉 |
| 按住 hold | 按住期间 | 图标外一圈 C3 进度弧（顺时针，满圈 = 该步 `s`）；小字变成 `按住 0.8s` |
| 松开 release | 松开瞬间 | 图标回弹，第二个圆环；0.3 s 后淡出 |

多个按键（如 `walkTo` 期间）不显示气泡；移动只在字幕里用 `{@move}`。

### 4.6 重放

- 尝试阶段字幕栏页脚常驻 `{@info} 再看一遍 / {@info} Watch again`（`info` = Tab / View）。按下 → 当前步骤立即 wipe → demo → wipe → 回到该步骤（attempt 不增加）。
- 暂停菜单 `再看演示`。
- 帮助等级 2：只回放 `segments[stepIndex]` 对应片段（2–3 s）。
- 多人：`info` 按各自设备，只重放自己那条泳道（§8.4）。
- 计数：`__tut.demoPlays[lesson]`。

### 4.7 "倒回开头"胶片擦除 + 舞台重建

**刻意不用游戏里的回溯涟漪**：舞台重来不是"回溯"，若用同样的青色涟漪，玩家会误以为回溯能倒退整个世界。擦除是胶片风格：

| 时刻 | 画面 |
|---|---|
| 0.00–0.20 | 一条 K0 横幅从屏幕底向上扫（带两侧 K3 片孔），后面画面变暗；中央小牌 `⏪ 倒回开头 / Back to the start`（`small`）；`sfx('filmWipe')`（胶片卷动 + 三声快速咔嗒） |
| 0.20 | **重建**（见下） |
| 0.20–0.40 | 横幅继续上扫离开，新舞台出现 |

重建（序章 / 排练厅）：**整个 World 重新构造**（同一种子 `1159 + lessonIndex`），比逐项清理更不容易漏状态（`world.after` 计时器、总线监听、时间气泡、残响、粒子、元凶标记）：

```ts
// src/game/onboard/stage.ts —— StageHost（PrologueScene 与 RehearsalScene 共用）
rebuild(lesson: LessonDef, phase: 'demo' | 'try', step: number): void {
  this.lo.tape = null;                       // Loadout 的磁带清空（下一行 Player.added 会按入口站位预填）
  this.lo.sand = lesson.sand ?? this.lo.sandMax;
  const map = generateRoom({ rng: new RNG(seed), kind: 'tutorial', size: lesson.arena.size, exits: 1, shape: 'plain' });
  const w = new World(map, PROLOGUE_THEME, seed); w.run = this.run;
  const p = w.add(new Player(start.x, start.y, this.input)); p.autoWalk = 0;
  lesson.arena.build(w, ctx);                // 道具（§5 各课）
  Gate.apply(p, lesson.verbs);               // 本课开放的动词
  this.world = w;
}
```

（`generateRoom` 的 `shape` 固定参数需小改：接口请求，见附 a；或用固定种子使形状为 plain。）

第一局的就地课（§6.3–6.4）不能重建房间，改用**软重置**：只移除本课生成的道具与本玩家的残响（无碎裂特效），把玩家血量/时砂恢复到本步起点快照，不移动玩家。

---

## 5. 序章《最后一分钟》逐课（深度）

### 5.0 公共设定

- **场景**：`src/game/scenes/prologue.ts` 的 `PrologueScene`（PLAN2 指定 P7 新建；本方案归 F4，见附 a），内部用 `StageHost`。一局"练习"`Run`：`Flow.newRun({ mode: 'practice', seed: 1159, contracts: {}, players: [solo] })`，武器固定为默认武器（连段 12/12/22）。
- **舞台坐标**：本文所有坐标为"舞台本地坐标"：房间地面左上角 = (0,0)，单位逻辑像素。镜头固定居中：
  - 20×9 地面（320×144）：屏幕 = 本地 + (160, 116)；
  - 16×8 地面（256×128）：屏幕 = 本地 + (192, 124)。
  - 字幕栏在屏幕 y 8..≤60，地面最上沿屏幕 y ≥ 116，**物理上不可能盖住游戏区域**。
- **右上角序章时钟**（替代钱袋位置）：x 532..632，y 6..30。钟面图标 12×12 + `11:59:27`（5×7 数字 2×）；下方 `3/6`（`small`，K8）。成功节拍时跳秒。
- **HUD 渐进**：L1–L2 只显示血条与冲刺点；L3 起显示磁带与时砂（由字幕聚光引出，§1.3）。实现：`Hud.filter = (id, p) => Onboard.hudShows(id)`（hud.ts 接口请求）。
- **便条**：序章期间 `hintsHooks.busy` 包一层返回 true（不弹伊妮丝便条）。
- **F3 的世界术语框静默**：序章与清场排练期间 `rewindHud.termCallout`（旧影/就绪/悖论/元凶白话框）与 HUD 下方的磁带/时砂白话牌一律不画（`Onboard.calloutsMuted()`，rewindHud 接口请求）——教学只走字幕栏 + 聚光；元凶红钟针等**标记**照常画，只是不挂白话（元凶属于"不宣传"）。聚光时调用的 `Terms.seen` 会让第一局的白话框相应少出现。
- **引导冻结 `coachHold`**：凡写"冻结引导"处，同时做两件事：① 非玩家实体 0.05× 时间气泡；② 对被引导的手设 `p.coachHold = true`——不能移动/攻击/冲刺/分岔，**只接受回溯键**，**磁带暂停录制**（旧影、`+N`、红刻痕都停在原处，不会因为玩家被定住而滑出磁带），无敌。回溯按下或超时即解除。（玩家不受时间气泡影响、一直按真实时间录像，所以没有 ② 的话，冻结 3 秒后那下伤就撤销不了了。）player.ts 接口请求。
- **安全**：L1–L5 的伤害都很小（齿轮 12、木人 8、炮弹 6），一次尝试不可能死；若 hp ≤ 0 → 立即擦除重来（满血），不出现"停摆"。L6 允许"最后一秒"出现（教会"回溯能救命"），但不按也只是擦除重来。
- **伊妮丝**：舞台里站着她的精灵（`buildInes()`），只做手势动画；台词全部在字幕栏（说话人图标 = 她的头像）。
- **时砂**：每次重建都补满 200/200；L3 尝试 B 开头补满时字幕页脚说明一次 "排练中时砂会补满 / Sand refills during rehearsal"。

### 5.1 P0 首启选择（标题 → 开始，`!profile.prologueDone` 时）

| 项 | 内容 |
|---|---|
| 触发 | 标题"开始"且 `!prologueDone`；或 `?scene=p0` |
| 画面 | 标题场景上叠 `drawPanel('dark')` 面板 360×170，居中（x 140..500，y 95..265） |
| 文案 | 标题（`title`，B5）：**第一次玩《秒针 2》？** / **First time in Second Hand 2?** |
| | 选项 A（`MenuList`，`body`）：**第一次：开始排练（约 5 分钟）** / **First time: start the rehearsal (~5 min)** |
| | 选项 B：**玩过了：跳过教学** / **I know how to play: skip** |
| | 页脚（`small`，K8）：随时可在 暂停 → 回溯怎么用 复习 / Review any time: Pause → How rewind works |
| | 设备行（`small`，K8）：`正在使用：{device} · 换设备按任意键` / `Using: {device} · press any key or button to switch`；`{device}` = 键盘+鼠标 / 键盘 / 手柄，旁边画 `{@rewind}` 实时图标 |
| 成功 | A → `PrologueScene(L1)`；B → `Onboard.skipAll()` → 工坊（首访流程照走，§6.1） |
| 1.0 迁移档 | 标题改为 **体验新的序章？** / **Try the new prologue?**，默认焦点 B，多一行 `2.0 新增：旧影、按住回溯、分岔` |
| 路由 | `?scene=p0`、`?onboard=fresh` |
| 盲测 | 截图 `p0`：能读出"约 5 分钟""可跳过""去哪复习" |

### 5.2 L1 醒来·走（Move）—— 11:59:00

| 项 | 内容 |
|---|---|
| 场地 | 16×8。表针躺在 (48,64)（倒地帧），伊妮丝 (200,56)，目标圈 `MarkerRing` (184,64) r12（B5 点线，脉冲） |
| 开场 | 0.6 s 后表针起身（`sfx('windUp')` 上弦声） |
| 字幕 | 伊妮丝：**醒醒，小表针。走到我这儿。{@move}** / **Wake up, little hand. Walk over to me. {@move}**（`until` = 到达目标圈）；聚光目标圈 |
| 成功 | 进入目标圈 → 无印章，只有"嗒" + 时钟 → 11:59:08；0.5 s 后切到 L2（`'clock'` 转场 0.5 s） |
| 闲置 | 8 s 不动 → `{@move}` 图标脉冲并重说 |
| 演示 | 无（移动是通用动词） |
| 盲测 | 截图 `L1_wake` |

### 5.3 L2 打·冲（Attack + Dash）—— 11:59:08

场地 16×8：

```
本地 x→ 0        64       128      192      256
y 0   ┌──────────────────────[门]──────────┐
     │                    ┃   ╲              │  ┃ = 栅栏（只在钟摆刀路径处开口）
  32 │                    ┃    ╲ 钟摆刀      │  钟摆刀：枢轴 (176,8)，沿 x=176 在 y 24..104 往返，周期 1.6 s
  64 │  S     [木人]      ┃    ◎目标 (232,64) │  S = (40,64)，木人 (96,64)
  96 │                    ┃                  │
 128 └───────────────────────────────────────┘
```

| 步 | 触发 | 字幕（zh / en） | 成功 | 失败/重试 |
|---|---|---|---|---|
| 2a | 进场 0.5 s | 伊妮丝：**打木人：{@attack} 连按三下** / **Hit the dummy: {@attack} three times**（聚光木人） | 一次完整三连段落在木人上（第 3 段命中，伤害数字 12 / 12 / 22） | 只打了 1–2 下就停 3 s → 重说 |
| 2a 成功 | — | 小成功卡：印章 **好！** / **Nice!**，why **第三下最重。** / **The third hit lands hardest.** | — | — |
| 2b | 2a 成功 1.2 s 后 | **钟摆刀扫过来：按 {@dash} 冲过去** / **A pendulum blade: {@dash} through it**（聚光钟摆刀） | 冲刺状态下穿过刀的判定一次，到达目标圈 | 被刀扫中（0 伤害，只击退 140）→ **被扫到了：冲刺中才无敌，再来。** / **Clipped! You're only safe mid-dash. Again.**（不擦除，原地继续） |
| 2b 成功 | — | 成功卡：印章 **冲过去了！** / **Through!**，why **冲刺的瞬间无敌。** / **You can't be hurt mid-dash.** | 时钟 → 11:59:18，门开 | — |

- 本课开放动词：move / attack / dash。演示：无（通用动词），但 2b 失败 2 次后伊妮丝做一次"示范"（演示木偶 2.5 s 片段：等刀经过最低点前 0.2 s 冲刺）。
- 木人：`PracticeDummy({ hp: 9999, punch: false, regen: 0 })`，头顶不显示血条。
- 盲测截图：`L2_attack`、`L2_dash`、`L2_done`。

### 5.4 L3 撤销（旧影 + 轻按回溯）—— 11:59:18 · **最重要的一课**

**教会**：旧影 = 3 秒前的你；挨打后轻按回溯 → 回到旧影、伤撤销；血条青色 = 能拿回的血；花时砂（退满 3 秒 = 100）；磁带 = 最近 3 秒，红刻痕滑出前来得及。

场地 20×9：

```
本地 x→ 0     40          150 176      224 256        320
y 0   ┌───────────────────────[门]───────────────────────┐
  32 │                                          伊妮丝(288,32)│
  72 │  S ─ → ─ → ─ → ─ → ─(A)─ → ─ → ─ → ─(B)─ → ─ → ─ ▸    │  S=(40,72)；A 落点 (176,72) 触发线 x≥150；B 落点 (256,72) 触发线 x≥224
 144 └──────────────────────────────────────────────────────┘
      地面画一排淡淡的箭头（B3，20% 不透明，仅装饰；不是文字）
```

道具 `FallingGear`：触发后在落点画影子圆（K0 40%，r 从 4 长到 14，0.8 s；前 0.5 s 跟随玩家脚下、之后锁定），落下 12 伤害（`kind:'melee'`，击退 0），落地碎成两片齿轮。若玩家冲刺躲开：字幕 **躲开了！不过这一课要练挨打以后。** / **Dodged! But this lesson is about after the hit.**，1.0 s 后再落一个预警 0.2 s 的齿轮（避不开）。

**开场**（2.5 s，玩家可走动，齿轮未激活）：
- 伊妮丝：**接下来最重要：回溯。** / **Now the most important part: rewind.**（1.6 s）
- 伊妮丝：**先看一遍。** / **Watch first.**（0.9 s）→ demo

**演示 `UNDO_DEMO`**（模拟时间约 7.0 s；d2.0–d3.3 为"冻结引导"：世界 0.05×，木偶 `coachHold`，磁带暂停录制，按键气泡照常）：

```ts
const UNDO_DEMO: DemoClip = { id: 'undo', start: { x: 40, y: 72, face: 'right', hp: 50, sand: 200 }, maxDur: 9,
  steps: [ { k:'walkTo', x:176, y:72 },                      // ≈1.4 s；跨过 x=150 时舞台 cue dropGearA
           { k:'waitFor', ev:'hit', timeout:2.5, force: () => forceHit(12) },
           { k:'wait', s:1.3 },                               // 世界冻结中：聚光节拍（见下表）
           { k:'tap', a:'rewind' },
           { k:'waitFor', ev:'rewindLand', timeout:1.0 },
           { k:'wait', s:2.4 } ],
  segments: { tap: [2.0, 4.6] } };
```

| 时刻 | 字幕栏（zh / en） | 聚光 | 画面 |
|---|---|---|---|
| d0.0 | — | — | `▶ 演示` 小牌；木偶向右走，身后旧影空心轮廓跟随 |
| d0.6 | **身后的淡影 = 3 秒前的你（旧影）** / **The faint outline = you 3s ago (Shadow)** | `shadow` | 旧影与游丝 |
| d≈1.6 | — | — | 齿轮影子出现在木偶脚下 |
| d≈2.0（`hit`） | **挨打了！血条上的青色 = 能拿回的血** / **Hit! The cyan on your bar = health you can get back** | `hpStripe` + `shadowGain` | −12 红字；血条 38 红 + 12 青斜纹；旧影头顶 `+12`；磁带红刻痕；世界 0.05× |
| d≈2.9 | （同上字幕继续）按键气泡进入"预告" | — | 头顶 `{@rewind}` 2× 浮现，小字"轻按" |
| d≈3.3（`press:rewind`） | **按一下 {@rewind}（轻按）** / **Tap {@rewind} once** | — | 气泡与字幕里的图标同时下沉、圆环扩散 |
| d≈3.6（`rewindLand`） | **回到旧影，伤也撤销了。** / **Back to the Shadow — damage undone.** | — | 木偶沿游丝倒行 0.25 s 落到旧影处；青色局部涟漪；`+12`；血条回满 |
| d≈4.6 | **代价：100 时砂（退了 3 秒）** / **Cost: 100 Sand (3 seconds back)** | `sand` | HUD 时砂 200 → 100，一个沙漏图标变空；（背景里残响走过——不讲，留给 L4） |
| d≈7.0 | — | — | 演示结束 → 胶片擦除 → 字幕 **现在你来。** / **Your turn.**（1.2 s） |

**尝试**：

| 步 | 触发 / 画面 | 字幕（zh / en） | 成功 | 失败 / 重试 |
|---|---|---|---|---|
| A0 观察 | 擦除后立即；旧影在脚下 | **走两步，看旧影跟着你。{@move}** / **Walk a bit — your Shadow follows. {@move}**；聚光 `shadow` | 走动 ≥ 1.5 s（累计） | — |
| A 引导 | 玩家越过 x=150 → 齿轮 A | 被砸中瞬间：冻结引导（世界 0.05× + `coachHold`）直到回溯或 6 s；字幕（prio 3）**按 {@rewind} 撤销！** / **Tap {@rewind} to undo!**（`until` 回溯）；字幕里按键 2× 并脉冲；聚光 `shadow` + `hpStripe` | 回溯落地且 `restored > 0` | 6 s 内不按：冻结解除，重说一次；若血量滑出磁带（见 B 的判定）→ 擦除回 A。按了分岔：**这一课用 {@rewind}** |
| A 成功 | — | 成功卡：印章 **撤销！** / **UNDONE!**；why **挨打后按回溯：伤也撤销。** / **Got hit? Rewind — the damage is undone.**；第 2 行小字 **−100 时砂 · 退了 3 秒** / **−100 Sand · 3 seconds back** | 模型条点亮 ① ② | — |
| B0 磁带 | A 成功 2.4 s 后；胶片擦除并重建舞台，起点改为 (150,72)（时砂补满，页脚说明一次） | **血条下这条是磁带：最近 3 秒** / **The strip under your health is the Tape: the last 3s**；聚光 `tape` | 2.5 s 后自动下一步 | — |
| B 独立 | 玩家越过 x=224 → 齿轮 B；**不冻结** | **再来一次，这次没人提醒。** / **Once more. No reminder this time.**（在 B0 后立即说；被砸中时字幕栏不出新提示） | 被砸中后磁带上那道红刻痕滑出左端之前（≤ 磁带长度 3.0 s）完成回溯，`restored > 0` | 被砸中 1.5 s 仍未按 → 小字提示（prio 1）**红刻痕滑出磁带前，按 {@rewind}** / **Rewind before the red notch slides off the Tape**，聚光 `tapeNotch`。红刻痕滑出 → failBeat **晚了：磁带只记得 3 秒。再来。** / **Too late: the Tape only holds 3 seconds. Again.** → 擦除回 B0。连续失败 2 次 → 帮助等级 3（恢复冻结引导） |
| B 成功 | — | 成功卡：印章 **自己做到了！** / **All by yourself!**；why **3 秒内按回溯，伤就能撤销。** / **Rewind within 3 seconds and the hit is undone.** | `Teach.mark('undo','shadow','tape','sand')`；时钟 → 11:59:30；门开 | — |

- 开放动词：move / attack / dash / rewind（`rewindMode` 强制 tap）。
- 用到：`FallingGear`（新，`onboard/props.ts`）、`TimeBubbles.push({ r: Infinity, scale: 0.05, t: -1 })`（引导冻结，手动移除）、`Player.rewindPreview()`、bus `damaged` / `rewind`、`Caption`、`ModelStrip`。
- 路由：`?scene=prologue&lesson=undo[&phase=demo|try][&help=3]`。
- 盲测截图（`__tut.wait('caption')` 后截）：`L3_demo_shadow`、`L3_demo_hit`、`L3_demo_tap`、`L3_demo_back`、`L3_demo_cost`、`L3_tryA_prompt`、`L3_tryA_success`、`L3_tape`、`L3_tryB_hint`（若出现）、`L3_tryB_success`。
- 盲测应能说出："身后淡影是 3 秒前的我；挨打后轻按 Q（LB）回到它、伤撤销；花 100 时砂；磁带是最近 3 秒，红刻痕没滑出去就来得及。"

### 5.5 L4 残响（你打出的伤害保留，刚才的你再打一遍）—— 11:59:30

**教会**：回溯后被丢下的那段时间变成残响，它把你刚才的动作再做一遍；你打出的伤害不会被撤销；残响的伤害算你的，也攒时砂。

场地 20×9：S = (64,72)；木人 D = (208,72)；伊妮丝 (288,32)。

道具 `PracticeDummy`（新）：
- `hp = 武器三连段总伤 + 4`（默认武器 = 12+12+22+4 = 50；**按真实武器数值在生成时计算**，防止调参后剧情走样）。不回血。头顶 6 格血条（B5 框，R3 填充），血条右侧留 40 px 给"保留 ✓"标签。
- **反击**：受到第 2 下后立即起手（`windup` 0.5 s，红色 r34 扇形预警），出拳 8 伤害、击退 120；或玩家在 36 px 内停留 1.6 s 未攻击也会出拳。之后 2.0 s 冷却。
- 被打碎时掉一枚黄铜齿轮（装饰）。

**开场**：伊妮丝 **回溯还有另一半：刚才的你。** / **Rewind has a second half: the you from before.**（1.8 s）→ **看。** / **Watch.**（0.7 s）

**演示 `ECHO_DEMO`**（≈ 7.6 s）：

```ts
steps: [ { k:'walkTo', x:186, y:72 }, { k:'aimAt', x:208, y:72 }, { k:'combo', n:3 },
         { k:'waitFor', ev:'hit', timeout:1.5, force: () => forceHit(8) }, { k:'wait', s:0.3 },
         { k:'tap', a:'rewind' }, { k:'waitFor', ev:'rewindLand', timeout:1 },
         { k:'waitFor', ev:'propBroken', timeout:4, force: () => killDummy('echo') }, { k:'wait', s:1.4 } ]
```

| 时刻 | 字幕（zh / en） | 聚光 | 画面 |
|---|---|---|---|
| d0.0 | — | — | 木偶走向木人 |
| d≈1.0 | **打三下……还差一点。** / **Three hits… almost.** | 木人 | 12 / 12 / 22；血条剩 4 |
| d≈1.8（`hit`） | **挨打 → 撤销。** / **Hit → undo.** | — | 木人出拳 −8；气泡 `{@rewind}` 预告 |
| d≈2.4（`press:rewind`） | （同上，图标下沉） | — | 木偶回到旧影 |
| d≈2.7（`rewindLand`） | **你打出的伤害，保留。** / **The damage you dealt stays.** | 木人血条 | 血条仍剩 4，右侧弹出 **保留 ✓** / **Kept ✓**（G4，`small`，1.6 s） |
| d≈3.2（`echoSpawn`） | **刚才的你（残响）再打一遍！** / **The past you (Echo) does it again!** | 残响 | 青色残响沿刚才的路线走向木人 |
| d≈4.6 | — | — | 残响第一刀（青字带主人色描边；木人此时是元凶，伤害 +50%，但不讲）→ 木人碎 |
| d≈5.4 | **残响的伤害算你的，也攒时砂。** / **Echo damage counts — and earns Sand.** | `sand` | 时砂数字随命中上涨（青色小点飞向 HUD） |
| d≈7.6 | — | — | 擦除 → **现在你来。** |

**尝试**：

| 步 | 字幕（zh / en） | 成功 | 失败 / 重试 |
|---|---|---|---|
| 1 | **打木人，挨打后撤销。** / **Hit the dummy, undo when it hits back.**（聚光木人） | 木人被打碎且**至少 1 次命中来自残响**（`hit` 事件 `info.src` 为奇数且属于本玩家） | 见下 |
| 失败 a：自己打碎（无残响命中） | failBeat **打碎了！这次挨打后撤销，让残响补刀。** / **Broken! This time undo after the hit and let your Echo finish.** → 木人"咔嗒咔嗒"重组 1 s（不擦除） | | |
| 失败 b：挨打后 1.2 s 未回溯 | 提示（prio 2，不算失败）**挨打了 → {@rewind}，让残响补刀。** / **Hit → {@rewind}, let your Echo finish.**；第二次起冻结引导 | | |
| 失败 c：残响无物可打（回溯前没攻击） | failBeat **残响只重复你做过的：先打，再撤销。** / **An Echo only repeats what you did: hit first, then undo.** → 擦除 | | |
| 失败 d：残响打完木人仍未碎（之前只打了 1–2 下） | 提示 **还差点：再打几下，挨打再撤销。** / **Not yet: hit more, undo after the next hit.**（不擦除，继续） | | |
| 成功 | 成功卡：印章 **残响补刀！** / **ECHO FINISH!**；why **回溯后，刚才的你再打一遍：白赚伤害。** / **After a rewind, past you attacks again: free damage.** | 模型条点亮 ③ ④；`Teach.mark('echo')`；时钟 → 11:59:42 | |

- 路由：`?scene=prologue&lesson=echo`。
- 盲测截图：`L4_demo_almost`、`L4_demo_kept`、`L4_demo_echo`、`L4_demo_sand`、`L4_try`、`L4_success`（+ 任何 failBeat）。
- 盲测应能说出："回溯后会留下'刚才的我'（残响），它把刚才的攻击再做一遍；我打的伤害不会被撤销，所以等于白赚伤害。"

### 5.6 L5 悖论（◆ 亮了 → 走进残响 → 爆炸）—— 11:59:42

**教会**：残响出现 0.4 s 后头顶亮 ◆（就绪）；走进就绪的残响 = 悖论爆炸；爆炸能打碎普通攻击打不动的东西，+20 时砂。

场地 20×9：

```
本地 x→ 0    56          176  208      264        320
y 0   ┌──────────────────────[门]────────────────────┐
  16 │                                  [炮台 T]      │  T = (264,16)，台座
  64 │                         (钟罩 J)               │  J = (208,64)，警报半径 44
  96 │  S                                            │  S = (56,96)
 144 └──────────────────────────────────────────────┘
```

道具：
- `GlassJar`（新）：只吃 `kind:'paradox'` 伤害（1 次即碎）；普通攻击 → "叮"、白闪、首次字幕 **钟罩打不碎……** / **The bell jar won't break…**；玩家进入 44 px 或攻击它 → 警报铃响。罩内一枚铜钥匙（碎后掉出，作为门钥匙）。
- `AlarmTurret`（新）：警报后 0.5 s 预警（M 品红细线指向玩家），发射一枚慢速品红弹（120 px/s，6 伤害，可被冲刺无敌躲开）；之后玩家仍在钟罩 60 px 内则每 1.5 s 再发一枚。保证"在钟罩旁边挨打"。
- 本课残响驻留时间临时 `mods.echoStandT = 2.0`（正式 0.6 s；L6 会说明，见风险 5）。

**开场**：伊妮丝 **残响还能当炸弹用。** / **An Echo can be a bomb, too.**（1.4 s）→ **看。**

**演示 `PARADOX_DEMO`**（≈ 7.8 s）：

| 时刻 | 字幕（zh / en） | 聚光 | 画面 |
|---|---|---|---|
| d0.0 | — | — | 木偶走到钟罩旁 (186,72) |
| d≈1.1 | **钟罩打不碎……** / **The bell jar won't break…** | 钟罩 | 木偶砍一刀："叮" |
| d≈1.6 | — | — | 警报；炮台预警线；弹丸 −6 |
| d≈2.1（`press:rewind`） | **挨打 → 撤销。** / **Hit → undo.** | — | 回到旧影 (≈96,92) |
| d≈2.4（`echoSpawn`） | — | — | 残响沿路线走向钟罩 |
| d≈3.5（`echoArmed`，残响已停在钟罩旁） | **◆ 亮了 = 残响就绪。** / **◆ lit = Echo is armed.** | `armed` | ◆ 旋转，描边由虚变实，白环脉冲 |
| d≈4.0 | **走进它 → 悖论（爆炸）。** / **Walk into it → Paradox (explosion).** | `preview` | 木偶走近；56 px 内地面出现虚线预告圈，钟罩头顶 ▾ |
| d≈5.0（`paradox`） | — | — | 爆环 r48；钟罩碎、钥匙掉出；`+20` 飞向时砂 |
| d≈5.6 | **爆炸能炸开打不动的东西。** / **Blasts break what attacks can't.** | — | — |
| d≈7.8 | — | — | 擦除 → **现在你来。** |

**尝试**：

| 步 | 字幕 | 成功 | 失败 / 重试 |
|---|---|---|---|
| 1 | **用残响的爆炸打碎钟罩。** / **Break the jar with your Echo's blast.** | 钟罩被 `paradox` 打碎 | 见下 |
| 失败 a：残响驻留结束碎掉、玩家没碰到 | failBeat **慢了一步：◆ 亮了就走进去。** / **Too slow: walk in once the ◆ lights.** → 擦除 | | |
| 失败 b：悖论爆炸没碰到钟罩 | failBeat **在钟罩旁边按回溯，残响才停在那儿。** / **Rewind next to the jar so your Echo stops there.** → 擦除；聚光钟罩 | | |
| 失败 c：◆ 亮前就碰（残响未就绪） | 不算失败；残响在分开后就绪，字幕 **等 ◆ 亮起再碰。** / **Wait for the ◆, then touch.** | | |
| 成功 | 成功卡：印章 **悖论！** / **PARADOX!**；why **碰到就绪 ◆ 的残响 → 爆炸，+20 时砂。** / **Touch an armed ◆ Echo → explosion, +20 Sand.** | 模型条点亮 ⑤；`Teach.mark('paradox','armed')`；时钟 → 11:59:52 | |

- 路由：`?scene=prologue&lesson=paradox`。
- 盲测截图：`L5_demo_jar`、`L5_demo_armed`、`L5_demo_preview`、`L5_demo_blast`、`L5_try`、`L5_success`。
- 盲测应能说出："残响头上 ◆ 亮了就走进去碰它，会爆炸（悖论），能打碎普通攻击打不动的东西，还给时砂。"

### 5.7 L6 合起来（期末小考）—— 11:59:52

| 项 | 内容 |
|---|---|
| 场地 | 20×9，S = (64,72)；1.2 s 后在 (240,40)、(240,104) 两个刷怪圈出两只**真实**齿轮仔（`cogling`，第一层数值） |
| 开场 | 伊妮丝 **最后一关：用上学会的一切。** / **Last test: use everything you learned.**（1.8 s）；字幕栏下方展示完整模型条（全部点亮）2.5 s；伊妮丝 **实战里残响只停 0.6 秒，要快。** / **In a real fight an Echo waits only 0.6s — be quick.**（1.6 s） |
| 教练 | 即时教练（§8.1）在本课开启：第一次受击 = 冻结引导；之后受击 = 轻提示；玩家自己回溯 2 次后关闭 |
| 额外提示 | 第一次有就绪残响在敌人 48 px 内：**◆：走进去，炸它们！** / **◆: walk in and blast them!**（一次） |
| 死亡 | 显示"最后一秒"（0.2×，字幕栏 prio 3 **回溯！按 {@rewind} 救命** / **Rewind! {@rewind} saves you**）；不按 → 擦除重来（满血） |
| 成功 | 两只齿轮仔全灭。成功卡：印章 **排练完成** / **REHEARSAL COMPLETE**；why **挨打 → 撤销 → 残响补刀 → 碰它爆炸。** / **Hit → undo → Echo strikes → touch it to blast.** |
| 失败 | 无失败条件（只有死亡重来）；45 s 未清场 → 帮助等级 +1（齿轮仔移速 0.8×） |
| 路由 | `?scene=prologue&lesson=final` |
| 盲测 | `L6_start`、`L6_coach`（教练字幕）、`L6_success` |

### 5.8 成绩单 + 尾声 —— 11:59:59

**成绩单**（`ReportCard` overlay，8 s 或按 `{@confirm}`）：面板 400×200 居中（x 120..520，y 80..280），`drawPanel('paper')`。

| 行 | 内容 |
|---|---|
| 标题 | **排练成绩单** / **Rehearsal report**（`title`） |
| 1 | ✓ 印章（G4）**撤销** · 挨打后按 {@rewind}，伤也撤销 / **Undo** · Got hit? {@rewind}, damage undone |
| 2 | ✓ **残响** · 刚才的你再打一遍 / **Echo** · Past you attacks again |
| 3 | ✓ **悖论** · 碰 ◆ 残响 → 爆炸 / **Paradox** · Touch a ◆ Echo → boom |
| 底部 | `MODEL` 三行（`small`，K8） |
| 页脚 | 暂停 → 回溯怎么用：随时复习 / Pause → How rewind works: review any time |

行内若某课被跳过 → ○（空心）+ "排练厅可补 / Practise it in the Rehearsal Hall"。

**尾声**：大钟敲一下，时钟停在 11:59:59（数字变成 B5 并轻抖）；伊妮丝 **……钟停了。离午夜只差一秒。** / **…The clock stopped. One second to midnight.**（2.4 s）→ **跟我回工坊。** / **Come back to the workshop.**（1.4 s）→ `profile.prologueDone = true`，`Flow.hub('start')` 带 `first = true`。

---

## 6. 交接：工坊首访 + 第一局前两间（深度）

### 6.1 工坊首访（≈ 60 s；P6/P7 的场景，这里只规定教学字幕）

顶部目标行（P2/P7 的 objective 组件；首访用 `body` 而非 `small`）依次：

| 顺序 | 目标行 | 伊妮丝 / 字幕 | 聚光 |
|---|---|---|---|
| 1 | **去找伊妮丝** / **Talk to Ines** | — | 伊妮丝 |
| 2 | — | 对话 2 句：**回溯、残响、悖论——你都会了。** / **Rewind, Echo, Paradox — you've got them.** · **这 15 片时之碎片，拿去给主发条上弦。** / **Here are 15 Time Shards — wind the Mainspring with them.** | — |
| 3 | **用碎片给主发条上弦** / **Wind the Mainspring with your shards** | — | 发条台 |
| 4 | **排练厅开了：随时回来练** / **The Rehearsal Hall is open: practise any time** | — | 排练厅门（发光，3 s） |
| 5 | **走进大门：开始第一局** / **Walk through the big door to start a run** | — | 大门 |

### 6.2 第一局第 1 间（战斗）

- P2 请求：`profile.runs === 1` 的第一间用"首间"模板：2 齿轮仔 + 1 哨兵、无地形机关、房型 plain。
- 目标行：**清空敌人 → 选择下一扇门** / **Clear the enemies → pick a door**；首次另加一行 `{@special} 特技` 小字 4 s。
- 即时教练：本局第一次符合条件的受击 = **冻结引导**（§8.1），之后轻提示。
- 按分岔（未教）：字幕 **分岔：下一间房清场后教你。** / **Fork: you'll learn it after the next room.**（每房间一次，不扣时砂）。
- 清场 → 1.0 s 后进入 §6.3。

### 6.3 清场排练 ①：按住回溯（擦带）—— 25 s

| 项 | 内容 |
|---|---|
| 触发 | `GameHooks.onRoomClear`，`!Teach.has('scrub')`，房间类型 combat，非首领；清场奖励球已生成。门 `Door.hold` 至本课结束/跳过，门上小锁图标 + "排练中 / Rehearsing"（`small`） |
| 时砂 | 本课开始时补到满；本课内花的时砂在结束时退还 |
| 开场 | 伊妮丝 **趁安静，再学一招：按住回溯。** / **While it's quiet, one more trick: hold rewind.**；页脚 **按住 {@cancel} 跳过** / **Hold {@cancel} to skip** |
| 道具 | 两枚 `FallingGear`，间隔 1.0 s 砸在玩家当前位置附近（第 1 枚在玩家脚下，第 2 枚在玩家移动方向前方 24 px），各 8 伤害 |
| 演示 | 就地演示（玩家自己的表针，§4）：走 1.6 s，连挨两下 → 按住 `{@rewind}` 1.0 s（气泡显示按住进度弧）→ 预览影沿路径倒退，磁带光标左移 → 越过两道红刻痕后松开 → 落地 `+16` |
| 演示字幕 | d1.8 **连挨两下：磁带上两道红刻痕。** / **Two hits: two red notches on the Tape.**（聚光 `tape`）· d2.2 **按住 {@rewind}：预览影往回走。** / **Hold {@rewind}: a preview walks back.** · d2.8 **越过红刻痕 = 撤销那一下。** / **Pass a red notch = undo that hit.**（聚光 `tapeNotch`）· d3.4 **松开 → 落在预览影那儿。** / **Release → land on the preview.** · d4.0 **只退 1.8 秒：花 60，不是 100。** / **Only 1.8s back: 60 Sand, not 100.**（聚光 `sand`） |
| 尝试 | **轮到你：按住，看准了再松开。** / **Your turn: hold, release when it looks right.** |
| 成功条件 | 一次擦带（按住 ≥ 0.18 s）落地，`restored ≥ 8` 且 `seconds < 3.0`（没有退满） |
| 失败 | 轻按了（< 0.18 s）→ **那是轻按（退满 3 秒）。这次按住。** / **That was a tap (full 3s). Hold this time.**；退满 3 s → **退太远了：越过红刻痕就可以松开。** / **Too far: let go once you pass the red notches.**；不按 → 3 s 后重说并聚光 `{@rewind}` |
| 附送 | 尝试中第一次按住时字幕页脚：**按住时按 {@dash} = 取消，不花时砂** / **While holding, {@dash} cancels — no Sand spent** |
| 成功节拍 | 印章 **按住选落点！** / **SCRUB!**；why **按住看预览，只退一点更省时砂。** / **Hold to preview — a short rewind costs less.**；`Teach.mark('scrub')` → 回溯模式恢复为设置值 |
| 跳过 | 按住 `{@cancel}` 0.6 s：`Teach.mark('scrub')`（动词照样开放）+ 排练厅记为未练习 |
| 路由 | `?inrun=scrub&seed=2&floor=0`（直接进入一个已清场的第 1 间并开始本课） |
| 盲测 | `R1_scrub_notches`、`R1_scrub_hold`、`R1_scrub_cost`、`R1_scrub_success` |

### 6.4 清场排练 ②：分岔 —— 25 s

| 项 | 内容 |
|---|---|
| 触发 | 第 2 间清场，`!Teach.has('fork')` |
| 道具 | `GlassJar` 在房间中心附近的空地（离玩家 ≥ 64 px）；罩内 10 黄铜（真实奖励，碎后掉出） |
| 开场 | 伊妮丝 **不挨打也能有残响：分岔。** / **An Echo without taking a hit: Fork.** |
| 演示 | 玩家表针走过钟罩旁，在钟罩边按 `{@fork}` → 脚下出现钟面记号、时砂 −50 → 残响从 2 秒前的位置出发沿路线走向记号 → 表针向外走开 30 px → ◆ → 走回去碰它 → 悖论，钟罩碎 |
| 演示字幕 | **在钟罩旁按 {@fork}：脚下留个记号。** / **{@fork} beside the jar: it marks your spot.** · **2 秒前的你从这儿出发，走到记号。** / **You-from-2s-ago starts here and walks to the mark.**（聚光残响）· **−50 时砂** / **−50 Sand**（聚光 `sand`）· **◆ 亮了 → 走回去碰它。** / **◆ lit → walk back into it.**（聚光 `armed`） |
| 尝试 | **轮到你：分岔，再碰它。** / **Your turn: Fork, then touch it.** |
| 成功条件 | 钟罩被 `paradox` 打碎，且该悖论的 `echo.kind === 'fork'` |
| 失败 | 残响驻留结束碎掉 → **慢了：◆ 亮了就走回去。** / **Too slow: walk back once the ◆ lights.**；爆炸没碰到钟罩 → **在钟罩旁边按 {@fork}。** / **Press {@fork} next to the jar.**；用回溯做出的残响打碎了钟罩 → 也算成功，但字幕补一句 **也行！不过分岔不用挨打。** / **That works too! But Fork needs no hit.** 并仍 `Teach.mark('fork')` |
| 成功节拍 | 印章 **分岔！** / **FORK!**；why **分岔 = 不挨打、不移动的残响 · 50 时砂。** / **Fork = an Echo with no hit and no move · 50 Sand.** |
| 路由 | `?inrun=fork&seed=2&floor=0` |
| 盲测 | `R2_fork_press`、`R2_fork_walk`、`R2_fork_armed`、`R2_fork_success` |

### 6.5 第一层其余部分（交给其他方案/便条，这里只列顺序）

第 3 间起：`sync` 便条（第一次同步时，带 2 s 小循环图示）→ 第一次元凶出现时 `culprit` 便条 → 第一次卡秒时 `tick_dodge` 便条（印章在先，便条在下一个安静时刻）。每房间最多一张便条（GDD2 §9.8）。`scrub` 与 `fork_ready` 两张便条因已被清场排练覆盖而不再触发（`Teach.has` 检查）。

---

## 7. 暂停页"回溯怎么用 / How rewind works"（深度）

### 7.1 入口与面板

- `Panels.register('rewindGuide', (args) => new RewindGuidePanel(args))`；`args = { who?: PlayerInput; focus?: number }`。
- 入口：暂停菜单第 2 项"回溯怎么用"（pause.ts，P4，接口请求）；工坊暂停同；P0 页脚提示；死亡卡按钮（§8.3）；伊妮丝便条 `[Tab]` 跳转（`glossary: 'rewind'`）；钟典"回溯"条目顶部按钮；排练厅课程板。
- 面板属性：`blocks = true`，`hidesNotes = true`；动画走真实时间（暂停中也播放）。

### 7.2 版式（逻辑 640×360）

**网格视图**（默认）：

| 区域 | 内容 |
|---|---|
| 背景 | 全屏 92% K0；`drawPanel('dark', 8, 6, 624, 348)` |
| 页眉 | 标题 **回溯怎么用** / **How rewind works**（`title`，B5，居中，y 12）；其下 `MODEL`（`body`，K9，`maxW` 560，居中，最多 2 行） |
| 模型条 | 页眉下 4 px，居中，全部点亮 |
| 卡片网格 | 3 列 × 2 行。卡宽 196，列距 8，x0 = 18；卡高 = `6 + 72 + 4 + max_i(Rich.measureWrapped(caption_i,'body',184).h) + 6`，所有卡同高；行距 8；若两行卡 + 页眉超出 y 340，则网格视图省略页眉里的 `MODEL` 第 2–3 行 |
| 卡内 | 舞台 184×72（K1 底，画 3 行地砖），舞台下一行 caption（`body`，含 `{@action}`）；右上角若对应动词未教，画小牌 **新** / **NEW**（`small`，C3）——这是参考页，未教的也展示 |
| 选中 | 2 px B5 边框；悬停/方向键移动 |
| 页脚 | `{@confirm} 放大 · {@cancel} 返回`（`small`，K8，居中，y 底 352） |

**放大视图**（`{@confirm}` 或点击）：

| 区域 | 内容 |
|---|---|
| 标题 | 循环名（`title`，C3），y 10 |
| 舞台 | 2× 绘制（368×144），x 136..504，y 36..180 |
| 文案 | caption（`body`，K10，`maxW` 400，居中）；sub（`small`，K8）；按键说明行：该循环用到的按键各一个 `{@action}` + 词（`轻按` / `按住` / `分岔`） |
| 翻页 | 左右两侧 ◀ ▶；`{@tabL}` `{@tabR}` 或左右方向键；底部 6 个小点表示第几个 |
| 页脚 | `{@tabL}{@tabR} 翻页 · {@cancel} 返回` |

所有按键图标用打开者 `who` 的设备族。

### 7.3 `LoopPlayer`（关键帧小舞台）

```ts
// src/game/onboard/guide.ts
interface LoopDef { id: string; period: number; caption: L10n; sub: L10n; keys: { a: Action; word: L10n }[];
  actors: { id: string; kind: 'tick' | 'echo' | 'shadow' | 'preview' | 'cog' | 'dummy' | 'jar' | 'gear' | 'marker';
            track: { t: number; x: number; y: number; face?: 'l' | 'r'; alpha?: number; pose?: string }[] }[];
  events: { t: number; fx: 'num' | 'ring' | 'blast' | 'stamp' | 'glyph' | 'hp' | 'sand' | 'tape' | 'notch' | 'diamond' | 'previewCircle' | 'kept' | 'break' | 'unspool'; [k: string]: any }[] }
```

- 位置线性插值；`tick` / `echo` 的帧按速度选 idle / run 与朝向。
- **用真实精灵与真实画法**：表针帧 `tickFramesFor(0, HANDS.tick)`；残响 = 同一帧经残响着色（请求 P4 从 `echo.ts` 导出纯函数 `drawEchoFrame(ctx, spr, x, y, alpha, slotColor)`）；旧影 = `outlineOf(spr)` C3 虚线（请求 P1 从 `rewindHud.ts` 导出 `drawShadowOutline`）；齿轮仔 = `buildCogling()`；数字用伤害数字样式；印章用 `drawStamp`。保证页面与游戏长得一样（风险 5）。
- UI 层绘制：`imageSmoothingEnabled = false`，坐标 `r.snap`；放大视图 `ctx.scale(2,2)`。
- 舞台坐标：184×72，脚底线 y = 56；下文 t 单位秒；末尾 0.4 s 淡出、开头 0.2 s 淡入。
- 舞台内只允许数字与 ◆ 等符号用 `tiny`；舞台内中文（如 **保留 ✓**）用 `small`（FP10）。

### 7.4 六个循环（逐帧）

**循环 1 · 撤销 Undo**（周期 4.4 s）
- 舞台左上角迷你 HUD：血条 40×4 @ (6,6)，时砂数字 `200` @ (50,4)（`tiny`）。
- 0.00：表针 (36,56) 朝右待机；齿轮仔 (150,56) 以 20 px/s 向左滚；旧影未出现。
- 0.00–1.20：表针跑到 (108,56)（60 px/s）。0.40 旧影淡入（0.2 s），旧影位置 = 表针 1.0 s 前的位置（循环里把"3 秒"压缩到 1 秒，文字仍写"3 秒前"）；1 px C3 40% 游丝沿路径连接旧影与表针。
- 1.20：齿轮仔撞上：表针白闪 2 帧、后退 4 px；红字 `−12` 上浮 0.6 s；迷你血条 = 38 红 + 12 青斜纹；旧影头顶 `+12`（C3）。
- 1.30–1.80：舞台动画降到 0.25×；1.30 表针头顶按键气泡 `{@rewind}` 淡入；1.70 按下（下沉 + 圆环 r6→r12）；1.78 松开。
- 1.80–2.05：表针沿游丝倒行回到旧影 (48,56)，身边 r20 青色涟漪（30%），路径上 3 个 30% 残影。
- 2.05：落地：缩小的钟面环（r12→r6，0.5 s）；`+12` 青字；血条青斜纹 0.15 s 转为红色填满；时砂 `200→100`，旁边 `−100`（C3）。
- 2.05–3.60：一个 60% 透明的残响从 (48,56) 沿同一路径走到 (108,56)（不强调）。
- 3.60–4.40：停留；4.0 起淡出。
- caption：**挨打后按 {@rewind}：回到旧影，伤也撤销** / **Got hit? {@rewind}: back to your Shadow, damage undone**
- sub：**旧影 = 3 秒前的你 · 轻按退满 3 秒（100 时砂）** / **Shadow = you 3s ago · a tap goes the full 3s (100 Sand)**

**循环 2 · 残响 Echo**（周期 4.8 s）
- 0.00：表针 (40,56)；木人 (128,56)，头顶 6 格血条（50）。
- 0.00–0.70：表针跑到 (110,56)。
- 0.75 / 1.05 / 1.40：三刀（武器弧精灵）→ 白字 12、12、22；血条 50→38→26→4。
- 1.60：木人起手（红扇形预警 0.4 s）→ 2.00 出拳：表针 `−8`。
- 2.10：`{@rewind}` 按下；2.15–2.40 倒行回 (40,56)；`+8`。
- 2.45：木人血条仍是 4，右侧 **保留 ✓**（G4，`small`）1.2 s。
- 2.45：残响（青）出现在 (40,56)；2.45–3.15 跑到 (110,56)。
- 3.20：残响第一刀 → 青字 `7`（带主人色描边）→ 木人碎裂（B3/K6 碎片）。
- 3.50 / 3.85：残响继续挥空第 2、3 刀；4.20 残响碎成青色玻璃（剧本结束）。
- 4.40–4.80：淡出。
- caption：**刚才的你变成残响，把动作再做一遍** / **The past you becomes an Echo and does it all again**
- sub：**你打出的伤害保留 · 残响也帮你攒时砂** / **Damage you dealt stays · Echo hits earn Sand too**

**循环 3 · 悖论 Paradox**（周期 3.6 s）
- 0.00：残响站在 (96,56)，头顶 ◆ 旋转 (96,34)，描边实线，脚下光环脉冲；齿轮仔 A (82,48)、B (112,62)；表针 (24,56)。
- 0.00–0.90：表针向右走（80 px/s）。
- 0.45：距离 < 56 → 两者中点处 r48 C2 虚线预告圈；A、B 头顶 ▾。
- 0.90：接触：白闪 1 帧；爆环 r6→r48（0.25 s，C4→C2）；舞台顶部小印章 **悖论！**；A、B 各吃 `50`（青描边）并碎裂；残响化为玻璃碎片；`+20` 飞向迷你时砂。
- 0.90–1.40：表针身上 0.5 s 钟面无敌环。
- 1.40–3.20：烟尘落定；3.2–3.6 淡出。
- caption：**◆ 亮了，走进残响 → 爆炸（悖论）** / **◆ lit? Walk into your Echo → explosion (Paradox)**
- sub：**冲刺穿过 = 直线爆炸 · 每次 +20 时砂** / **Dash through = line blast · +20 Sand each**

**循环 4 · 按住：选多远 Scrub**（周期 5.2 s）
- 舞台底部迷你磁带 60×5 @ (62,66)（青色格 + 光标）。
- 0.00：表针 (24,56)；磁带随走动填满。
- 0.00–1.60：表针跑到 (144,56)（75 px/s）。
- 0.70：齿轮砸在 (76,56)：`−8`；磁带对应位置红刻痕 ①。
- 1.30：第二个齿轮砸在 (121,56)：`−8`；红刻痕 ②。
- 1.70：`{@rewind}` 按下并按住（气泡显示进度弧 + 小字 **按住**）。
- 1.70–2.90：明亮的预览影从表针处沿路径往回滑，磁带光标同步左移；预览影头顶数字：x≈130 时 `+0 −25`（`+0` 灰），2.10 越过刻痕 ② → `+8 −38`，2.60 越过刻痕 ① → `+16 −63`，2.90 到 (64,56) → `+16 −68`。
- 2.90：松开（气泡回弹）；表针 0.25 s 倒行到 (64,56)。
- 3.15：落地 `+16`；时砂 `200→132`（`−68`）。
- 3.15–4.80：残响从 (64,56) 走到 (144,56)（淡）；4.8–5.2 淡出。
- caption：**按住 {@rewind}：选退多远，松开就落地** / **Hold {@rewind}: choose how far, release to land**
- sub：**退得近更便宜 · 越过红刻痕才撤销那下 · {@dash} 取消** / **Shorter is cheaper · pass a red notch to undo it · {@dash} cancels**

**循环 5 · 分岔 Fork**（周期 5.0 s）
- 0.00：表针 (30,60) 朝右；钟罩 (120,52)。
- 0.00–1.20：表针走 L 形：右到 (90,60)，再右上到 (112,50)（钟罩旁）。
- 1.20：`{@fork}` 按下；表针脚下出现 8 px 钟面记号；迷你时砂 `200→150`（`−50`）；残响在路径起点 (30,60) 出现，沿路径有一串青色"解卷"小环。
- 1.20–1.60：表针向左下走开到 (88,66)。
- 1.20–2.40：残响沿路径 (30,60)→(90,60)→(112,50) 走到记号；2.40 停住；2.80 ◆ 亮。
- 2.90–3.30：表针走回残响；3.10 r48 虚线预告圈（罩住钟罩）。
- 3.30：悖论爆环；钟罩碎裂（玻璃碎片 + 一枚硬币弹出）。
- 3.30–4.60：落定；4.6–5.0 淡出。
- caption：**按 {@fork}：原地留下残响，不用挨打** / **{@fork}: leave an Echo here — no hit needed**
- sub：**50 时砂 · 2 秒前的你走到记号处等你** / **50 Sand · you-from-2s-ago walks to the mark and waits**

**循环 6 · 时砂与磁带 Sand & Tape**（周期 4.6 s）
- 舞台上半部画一个 1.5× 的 HUD 铭牌：血条 80×6 @ (8,8)、磁带 90×5 @ (8,20)、`⌛⌛ 200/200` @ (104,18)；下半部 (40,60) 一个小表针、(120,60) 一个齿轮仔（1×）。
- 0.00–0.60：磁带从左到右填满（录制）；磁带上方 **磁带** 小字（`small`，K8）。
- 0.80：齿轮仔撞表针：血条青斜纹 10；磁带右端红刻痕，随后匀速向左滑（压缩为 1.5 s 滑完）。
- 1.30：`{@rewind}` 轻按：时砂数字 0.3 s 滚动 `200→100`，`−100`；一个 ⌛ 变空；血条回满；磁带右侧被切下的一段化成小青人飞向表针。
- 1.90–3.40：表针打齿轮仔三下（`12 12 22`）、残响打两下（`7 7`）；每次命中青色小点飞进时砂数字：`100→146→156`。
- 3.40–4.20：停留；4.2–4.6 淡出。
- caption：**回溯花时砂，打中敌人就攒回来** / **Rewinding spends Sand; hitting enemies earns it back**
- sub：**磁带 = 最近 3 秒 · 红刻痕滑出前按回溯** / **Tape = your last 3s · rewind before a red notch slides off**

### 7.5 调试与测试

- `?scene=rewindGuide[&focus=1..6][&lang=en][&glyph=pad]`。
- `__tut.guide = { open: boolean; view: 'grid' | 'focus'; loop: number; seek(loop, t): void /* 仅 CI */ }`，便于截出确定帧。
- 盲测截图：`guide_grid`；每个循环放大后 `t = 0.6 / 1.8 / 3.2` 三张（共 18 张）。

---

## 8. 其余引导（草图级）

### 8.1 即时教练 Coach（`src/game/onboard/coach.ts`）

| 项 | 规则 |
|---|---|
| 开关 | `settings.coach: 'auto' \| 'always' \| 'off'`（默认 auto）；`skipAll` 后等同熟练 |
| 触发 | bus `damaged`：`undoable && dealt ≥ 3`，该手存活、`canRewind().ok`、`rewindPreview().hpGain ≥ max(5, 0.1 × maxHp)`；不在时间锚内、不在首领转阶段；每手冷却 10 s，每房间最多 3 次 |
| 模式 guided（每局第一次 + 熟练前） | 时间气泡 0.25× 持续 0.7 s 真实时间（单人：全局；多人：只在该手周围 r72）；字幕 prio 3 **刚挨打？按 {@rewind} 撤销** / **Just got hit? {@rewind} to undo**；旧影头顶 `+N` 旁加一个小按键图标（rewindHud 读 `Coach.shadowGlyph(p)`，接口请求） |
| 模式 light | 不减速；字幕 1.6 s **{@rewind} 撤销 +{n}** / **{@rewind} undo +{n}** |
| 自适应 | `profile.onboard.coach.self`：受到可撤销伤害后 3 s 内、且过去 2 s 内没有教练提示时，玩家自己回溯 → +1。`self < 3` → guided（每局首次）/ light；`self ≥ 3` → 只剩旧影旁的小图标；`self ≥ 6` → 关闭。提示后 3 s 内未回溯 → `ignored +1`；连续 3 次 → 本房间关闭、下个房间只用 light |
| 定格伤害 | 第一次受到紫色伤害：**紫色伤害：回溯也拿不回。** / **Violet damage: rewind can't undo it.**（并让 P7 的 `fixed_hit`★ 便条在下一个安静时刻出现） |
| 时砂不足 | 本局第一次因时砂被拒：**时砂不够：打中敌人攒回来。** / **Not enough Sand: hit enemies to earn it.** |
| 最后一秒 | 前 3 局：字幕栏 prio 3 **回溯！按 {@rewind} 救命** / **Rewind! {@rewind} saves you**（与现有中央大字并存时，中央大字让位） |
| 路由 | `?coach=1\|0\|guided\|light`（例：`?seed=2&floor=0&spawn=cogling&coach=guided`） |

### 8.2 排练厅 Rehearsal Hall（`src/game/rooms/rehearsal.ts`）

- 首次进工坊即开放（门发光）。场景复用 `StageHost`。
- 课程板（`Panels.register('rehearsal')`）：三栏 **基础**（撤销 ✓、残响 ✓、悖论 ✓——来自序章）/ **进阶**（按住回溯、分岔、一起打（同步）、元凶、卡秒、完美回溯）/ **高手**（GDD2 §9.5 的 8 项训练）。每行：图标 · 名称 + 白话 · 状态（✓ / ○ / 🔒）· 奖励。
- 每课 = 演示（`DemoDirector`）→ 无限时砂练习 → 奖励（基础/进阶 5 碎片一次性；高手 10 碎片 + 外观）。所有课复用 §5/§6 的 `LessonDef`。
- 页眉 `MODEL`；右侧"回溯怎么用"按钮。
- 多人：4 个讲台，每人各选各的课；道具按泳道各一份（§8.4）。

### 8.3 死亡卡（`summary.ts` 第一页，P6）

从 `Player.lastDeath`（player.ts 记录死前 3 s 内：最佳 `hpGain`、当时时砂、`canRewind` 原因、致死伤害是否定格）推断，按顺序取第一条成立的：

| 条件 | 文案（zh / en） |
|---|---|
| 死前 s 秒内有可拿回 n ≥ 5 且时砂够 | **你死前 {s} 秒有 +{n} 可以拿回：按 {@rewind}** / **{s}s before you fell, {@rewind} would have given back +{n}** |
| 时砂不够 | **时砂只剩 {n}（回溯至少 25）：多打中敌人攒时砂。** / **Only {n} Sand (a rewind needs 25): hit more to earn it.** |
| 在时间锚里 | **你在时间锚里：先打掉锚铃。** / **You were inside a time anchor: break its bell first.** |
| 致死为定格伤害 | **那是紫色定格伤害：回溯拿不回，躲开它。** / **That was violet fixed damage: rewind can't undo it — dodge it.** |
| 其他 | **挨打后 3 秒内按 {@rewind}，伤就能撤销。** / **Rewind within 3s of a hit and it's undone.** |

下方按钮 **看看：回溯怎么用** / **See: How rewind works** → `Panels.open('rewindGuide', { focus: 1 })`。路由：`?scene=summary&kind=death&deathhint=gain|sand|anchor|fixed`。

### 8.4 多人

- 字幕：个人栏贴各自铭牌（§3.2）；教练、课程步骤、失败、成功卡都进个人栏；公共事项进公共栏。
- 序章（全员未完成时，标题"同行"进入后提示"一起排练？（约 5 分钟）/ 跳过"）：舞台按人数分泳道（2 人：20×9 的上下两条，y 40 与 y 104；3–4 人：20×12，四条 48 px 泳道），每人一份道具；演示同时在每只手上播放；各自尝试、各自重来（软重置只作用于本泳道）。**门在全员成功时开，或在第一人成功 25 s 后开**——没完成的人在第一局清场排练里补这一课（"谁也不卡谁"）。
- 排练厅：各自讲台、各自泳道、各自 `{@info}` 重放。
- 教练：每手独立计数（槽位 I 写入存档，其余座位本次会话有效）；减速只用 r72 气泡，不影响队友。

### 8.5 HUD 渐进（第一局）

第一局 HUD 只有：血条（含青斜纹）、磁带、时砂数字、冲刺点（GDD2 §9.8 规则 2）。分岔提示芯片在 `Teach.has('fork')` 后出现。由 `Hud.filter` 统一判断。

---

## 9. 设备与文字规则核对

| 要求 | 本方案做法 |
|---|---|
| 键鼠 | `{@rewind}` = Q 键帽、`{@fork}` = R、`{@attack}` = 左键图标 |
| 纯键盘 | 需要 `raw.kbColumn`（附 a 接口请求）：用 J/K/L/I 一列的玩家看到 L / I / J；未实现前退化为显示 Q（**阻断项**：验收前必须实现） |
| Xbox 手柄 | LB / RB / X / A；`settings.padSwap` 交换肩键时图标跟随（`widgets.padFor` 已支持） |
| 跟随最后使用设备 | 单人合并输入：`PlayerInput.lastDevice`（`raw.family`）；字幕每帧按 `who` 重画 |
| 分体键盘 | `who.bindings` 自动给出 kbL / kbR 键位 |
| 文字层 | 字幕栏、成功卡、成绩单、暂停页、按键气泡、聚光圈全部在 UI 层（`r.ui2` / `r.worldUi`），不经后期 |
| 字号 | 正文 `body`（FP12）；页脚/标签 `small`（FP10）；中文绝不用 `tiny`；`tiny` 只用于数字（磁带秒数、`+12`、`−100`） |
| 尺寸 | 所有框从 `Text.measure / measureWrapped / lineH / inkH`、`promptW / promptH` 推出；文字 125% 时字幕栏自动加高、最多 3 行 |
| 对比度 | 正文 K10/K9、次要 K8/K7；K6 只用于"未点亮"装饰态 |
| 语言 | 全部文案 `{zh, en}`，在 `src/game/strings/onboard.ts` 注册；中文优先排版（每行 ≤ 18 汉字） |
| 确定性 | 课程逻辑只用 `world.after` / `world.rng`，不用 `setTimeout` / `Math.random` |

---

## 10. 调试路由与 eval 钩子

### 10.1 路由（`registerDebugRoute`，在 `src/game/onboard/index.ts` 注册）

| 路由 | 作用 |
|---|---|
| `?scene=p0` | 首启选择页 |
| `?scene=prologue[&lesson=move\|strike\|undo\|echo\|paradox\|final\|report\|outro][&phase=demo\|try][&help=0..3]` | 序章，或从某课/某阶段开始 |
| `?lesson=<id>[&players=2]` | 在排练厅舞台单独跑任一课（含进阶课） |
| `?inrun=scrub\|fork[&seed=2&floor=0]` | 进入一个已清场的第 1/2 间并立刻开始清场排练 |
| `?coach=1\|0\|guided\|light` | 强制教练模式 |
| `?glyph=kbm\|kb\|pad` | 强制按键图标族（无手柄环境下截手柄图标） |
| `?scene=rewindGuide[&focus=1..6]` | 暂停页单独打开 |
| `?onboard=fresh\|prologueDone\|skip\|taught:undo,echo,…` | 启动前在内存里套用档案预设（`fresh` = 清空 `taught/hints/onboard/prologueDone`） |
| `?scene=hub&first=1` | 工坊首访流程 |
| `?scene=rehearsal` | 排练厅 |
| `?scene=summary&kind=death&deathhint=…` | 死亡卡 |
| `?tutlog=1` | 每个事件在控制台打印 `__tut.log` |

`?bot=1` 时自动 `onboard=skip`（QA 回归不受影响）。

### 10.2 `window.__tut`（开发构建与 `?qa=1` 时挂载）

```ts
interface TutDebug {
  // —— 状态（盲测可读：只用于同步，不含教学内容）——
  where: 'title' | 'p0' | 'prologue' | 'hub' | 'run' | 'hall' | 'guide';
  lesson: string | null; phase: 'intro' | 'demo' | 'wipe' | 'try' | 'fail' | 'success' | 'report' | 'outro' | null; step: number;
  // —— 输入与等待（盲测可用）——
  wait(ev: 'caption' | 'idle' | 'phase:try' | 'phase:demo' | 'success' | 'hit' | 'rewind' | 'paradox' | 'fork' | 'demoEnd'
           | `lesson:${string}` | `where:${string}` | 'room:clear', timeoutSec?: number): Promise<'ok' | 'timeout'>;   // 按模拟时间
  freeze(): void; thaw(): void;                       // world.stop，截图稳定
  hold(code: string, simSec: number): Promise<void>;  // 派发 keydown/keyup
  tap(code: string): Promise<void>;
  walkToward(target: 'objective', simSec?: number): Promise<void>;   // 朝屏幕上当前目标标记走（等价于人类看着标记走）
  autopilot(on: boolean): void;   // 第一局第 2 间清场排练之后才允许：QA 机器人接管移动/攻击，课程、教练、便条照常触发
  // —— 仅 CI（盲测验收运行中禁止调用/读取）——
  caption: { key: string; anchor: string; rect: { x: number; y: number; w: number; h: number }; alpha: number } | null;
  attempts: Record<string, number>; fails: Record<string, string[]>; help: number; demoPlays: Record<string, number>;
  coach: { mode: 'guided' | 'light' | 'off'; self: number; prompted: number; ignored: number; shownThisRoom: number };
  gates: { rewind: boolean; scrub: boolean; fork: boolean; special: boolean };
  taught: string[]; clock: string; overlaps: number;
  log: { t: number; real: number; ev: string; data?: any }[];   // lessonStart/demoStart/demoEnd/demo-desync/fail/success/caption/coach/gated
  next(): void; skipLesson(): void; setHelp(n: number): void;
  guide: { open: boolean; view: 'grid' | 'focus'; loop: number; seek(loop: number, t: number): void };
}
```

---

## 附 a. 模块 / 文件计划

**包归属**：本方案建议作为基础阶段包 **F4 回溯教学**（接在 F3 之后，与 F1–F3 一样在主分支按顺序完成，因此可以直接改共享文件）。F4a = 核心（字幕栏、富文本、演示木偶、课程运行时、序章、渐进开关、教练、暂停页）；F4b = 排练厅、清场排练、死亡卡、多人泳道、进阶课。下表"之后归属"指生产阶段（PLAN2 §3）由谁接手维护。

### 新文件

| 文件 | 内容 | 之后归属 |
|---|---|---|
| `src/game/onboard/index.ts` | 入口：注册路由、`GameHooks.onRoomStart/onRoomClear/onHub`、`hintsHooks.busy` 包装、`window.__tut`、`Onboard`（`busy/skipAll/reset/firstLaunch/hudShows`） | P7 |
| `src/game/onboard/caption.ts` | 字幕栏（§3） | P7 |
| `src/game/onboard/rich.ts` | `{@action}` 富文本测量/绘制 + 按下动画 | 冻结（共享 UI 工具） |
| `src/game/onboard/demo.ts` | `DemoClip` DSL、`DemoDirector`、按键气泡、演示画框、跳过 | P7 |
| `src/game/onboard/lesson.ts` | `LessonDef`、`LessonRun`（阶段机、帮助等级、闲置、失败节拍、成功节拍） | P7 |
| `src/game/onboard/stage.ts` | `StageHost`（重建 World、胶片擦除）、`InPlaceHost`（软重置） | P7 |
| `src/game/onboard/gates.ts` | `Gate.allow(p, verb)`、`Gate.rewindMode(p)`、`Gate.apply(p, verbs)`、被拦截按键的字幕 | P7 |
| `src/game/onboard/coach.ts` | 即时教练（§8.1） | P7 |
| `src/game/onboard/modelStrip.ts` | 模型条 | P7 |
| `src/game/onboard/props.ts` | `FallingGear` `PracticeDummy` `GlassJar` `AlarmTurret` `PendulumBlade` `MarkerRing` `InesStand` | P7 |
| `src/game/onboard/lessons/core.ts` | move / strike / undo / echo / paradox / final（含演示与场地） | P7 |
| `src/game/onboard/lessons/inrun.ts` | scrub / fork 清场排练 | P7 |
| `src/game/onboard/lessons/advanced.ts` | sync / culprit / tickDodge / perfect / pierce / chain / recall / fixed（F4b，草图） | P7 |
| `src/game/onboard/guide.ts` + `loops.ts` | `rewindGuide` 面板、`LoopPlayer`、6 个循环数据 | P7 |
| `src/game/scenes/prologue.ts` | `PrologueScene`（P0、各课舞台、时钟、成绩单、尾声、交接） | P7（PLAN2 已列为 P7 新建） |
| `src/game/rooms/rehearsal.ts` | 排练厅（F4b） | P7（PLAN2 已列） |
| `src/game/strings/onboard.ts` | 全部文案 + `defineTerm('rewind'\|'scrub')` | P7 |
| `tools/scripts/onboard/*.json` | 测试脚本（附 b） | P7 |

音效：`lessonPass lessonRetry demoStart filmWipe clockJump glyphPress spotPing windUp` 放进 `src/audio/sfx_story.ts`（P7 的音效文件；boot 已预留注册调用），无需新注册槽。

### 修改现有文件（接口请求）

| 文件 | 改动 | 之后归属 |
|---|---|---|
| `src/game/entities/player.ts` | ① `gate: { rewind; fork; scrub; special; attack; dash }`（默认全开），`tryRewind` / `updateFork` / 特技前检查，被拦截时发 `custom {id:'gated', data:{verb}}`；② 擦带判定用 `Gate.rewindMode(this)` 代替 `settings.rewindMode`；③ `renderTint`（§4.4）；④ `lastDeath` 快照（§8.3）；⑤ 舞台用 `hpFloor`（演示中 hp 夹到 1）；⑥ `coachHold`（§5.0：只收回溯键、暂停录像、无敌） | P1 |
| `src/game/ui/hud.ts` | `Hud.filter(id, p)`（渐进显示）；`Hud.widgetRect(id, slot)`（聚光 HUD 目标）；顶部区域把字幕栏排在 objective 与 chain 之间 | P1 |
| `src/game/ui/rewindHud.ts` | ① 读 `Coach.shadowGlyph(p)` 在 `+N` 旁画按键；② 血条青段的子矩形供聚光；③ 术语框避让（F3 修复轮 #65 已在做）+ 无处可放时改投字幕栏；④ 导出 `drawShadowOutline` 给暂停页；⑤ `Onboard.calloutsMuted()` 为真时不画术语框与 HUD 白话牌（§5.0） | P1 |
| `src/game/entities/echo.ts` | 导出纯函数 `drawEchoFrame`（暂停页） | P4 |
| `src/game/ui/pause.ts` | 暂停菜单加"回溯怎么用"；序章中加"再看演示 / 跳过这一课 / 跳过序章"；设置加"教学指导 / 跳过全部教学 / 重置教学进度" | P4 |
| `src/game/settings.ts` | `coach: 'auto'\|'always'\|'off'` | P7 |
| `src/game/flow.ts` | 标题"开始"→ `!prologueDone` 时进 P0；`startRun` 首间不再用 `'tutorial'`（改 `'combat'`，首局用"首间"模板） | P6 |
| `src/game/scenes/hub.ts` | 首访目标序列（或经 `GameHooks.onHub` + objective 组件实现，尽量不改文件）；排练厅门站 | P6 |
| `src/game/scenes/summary.ts` | 死亡卡提示行 + 按钮 | P6 |
| `src/game/save.ts` | `profile.onboard = { v:1, choice, lessons: Record<id,{done,attempts,skipped?,t?}>, coach:{self,prompted,ignored}, prologueMs? }`，`normalize` 补默认 | P6 |
| `src/game/rooms/tutorial.ts` | 退役：删除地刻与 `RewindCoach`；`'tutorial'` 类型保留（权重 0）供 `?room=tutorial` 回归 | P7 |
| `src/game/world/roomgen.ts` | `GenOpts.shape?` 固定房型（舞台用 plain） | P2 |
| `src/game/qa/bot.ts` | 机器人尊重 `gate`（关闭时不按）；`?bot=1` 默认 `onboard=skip` | P1 |
| `src/engine/input.ts` | `raw.kbColumn: 0\|1`（最近一次按下的绑定序号） | 冻结（主程） |
| `src/game/ui/widgets.ts` | `keyFor` 用 `kbColumn`；`drawPrompt(..., o?: { pressed?: boolean })` 下沉态 | 冻结（主程） |
| `src/game/systems/rewind.ts` | 无需改（`Recorder.clear()` 已有） | 冻结 |
| `src/game/boot.ts` | `import './onboard'` | 冻结（主程） |
| `src/game/progression/rewards.ts` 等（P4） | 未教 `fork` 前不提供依赖分岔的回忆/沙漏（标签 `fork`） | P4 |

---

## 附 b. 盲测测试计划

### b.1 被测对象与通过标准

盲测代理：**全新档案**（`tools/shot.cjs` 每次启动新的 Chromium，`localStorage` 为空），**不读本文档、GDD、源码**，只看自己截的图，走完序章 + 第一层（第一层第 3 间以后可开自动战斗，见 b.3）。最后用自己的话写下：

| # | 项 | 必含要点（评分代理据此判） | 判为不通过的典型说法 |
|---|---|---|---|
| 1 | 回溯：怎么用、何时用 | 按 Q（手柄 LB）；**刚挨打后**（约 3 秒内）；回到旧影/几秒前的位置；受的伤撤销；花时砂 | "回溯是闪避""随时回血" |
| 2 | 残响：怎么用、何时用 | 回溯（或分岔）后留下"刚才的我"，重复刚才的移动和攻击；伤害算数；所以先打再回溯 = 多打一遍 | "残响是敌人""残响会跟着我" |
| 3 | 悖论：怎么用、何时用 | 残响头上 ◆ 亮了后走进/碰它 → 爆炸，伤敌、能打碎特殊物体（+时砂） | "被残响碰到会受伤" |
| 4 | 分岔：怎么用、何时用 | 按 R（RB）；不挨打、不移动就留下残响，它从约 2 秒前的位置走到你按键的地方；50 时砂；常用来做悖论 | "分岔 = 回溯" |
| 5 | 按住回溯（擦带） | 按住回溯键，预览影往回走，选好位置松开；退得近更便宜；（冲刺取消） | "按住 = 蓄力攻击" |
| 6 | 时砂是什么 | 回溯/分岔消耗的能量；打中敌人攒回来 | "时砂是血/钱" |
| 7 | 磁带是什么 | 血条下记录最近 3 秒的条；红刻痕 = 挨打的时刻，退过它就撤销 | "磁带是体力条" |
| 8 | 旧影是什么 | 3 秒前的我的空心轮廓，轻按回溯回到那里 | "旧影是残响" |
| 9 | 残响是什么 | 过去的我（青色分身），会把我做过的动作再做一遍 | — |
| 10 | 悖论是什么 | 碰到自己的（就绪的）残响 → 爆炸 | — |

**通过**：中文运行 10/10；英文运行 10/10；手柄图标运行中 1、4、5 项说出 LB / RB；另需：序章总模拟时间 ≤ 360 s（参考脚本）、`__tut.overlaps === 0`、控制台 `[text] CJK in tiny` 为 0、演示 `demo-desync` 为 0。

### b.2 盲测代理可用的工具（"像人一样玩"）

- 路由：`?scene=prologue&lang=zh`（正式运行从 P0 开始：`?onboard=fresh`）。
- 允许的 eval：`__tut.wait(...)`、`__tut.freeze()/thaw()`、`__tut.hold/tap`、`__tut.walkToward('objective')`、读 `__tut.where/lesson/phase/step`（仅同步）。
- 禁止：读 `__tut.caption/log/attempts`、调用 `next/skipLesson/setHelp/guide.seek`、读文档与源码。
- 截图节奏：每次 `__tut.wait('caption')` 返回后立即 `freeze → shot → thaw`，保证每条教学文字都被截到。
- 迭代方式：因为序章是确定性的，代理可以每次从头重跑一个更长的脚本；也可用 `&lesson=<id>` 从某课开始（截图内容一致）。

### b.3 需要编写的脚本（`tools/scripts/onboard/`）

| 脚本 | URL | 内容 | 用途 |
|---|---|---|---|
| `lib.json` | — | 第 0 步注入的辅助函数（同 `rewind2.json` 的 `__rw` 写法），只封装允许的 eval | 所有脚本共用 |
| `prologue_ref.json` | `?onboard=fresh&lang=zh` | P0 → L1…L6 → 成绩单 → 尾声，全部用真实按键；每条字幕截图；结尾 eval 断言：总模拟时间 ≤ 360 s、各课一次通过、`overlaps === 0`、`demo-desync` 为 0 | CI 参考跑（不给盲测） |
| `prologue_ref_en.json` | 同上 `&lang=en` | 同上 | CI |
| `prologue_pad.json` | `&glyph=pad` | 同上，截图核对 LB/RB/X/A 图标；另用 `tools/padtest4.cjs` 的虚拟手柄做一次真手柄输入版 `onboard_pad.cjs` | CI |
| `prologue_kbonly.json` | `&lang=zh` | 只用 J/K/L/I/空格/方向键游玩，核对字幕显示 L 而非 Q | CI（依赖 kbColumn） |
| `prologue_fail.json` | `&lesson=undo` 起 | 每个尝试故意失败一次（不按回溯、自己打碎木人、让残响过期、在钟罩远处回溯），截 failBeat；第 3 次失败核对"再看一遍"询问；`{@info}` 重放 | CI |
| `prologue_skip.json` | `?onboard=fresh` | P0 选"跳过"→ 工坊 → 开局 → 按 R 能分岔、按住能擦带 | CI |
| `run1_floor1.json` | `?onboard=prologueDone&scene=hub&first=1&seed=2` | 工坊首访 → 开局 → 第 1 间（教练截图、分岔被拦截字幕）→ 清场排练①（按住）→ 第 2 间 → 清场排练②（分岔）→ 之后 `?bot` 式自动战斗（`__tut` 提供 `autopilot(true)`，仅移动/攻击，课程与便条照常触发）打完第一层，房间开始/清场/每条字幕/每张便条截图 | CI + 盲测模板 |
| `guide.json` | `?scene=rewindGuide` | 网格截图 + 6 个循环 × 3 帧（`guide.seek`） | CI |
| `coach.json` | `?seed=2&floor=0&spawn=cogling&coach=guided` | 受击 → 截冻结引导；自己回溯 3 次 → 断言 `coach.mode` 降级；6 次 → off | CI |
| `deathcard.json` | `?scene=summary&kind=death&deathhint=gain` 等 4 种 | 截 4 种死亡卡 | CI |
| `hall.json` / `coop_hall.json` | `?scene=rehearsal[&players=2]` | 课程板、一节课的演示与练习；双人同时上课互不阻塞 | CI（F4b） |
| `blind_template.json` | `?onboard=fresh&lang=zh` | 只含 `lib` + 等待/截图骨架，按键处留空 | 交给盲测代理 |

分辨率矩阵：1280×720（主）、1366×768、1920×1080；文字大小 125% 一次（`setStorage` 写设置）。

### b.4 盲测流程

1. 主程启动开发服务器，给盲测代理：URL、`blind_template.json`、b.2 规则、b.1 的 10 个问题（不给要点列）。
2. 代理边玩边截图，最终提交：10 项说明 + "哪里没看懂"自由反馈 + 截图目录。
3. 评分代理按 b.1 要点逐项判；任何一项不通过 → 记录对应截图与缺失信息 → 修改文案/时序 → 换一个新的盲测代理重测（同一代理不得复测）。
4. 英文、手柄各再跑一次（可以是新的代理）。

---

## 附 c. 五个最大风险与对策

| # | 风险 | 后果 | 对策 |
|---|---|---|---|
| 1 | **演示漂移**：演示用真实战斗代码，P1/P2/P5 调参（攻击范围、连段时间、齿轮仔 AI）后，演示里该打中的没打中、木人没碎，剧情讲不通 | 演示与字幕对不上，比没有演示更糊涂 | 转向式 DSL（不录原始输入）；课程道具全是本模块自有实体，数值是课程常量（木人 HP = 实际武器三连段 + 4，生成时计算）；每个 `waitFor` 有 `timeout + force` 自愈并记 `demo-desync`；CI 每次合并跑 `prologue_ref.json` 与全部 `?lesson=` 演示，desync > 0 即失败；舞台用固定种子 + 整个 World 重建 |
| 2 | **输入交接**：演示期间换掉 `p.input`，切换瞬间残留按住状态（回溯按住中、分岔按住中、手柄摇杆偏移），或多人时影响别人 | 交还控制时角色自己冲刺/回溯，或卡住 | 只在舞台重建后（角色静止、`rw = null`、`forkHold = -1`）切换；交还时消耗真实输入的全部动作并等待 0.2 s 中立输入；bot 输入用独立 `PlayerInput` 视图并在结束时 `dispose()`；按键图标设备族始终取真实输入；`prologue_fail.json` 覆盖"演示中狂按""演示中暂停""演示中拔手柄" |
| 3 | **顶部中央拥挤**：字幕栏、目标行、连锁计数、楼层卡、首领血条、多人共享钱袋、便条都抢同一块，且要适配 1366×768、125% 文字、2–4 人 | 字幕被挤掉或又盖住战斗（回到 S1#1） | 顶部区域由 `hud.ts` 统一排序（objective → caption → chain），楼层卡/转阶段时字幕排队；运行时避让（§3.4）+ `__tut.overlaps` 断言 = 0；文案硬上限 18 汉字/行、最多 3 行；分辨率 × 文字大小 × 人数截图矩阵；序章舞台从几何上保证地面在字幕栏下方 |
| 4 | **渐进开关的副作用**：分岔/擦带被关，老玩家觉得被限制；多人客人共享档案也被关；QA 机器人、每日一秒、契约等模式行为改变；奖励池给出依赖分岔的回忆 | 体验割裂、回归测试变红、"拿到一个用不了的回忆" | 首启"跳过"、设置一键解锁、暂停跳过；最多只关 2 间房；`?bot=1`、非 standard 模式一律视为已教；跳过某课 = 动词照样开放；P4 奖励池过滤 `fork` 标签直到已教；被拦截的按键给明确字幕且不扣资源 |
| 5 | **教学保真**：为好学而加的"训练轮"（L5 残响驻留 2 s、时砂补满、不会死）让第一局预期落空；暂停页关键帧循环与真实画面渐渐不一致 | 玩家进第一局后发现"残响停得没那么久""怎么死了"，信任下降 | 训练轮只有 L5 驻留一项，并在 L6 用真实数值且明说"实战里残响只停 0.6 秒"；第一局前两间开启教练兜底；暂停页只用真实精灵与从游戏导出的绘制函数（`drawEchoFrame`、`drawShadowOutline`、`drawStamp`）；`guide.json` 截图与游戏内 `R2_zh_*` 同元素做人工比对，任何 GDD2 §3.12 数值改动都要求同步更新 `loops.ts` 与文案中的数字（文案里的数字从 `mods` 读，不写死：如 `{cost}`、`{stand}`） |

（另：节奏超时 —— 每课有目标/上限计时并写入 `__tut.log`，参考脚本断言总时长；帮助等级与"先跳过这一课"保证卡关玩家也能在约 7 分半内走完。）
