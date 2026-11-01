# 回溯教学 2.0 草案 · 局内教练与反馈回路 (coaching.md)

> 草案作者：设计师（视角：**局内教练 + 反馈回路**）。供 F4「回溯教学」综合稿 `docs/ONBOARD2.md` 使用。
> 依据：`docs/GDD2.md`（下称 GDD §x）§2 §3 §5.5–5.6 §9；`docs/PLAN2.md`（下称 PLAN §x）§0.2 §1.2/1.2b §1.6–1.8 §3；`docs/TECH.md` F1–F3 节；盲测报告 `f3_clarity.md`（下称"清晰度报告"）与 `tools/out/F3/ux/*`、`tools/out/F3/{zh,rw}_*` 截图；当前代码（`rooms/tutorial.ts` `ui/hints.ts` `ui/rewindHud.ts` `strings/f3.ts` `strings.ts` `ui/widgets.ts` `engine/input.ts` `entities/player.ts` `systems/{rewind,paradox,downed}.ts` `entities/echo.ts` `scenes/{hub,game,summary}.ts` `ui/{pause,panels,hud}.ts` `flow.ts` `save.ts` `settings.ts` `meta/registry.ts` `debugRoutes.ts` `qa/bot.ts` `tools/shot.cjs`），以及 F3 修复轮正在写、尚未提交的 `src/game/ui/callouts.ts`（`Callouts` 避让标注 + `Caption` 字幕轨）。
> 同目录另一份草案 `progressive.md`（渐进揭示 / 排练厅 / 掌握提示）已存在。本稿**刻意与它共用**：同一句心智模型、同一组"为什么"、同一个"按住 = 轻按直到教过擦带"的闸门；本稿只在"分岔第一次按键"上给出不同方案（§2.8），并把它草图化的刚挨打教练、字幕轨、死亡卡做到可实现的深度。
> **不改任何名字、不改风格**。所有改动都是"怎么教、什么时候教、放在屏幕哪里"。本稿只写设计，未改任何代码。

---

## 0. 结论先行（15 条）

1. **一句话，全游戏同一个说法**：「回溯 = 撤销刚才几秒（伤也撤销）」「刚才的你变成残响，把刚才的动作再做一遍」。教练每一句成功提示都回扣它（§1）。
2. **教练只做一件事：在"刚好用得上"的那一刻，把按键和后果放到玩家眼前**。句式永远是「情境 → 按键 → 结果」：`刚挨打？按 [LB] 撤销`。
3. **四级自适应**（每个座位一份）：L3 满教（慢动作 + 大卡 + 2× 按键图标）→ L2 一行字幕 → L1 血条旁的按键芯片 → L0 关。**玩家自己撤销 2/4/6 次**分别降一级；**同房间错过 2 次**临时升一级；**死于"本可回溯"**下一局至少回到 L2（§3.3）。
4. **机会窗口模型**：一次可撤销的受击 = 一个"机会"，它的寿命 = 旧影走过那次受击之前的秒数（时砂满时 3 s）。卡片底部的倒计时条就是这段寿命，教玩家"你有 3 秒"（§3.4）。
5. **12 个检测器**：刚挨打（核心）、错过、残响白打（正反馈）、残响旁有敌人却不引爆、时砂满 20 s 没用、时砂不够/够不到、拒绝原因"怎么办"、擦带退太近、未教动词的第一次按键、反复死于同一敌人、最后一秒、多人拉回（§3.5–3.6）。
6. **慢动作只在 L3、只在刚挨打之后**（玩家本来就被打断了），单人 `world.slowmo(0.3, 0.9)`，受击后 0.75 s 无敌覆盖整段慢动作，**教练永远不会害死玩家**；终身最多 6 次，可在设置里关。
7. **成功节拍 Beat**（教练、序章、课程、排练厅共用一个组件）：印章「撤销！」+ 双音"嘀嗒" + 手柄轻震 + 一行"为什么"（2 s）。
8. **屏幕调度 Stage**：所有教学文字只能落在 4 种停靠位（顶轨 / 底轨 / 座位角 / 铭牌芯片），每帧与"硬障碍"（每只手 +8 px、残响、悖论预告、敌人前摇 +48 px、预警图形、近身子弹、印章、HUD、便条卡、最后一秒面板、楼层卡）求交；顶轨被占 → 底轨 → 关键提示退成铭牌芯片，**任何教学文字都不会压在玩家/敌人/预警上**（§4.3，伪代码）。
9. **注意力预算**：单人同一时刻最多 1 条字幕 + 1 个术语标注 + 印章；关键卡（L3、最后一秒、★便条）在场时不开始新的术语标注、不弹新便条、楼层卡立刻收起（§4.4）。逐条解决清晰度报告 S1 #1–#6（§4.5）。
10. **死亡卡在倒下的那一刻出现**（游戏场景内，不等结算）：一句带当前设备按键的原因（「你死前 2 秒有 +22 可以拿回：按 [LB]」）+ 一个 320×180 的**磁带回放**：最后 3 s 的真实画面，冻结在"该按的那一帧"，按键图标按下，画面**倒放**回旧影，`+22` 与印章「撤销！」——回放本身就是心智模型的演示（§5）。
11. **回放要求玩家按回溯键来播放**：「按 [LB] 看回溯怎么救你」。死后第一件事就是亲手按一次那个键。
12. **禁用只用在两处**：未教擦带前"按住 = 轻按"（消灭 S1 #3/#4 的"按了没回血"）；未教分岔前**第一次按分岔只解释不扣砂，3 s 内再按一次就照常分岔**（尊重好奇，防手柄 LB/RB 误触）。其余被动规则照常生效、只是不宣传（§2.8）。
13. **多人**：每座位独立等级与提示，提示画在该玩家铭牌所在角，用他自己的按键图标与槽位色；不全局减速，只在他周围 r72 开 0.6 s 时间气泡；谁的提示都不挡别人；新增"队友倒地 → 靠近按住 [LB] 拉回"教练（§6）。
14. **设置**：教练提示 自动/总是/关闭，教练慢动作 开/关，死亡回放 开/关；暂停菜单「我会玩了」；`?coach=` 调试覆盖（§7）。
15. **可测**：`window.__coach`（等级、计数、每条提示的文字/停靠/矩形/透明度/结局）、`__coach.audit()`（每帧教学文字 ∩ 硬障碍 = 0）、`?coach=` `?coachdet=` `?drill=death&case=` `?glyphs=pad|kb` 路由、11 个 `tools/scripts/coach_*.json` 截图脚本，盲测代理只看截图就能复述"何时、为何、怎么按"（§(b)）。

---

## 1. 统一说法

### 1.1 心智模型（与 `progressive.md` §1.1 逐字相同，键名 `S('coach','model1'|'model2')`，综合稿合并为一处）

| 用途 | zh | en |
|---|---|---|
| 第 1 行 | 回溯 = 撤销刚才几秒（伤也撤销） | Rewind = undo the last few seconds (damage too) |
| 第 2 行 | 刚才的你变成残响，把刚才的动作再做一遍 | The you from then becomes an Echo and does it all again |

### 1.2 三个"为什么"（教练成功句只用这三句或它们的"结果 · 回扣"变体）

| id | 图标 | zh（≤18 字） | en |
|---|---|---|---|
| W1 撤销 | `rewind` | 刚挨打？回溯就撤销 | Just got hit? Rewind undoes it |
| W2 白打 | `echo` | 残响再打一遍 · 伤害白赚 | Your Echo hits again · free damage |
| W3 爆炸 | `paradox` | 碰到自己的残响 → 爆炸 | Touch your own Echo → explosion |

### 1.3 教练句式规则（实现时逐条自查）

1. **情境 → 按键 → 结果**，按这个顺序写：`时砂满了：按 [RB] 分岔，留个帮手`。不写"建议""你可以试试"。
2. 一行 ≤ 18 个汉字（不含按键图标和数字），英文 ≤ 44 字符；超出时 `Text.wrap` 成两行，卡宽上限 360。
3. 按键一律写成令牌 `{k:rewind}` `{k:fork}` `{k:dash}` `{k:attack}`，由 `richLine()` 画成**该玩家当前设备**的图标（§3.7）；文字里永远不写死 Q / LB。
4. 只用**已教过**的风格名；还没教过的东西用白话说（"走进残响 → 爆炸"，而不是先说"悖论"）。风格名第一次出现时跟白话：`悖论（碰到自己的残响 → 爆炸）`。
5. 颜色：回溯相关 C3/C4；危险 R4；紫色伤害 V3；练习/奖励 B5；正文 K9/K10。只用调色板。
6. 不责备、不计分：错过时说"撤销不了了（超过 3 秒）"，不说"你失败了"。错过不发声。
7. 字号：卡片标题行 `title`（FP12×2），正文 `body`（FP12），附注 `small`（FP10）。**中文不出现 `tiny`**；所有框高由 `Text.lineH / measure / inkH / promptH()` 推出（TECH F1）。

---

## 2. 全局引导地图（草图级；本视角之外只给接口与裁决）

### 2.1 新玩家的头几局

```
首次启动 →「第一次玩？」卡 ─┬─ 序章《最后一分钟》7 步（≈3 分钟，教练以"脚本模式"出现在第 4–6 步）
                              └─ 我会玩了 → 教练 L0、核心课全部打勾 → 工坊
工坊 1：伊妮丝 → 主发条 → 排练厅（第一次就开放，课程板）→ 钟塔门
第 1 局 房 0：真实战斗，教练 L3（刚挨打卡、残响白打、残响旁有敌人）→ 房 1 清场：分岔课 → 房 2 清场：擦带课（解除"按住=轻按"）
       房 3+：教练按等级淡出；死亡 → 死亡卡（会教 + 回放）
第 2–4 局：被动规则课（同步、元凶、卡秒、连锁、完美回溯、穿越）——progressive.md §4；教练只负责在战斗中"提醒用上"
事件型：紫色伤害、最后一秒、时间锚、多人拉回——第一次遇到时教（便条 + 教练）
```

### 2.2 首启与跳过（草图）

- 首次启动（`profile.prologueDone === false` 且无 1.0 存档）在标题"开始"之后弹卡：标题「第一次玩？」，两项「从序章开始（约 3 分钟）」/「我会玩了，直接进工坊」。1.0 存档玩家沿用 GDD §9.1 的"体验新的序章？"。
- 「我会玩了」= `Teach.mark('move','attack','dash','tap','echo','paradox','fork','scrub')`、教练等级 L0（§7）、序章记为跳过（账簿/排练厅可重玩）。

### 2.3 序章《最后一分钟》（草图：7 步；与 `progressive.md` §2.3 一致，偏离 GDD §9.1 需主策划批准）

> 序章只教核心动词（GDD §9.8 规则 2 + 主策划第 4 条）：轻按回溯、残响、悖论。分岔、擦带放到第 1 局房 1/房 2 清场后；紫色伤害放到第一次遇到时（它与"伤也撤销"直接冲突，不该在同一分钟里说）。

| 步 | 教什么 | 先看（示范木偶，§2.4） | 再做 | 通过 | 成功节拍（Beat，§3.8） |
|---|---|---|---|---|---|
| 1 | 移动 | — | 走到伊妮丝身边 | 进入 r16 标记 | — |
| 2 | 攻击 | — | 不回血木桩打一次三连 | 2 s 内同一目标 3 次 `hit` | 「三连！」 |
| 3 | 冲刺 | 木偶冲刺穿过摆刀 | 冲刺穿过摆刀 | 摆刀判定期间 `dash` 且无 `damaged` | 「穿过去了！冲刺时无敌」 |
| 4 | 旧影 + 轻按回溯 | 木偶挨齿轮砸 → [LB] 图标按下 → 跳回旧影 → `+12` | 齿轮砸中你（12）→ **教练 L3 卡（同一张卡，§3.7）** | `rewind` 且 `restored>0` | 「撤销！」+ W1 + 心智模型第 1 行 |
| 5 | 残响 | 木偶打桩两下 → 回溯 → 残响再打两下 | 打桩 → 回溯 | 桩受到 `info.src` 为奇数的 `hit` | 「残响！」+ W2 + 心智模型第 2 行 |
| 6 | 悖论 | 木偶走进 ◆ 残响 → 玻璃箱碎 | 玻璃箱只有悖论能打碎（**教练 D4 的箭头与字幕**） | `paradox` 且箱碎 | 「悖论！」+ W3 |
| 7 | 小考 | — | 两只齿轮仔，教练 L3 全开 | 清场 | 时钟停在 11:59:59 |

**关键点**：第 4、6 步用的就是局内教练的卡片和箭头（脚本模式触发），所以玩家进第 1 局时**已经认识那张卡**。路由 `?scene=prologue[&step=N]`（P7）。

### 2.4 先看再做：示范木偶 DemoPuppet（草图；细节见 `progressive.md` §5.1 的 `Vignette/DemoScript`）

- 外观：玩家精灵 + `K9` 纸白虚线描边、35% 透明、脚下无影子（与青色旧影/残响区分开），头顶 `small` 字「示范」。
- 驱动：脚本输入 `ScriptInput` 喂给真实 `Player` 代码（序章/排练厅在独立小世界 `Vignette` 里；局内课程在清场后的房间里），所以动作与真实手感一致。
- 按键图标随**观看者**设备动画按下：木偶按下回溯的同一 tick，卡片上的 `{k:rewind}` 图标下沉 1 px、变暗 0.12 s，并播 `tapeClick`。
- 每个示范可按 `[Tab]/[View]`（`info`）重播；示范期间玩家不能被打（课程场景）。
- 死亡回放（§5.4）**不用木偶**，用真实录下的画面——它是"你自己"的示范。

### 2.5 局内安静时刻课程（草图，接口）

- 由 `progressive.md` 的 `LessonDirector` 调度（清场后 1.2 s、休息/商店进门 1.5 s；首领房/宝库/楼层第一间不教）。
- 教练与课程**共用** `Stage`（停靠/避让）、`Beat`（成功节拍）、`richLine`（按键令牌）。课程进行中，教练对该座位静默（`Coach.quiet(slot, true)`）。
- 第 1 局：房 1 清场 → 分岔课；房 2 清场 → 擦带课（盲测要求第一层内学会分岔与擦带）。

### 2.6 排练厅（草图；深度见 `progressive.md` §6）

- 第一次进工坊就开放（帷幕拱门，`GameHooks.onHub` 放置）。课程板列表 + ✓（学会）/★（掌握）；每课 = 示范 → 无限时砂练习 → 打勾 + 10 碎片/外观。
- 教练在排练厅里固定 L3、关慢动作（课程自己控节奏）；死亡卡的"去排练厅练「X」"直达对应课。

### 2.7 暂停页「回溯怎么用 / How rewind works」（草图）

- 入口：暂停菜单第 2 项（`Panels.open('rewindGuide')`，`pause.ts` 属 P4，接口请求）；工坊、排练厅、序章第 4 步之后可开；`?scene=guide` 直达。
- 页眉：§1.1 两行（`title` + `body`）。下面 3×2 张卡（每张 196×104 逻辑像素：上 196×72 真实精灵小循环，下两行字 + 按键图标），按键图标随打开者设备。

| 卡 | 标题（`body`，带白话） | 何时（`small`） |
|---|---|---|
| ① 撤销 | 轻按 {k:rewind}：回到旧影，伤也撤销 | 刚挨打的 3 秒内 |
| ② 残响 | 残响（过去的你）：把刚才的动作再做一遍 | 每次回溯、分岔都会留下 |
| ③ 悖论 | ◆ 亮了 → 走进残响 → 爆炸 | 残响旁边有敌人时 |
| ④ 擦带 | 按住 {k:rewind}：自己选退多远，松开落地 | 只想退一点点、省时砂时 |
| ⑤ 分岔 | 按 {k:fork}：不移动，原地留个残响（−50） | 没挨打也想要帮手时 |
| ⑥ 时砂 | 打敌人攒 · 回溯 25–100 · 分岔 50 | 满了再攒就浪费 |

- 未教的卡 60% 暗 + 角标「还没学 · 清场后教你」，循环照常播放。

### 2.8 渐进揭示：禁用 vs 不宣传（裁决）

**原则**：只禁用"按了会出乎意料、看起来像坏了"的东西；凡是"只会加分"的被动规则，一律照常生效、只是不宣传（不显示白话/标记），并由教练在用上时轻轻点名。

| 动词 / 规则 | 教之前 | 在哪教 | 理由 |
|---|---|---|---|
| 轻按回溯 | 可用 | 序章 4 | 核心 |
| 残响 | 可用（被动） | 序章 5 | 核心 |
| 悖论（重合） | 可用 | 序章 6 | 核心 |
| **擦带（按住）** | **禁用：按住 = 轻按**（实现：有效 `rewindMode = settings.rewindMode==='tap' \|\| !Teach.has('scrub')`，按座位；P1 `player.ts` 接口 `RewindGate.tapOnly(p)`） | 第 1 局房 2 清场 | S1 #3/#4：短按住静默回 0 血仍扣砂，新玩家结论是"回溯坏了"。同一个键两种行为，教练讲不清 |
| **分岔** | **软闸门**：第一次按只解释、不扣砂；3 s 内再按一次照常分岔（D9，§3.6） | 第 1 局房 1 清场 | 手柄上 LB/RB 相邻，新玩家常误触 RB：凭空少 50 砂、多一个分身，非常困惑；但好奇的玩家第二下就该得到它 |
| 召回 | 主发条解锁前不存在 | 解锁时 | 本来就锁 |
| 同步 / 卡秒 / 完美回溯 / 连锁 / 穿越 | 照常生效；印章照常（反馈），**不挂白话行** | 第 2–4 局课程 | 只会加分；印章本身是好反馈 |
| 元凶 | 照常生效；**头顶标记与磁带白菱形不显示** | 第 2 局课程 | 清晰度报告：被读成"急救标记"，在教之前只会添乱 |
| 定格伤害（紫） | 照常 | 第一次被紫色打中（便条 `fixed_hit`★ + 教练 D6 变体） | 紫色敌人 1–2 层很少 |
| 最后一秒 / 自救 | 照常 | 第一次生命归零（D11） | 事件型 |
| 拉回 / 二重奏 / 合拍 | 照常 | 第一次多人（D12 + GDD §9.7 卡） | 事件型 |

### 2.9 一句话目标（草图；P2 的 `objective` HUD）

第一局每个房间顶部区域（`Hud.areaRect('top')`）显示 `清空敌人 → 选择下一扇门` 等（GDD §9.8 规则 3）。字幕轨在它下方 4 px（§4.1），两者不重叠。

---

## 3. 局内教练 CoachDirector（深度）

### 3.1 目标与红线

**目标**：玩家在战斗里第一次、第二次、第三次需要回溯/残响/悖论/分岔的时候，屏幕上恰好有"现在按这个键，会发生这个"——然后随他学会而消失。

**红线**（违反任何一条即不合格）：
1. 教学文字**永不**覆盖任何玩家精灵（+8 px）、残响、悖论预告圈、敌人前摇/预警图形、近身子弹（§4）。
2. 教练**永不**让玩家多挨打：慢动作只在受击后的无敌时间内；不暂停（单人 ★便条除外，那是 P7 的便条，不是教练）。
3. 每条提示都带**当前设备**的按键图标；多人用该玩家自己的设备。
4. 不对机器人座位（`input.kind === 'bot'`）出任何提示。
5. 不改模拟的确定性：教练不碰 `world.rng`；计时用 `world.after/every`（模拟）与 HUD `update(dt)`（界面）；不用 `setTimeout`（PLAN §0.2 规则 8）。慢动作只在有真人座位、教练开启时发生，QA 机器人局（`?bot=1`）默认教练关，除非 `?coach=` 显式打开。

### 3.2 结构

```
GameHooks.onRoomStart ──► w.add(new CoachDirector(ctx))      // 每个房间世界一个实体（coach/coach.ts）
                              │ 订阅 bus: damaged rewind fork hit paradox echoArmed echoEnd downed revived kill custom
                              │ 每 0.1 s 轮询（world.every）：D4 D5 D10 D12 与机会过期
                              ├── SeatCoach[slot]      // 等级与计数（槽 I 存 Flags，客人存会话）
                              ├── Opportunity[slot]    // 当前"可撤销受击"机会（§3.4）
                              ├── detectors[]          // D1–D12（coach/detectors.ts）
                              └── PromptQueue          // 每座位 1 条 + 共享轨 1 条；按 tier 排队
Hud.register({id:'coach', area:'top', order:95})  ──► 画卡片/字幕/芯片（位置由 Stage.place 决定，coach/card.ts）
CoachDirector.renderUnlit（世界层）──► 游丝光点、走向残响的箭头 »（不是文字，不受停靠规则约束）
Stage（coach/stage.ts）──► 每帧障碍表、停靠选择、注意力预算、audit
Beat（coach/beat.ts）──► 成功节拍（教练 / 序章 / 课程 / 排练厅共用）
DeathTape + DeathCard（coach/deathTape.ts, coach/deathCard.ts）──► §5
```

### 3.3 座位状态与自适应等级

**等级**

| 等级 | 名称 | 形态 | 慢动作 | 停留 |
|---|---|---|---|---|
| **L3** | 满教 full | **大卡**：标题号行「刚挨打？按 [LB] 撤销」（2× 按键图标）+ 正文行「拿回 +14 生命 · 花 100 时砂」+ 倒计时条；前 2 次多一行「你会回到身后那个淡影（旧影）」。世界里：游丝光点从你流向旧影；旧影 `+N` 与血条青色斜纹同步脉冲 | 单人 `world.slowmo(0.3, 0.9)`（现实秒）+ `G.audio.duck(0.5, 0.9)`；多人 `world.bubbles.push({x,y,r:72,scale:0.4,dur:0.6,owner:p})` | 到按下 / 机会过期 / 2.4 s 后缩成 L2 字幕直到过期 |
| **L2** | 轻提示 light | 一行字幕「[LB] 撤销这一下 +14」（1× 图标）+ 倒计时条 | 无 | 到按下 / 机会过期 / 最长 1.8 s |
| **L1** | 芯片 chip | 血条右侧芯片「[LB] +14」闪 3 下；世界里无字 | 无 | 1.2 s |
| **L0** | 关 off | 无（死亡卡照常） | — | — |

**计数**（每座位）：`self`（自己撤销）、`coached`（提示在场时撤销）、`ignored`（提示出了但机会过期）、`missed`（没出提示、机会过期）、`slowmos`、`shown`（D1 出现次数）、`rate10`（最近 10 次机会的撤销率）。房间级：`roomPrompts` `roomIgnored` `roomMissed` `roomSlow`。

- **自己撤销** = 该座位的 `rewind` 事件 `restored ≥ 5`，且按下时该座位**没有** D1 提示在屏（宽限期内按下也算）。擦带、完美回溯同样算。
- **提示撤销** = 按下时 D1 提示在屏（L3/L2/L1 任一）。

**等级变化**（自动模式）

| 条件 | 变化 |
|---|---|
| `self ≥ 2` 或 `coached ≥ 3` | L3 → L2 |
| `self ≥ 4` | L2 → L1 |
| `self ≥ 6` 且 `rate10 ≥ 0.5` | L1 → L0 |
| 同一房间 `roomMissed ≥ 2` | 下一次 D1 **临时**升一级（最多 L3），用完回原级 |
| 本局死于判定 C1/C2（本可回溯，§5.2） | 下一局开局 `lvl = max(lvl, L2)`；若原为 L0 → L1 |
| 连续 2 局"可撤销受击 ≥ 4 且 self = 0" | 回到 L2 |
| `slowmos ≥ 6` | L3 不再慢动作（卡片照常） |

| 设置 `coach` | 行为 |
|---|---|
| `auto`（默认） | 上表 |
| `always` | 等级下限 L2：每次可撤销受击都至少给一行字幕；L3 慢动作仍受 6 次上限（`coachSlowmo` 关则不慢） |
| `off` | L0；除死亡卡原因行外所有检测器关闭；死亡卡不自动回放 |

**存储**：槽 I 用 `Flags`（存档级数字表，P6 `save.ts` 零改动）：`coach.lvl` `coach.self` `coach.coached` `coach.ignored` `coach.missed` `coach.slowmos` `coach.shown` `coach.rate`（×100）`coach.noSelfRuns`。槽 II–IV（同屏客人）存在会话内 `SeatCoach`，加入时从 **L2** 起步、降级阈值减半（2/3/4）——我们不知道客人会不会玩，用轻提示起步、学得快就快速消失。

### 3.4 机会窗口模型 Opportunity

一次可撤销的受击 = 一个机会。它直接从 F3 的真实数据算，不靠猜：

```ts
interface Opp {
  slot: number;
  tHit: number;        // 受击时的 world.time（模拟秒）
  gain0: number;       // 受击后那一刻 rewindPreview().hpGain
  prompted: boolean;   // D1 提示是否出过
  visibleSince: number;// 提示开始在屏的 G.time（现实秒），-1 = 不在屏
  graceLeft: number;   // 现实秒
}
const GAIN_MIN = (p) => Math.max(5, Math.round(0.1 * p.maxHp));   // 秒针 50 HP → 5；1–4 点的擦伤不打扰
// 每 tick：
const pv = p.rewindPreview();
const remaining = pv.seconds - (w.time - opp.tHit);   // 旧影还要多久走过那次受击（模拟秒）
const valid = p.state === 'alive' && p.canRewind().ok && pv.hpGain >= GAIN_MIN(p) && remaining > 0;
const frac = clamp(remaining / p.mods.tapeLen, 0, 1);  // 倒计时条
```

- 时砂 ≥ 100 时 `pv.seconds = 3`，机会寿命 = 3 s；时砂少时旧影更近，寿命更短——倒计时条如实变短，教会玩家"时砂少时窗口也短"。
- 连续受击：同一座位只保留一个机会，`tHit` 更新为最新一击，提示上的 `+N` 与代价每帧刷新（读 `pv.hpGain` `pv.cost`）。
- 结束：`rewind` 事件（→ 提示撤销 / 自己撤销）、`valid` 变假（→ 过期）、玩家停摆（→ 交给 D11 最后一秒）。

### 3.5 检测器总表

| id | 名称 | 触发 | 等级/前提 | 形态 | tier（§4.4） |
|---|---|---|---|---|---|
| D1 | 刚挨打 `hit` | bus `damaged` `undoable` | 等级 ≥ L1 | 按等级：卡/字幕/芯片（+慢动作） | S（L3）/ A（L2）/ B（L1） |
| D2 | 错过 `expire` | D1 机会过期 | 终身前 2 次 | 字幕 | C |
| D3 | 残响白打 `echoFree` | bus `hit`，`info.src` 为奇数且属该座位 | 终身前 3 次 | 字幕（正反馈） | C |
| D4 | 残响旁有敌人却不引爆 `echoIgnored` | 轮询 | `Stats('did.paradox') < 3` 或等级 ≥ L2 | 字幕 + 世界箭头 » | A |
| D5 | 时砂满 20 s 没用 `sandFull` | 轮询 | 前 5 局 或 `always` | 字幕 | C |
| D6 | 时砂不够 / 够不到 `sandLow` | bus `damaged` | 每房间 1 次 | 字幕 | A |
| D7 | 拒绝原因"怎么办" `refuse` | `custom rewindRefused/forkRefused`（接口请求） | 每种原因终身前 2 次 | 字幕第二行 | B |
| D8 | 擦带退太近 `scrubShort` | bus `rewind` `scrub && restored==0` | `Teach.has('scrub')` | 字幕 | B |
| D9 | 未教动词第一次按键 `untaught` | `ForkGate.allow(p)` 被调用 / 按住回溯 > 0.6 s | 未教分岔 / 未教擦带 | 字幕 | A |
| D10 | 反复死于同一敌人 `repeatKiller` | 轮询（该类敌人前摇且 ≤140 px） | 上一局死于它，或终身死于它 ≥ 2 | 字幕（预先） | B |
| D11 | 最后一秒 `lastSecond` | 停摆最后一秒开始 / `revived{source:'self'}` | 单人 | 面板附注 / Beat | S |
| D12 | 队友倒地 `pullBack` | bus `downed`（多人） | 救援者时砂 ≥ 100 | 座位字幕 + 箭头 | A |

### 3.6 检测器详述

#### D1 刚挨打（核心）

- **触发**：`damaged {player:p, undoable:true}`，`p` 为真人座位。
- **条件**（全部满足才出提示；否则只记机会，不出字）：等级 ≥ L1；`Coach.mode() !== 'off'`；不在 §3.9 的抑制条件里；房间已进行 ≥ 1.0 s；本座位距上次 D1 ≥ 4 s；本房间 D1 < 4 次且 `roomIgnored < 2`。
- **宽限期**（给"会的人"一个先出手的机会）：`shown < 2` → 0.05 s（第一次第二次几乎立刻）；之后 L3 0.30 s、L2 0.45 s、L1 0.60 s（现实秒，从顿帧结束开始）。宽限期内按下回溯 = 自己撤销，不出提示。
- **宽限期结束且 `valid`**：
  - L3：慢动作（若 `world.timeScale === 1`、无其他气泡、`slowmos < 6`、`roomSlow < 2`、距上次慢动作 ≥ 10 s、`settings.coachSlowmo`）+ 大卡 + 世界效果 + `coachTick` 音 + 手柄 `rumble(0.15, 0.25, 80)`。2.4 s 后若仍 `valid` → 收成 L2 字幕「还来得及：{k:rewind} 撤销 +{n}」直到过期。
  - L2：字幕「{k:rewind} 撤销这一下 +{n}」+ 倒计时条，最长 1.8 s（过期更早则更早）。
  - L1：芯片「{k:rewind} +{n}」闪 3 下（1.2 s）。
- **若 `valid` 为假，原因是时砂** → 改走 D6。
- **成功**（提示在屏时 `rewind` 事件）：`coached++`；`Beat.success({p, id:'hit', stamp:'撤销！', why:'hit.ok.why'})`；终身第一次再加一行 `hit.ok.first`「这就是回溯：撤销刚才几秒」。
- **自己撤销**：`self++`；终身前 3 次给轻节拍：无印章，字幕「自己撤销了 · 就是这样！」（tier C，1.6 s）。之后静默（落地的 `+N` 已足够）。
- **过期**：`prompted` → `ignored++`、`roomIgnored++`，走 D2；未提示 → `missed++`、`roomMissed++`。
- **调试**：`?coachdet=hit` 在房间第 1 s 用最近敌人打一下（与 `__rw.hit` 同法），`__coach.force('hit')`。

#### D2 错过

- 终身前 2 次（`Flags coach.expireShown < 2`）机会过期且曾提示：字幕「那一下已过 3 秒，撤销不了了」（`{s}` 用实际 `pv.seconds` 取整，时砂少时会说"已过 1 秒"），1.8 s，无音效。之后静默只计数。

#### D3 残响白打（正反馈，回扣 W2）

- **触发**：`hit {info, player:p}`，`info.src % 2 === 1`（残响）且 `info.player === p`，真人座位。
- **条件**：`Stats('coach.echoHits') < 3`；本房间未出过；没有 tier S/A 在屏（等 ≤ 2 s，过期丢弃）。
- **画面**：字幕「残响替你打中了 · 伤害白赚」1.8 s。世界里不加东西（命中数字已存在）。
- **计数**：`Stats.add('coach.echoHits', 1)`。

#### D4 残响旁有敌人却不引爆（回扣 W3）

- **轮询**（每 0.1 s）：该座位的残响 `e`，`e.paradoxReady`（已就绪、非召回、冷却完）；`e` 的 48 px 内至少 1 个存活敌人；`dist(p,e) ∈ [20, 160]`；`calm(p)`（§3.9）；本房间未出过。
- **画面**：
  - 字幕「残响旁有敌人：走进残响 → 爆炸」（未教悖论时第一次用长版：「走进自己的残响 → 爆炸（悖论）」）；若 `e.phase === 'stand'`（驻留，快碎了）换成「残响快碎了，现在走进去！」。
  - 世界里（`renderUnlit`）：从 `p` 到 `e` 一条 1 px C3 箭头线，3 个 » 以 0.5 s 周期向残响流动，两端各留 12 px；残响头顶 ◆ 本来就有（F3），不再加字。`armed` 术语标注被 D4 字幕取代（`supersedes`）。
- **成功**：`paradox {player:p, echo:e}`（重合/穿越）→ `Beat.success({p, id:'paradox', stamp:false /* 悖论系统已有印章 */, why:'paradox.ok.why'})`「炸到了 · 残响就是你的炸弹」；`Stats.add('did.paradox',1)`。
- **失败**：`echoEnd {echo:e, paradox:false}` → 终身第一次：字幕「下次 ◆ 亮了就走进残响」2 s。
- **限制**：每房间 1 次；自动模式终身 ≤ 3 次（`always` 每房间 1 次，前 10 局）。

#### D5 时砂满 20 s 没用

- **轮询**：`lo.sand ≥ lo.sandMax − 0.5` 连续 20 s（模拟秒）；房间里有存活敌人；该座位这段时间没有回溯/分岔；`calm(p)`。
- **画面**：已教分岔 → 「时砂满了：按 {k:fork} 分岔，留个帮手」；未教 → 「时砂满了，再攒就浪费：大胆用 {k:rewind}」。2.4 s。
- **限制**：每房间 1 次、每局 ≤ 2 次、自动模式只在前 5 局（`profile.runs ≤ 5`）。不出成功节拍（避免噪音），只计 `Stats('coach.sandFullUsed')`（6 s 内用掉）。

#### D6 时砂不够 / 够不到

- **触发**：`damaged` 可撤销，且 `p.canRewind().reason === 'sand'` → 「时砂不够（{n}/25）：打敌人就能攒」2.2 s；每房间 1 次，终身 ≤ 4 次。
- **变体**：`canRewind().ok` 但 `pv.hpGain < GAIN_MIN`，而磁带上 3 s 内有红刻痕（这一击比时砂能付的更早）→ 「时砂只够退 {s} 秒，够不到那一下」；终身 ≤ 2 次。
- **紫色变体**：受击 `info.fixed`（定格），且便条 `fixed_hit` 已显示过 → 不出（便条负责）；未显示过（如便条被节流）→ 字幕「紫色伤害撤销不了：躲开它」，终身 1 次。

#### D7 拒绝原因"怎么办"

- **触发**：需要 `player.ts`（P1）在 `refuse()` / `refuseFork()` 里发 `bus.emit('custom', {id:'rewindRefused'|'forkRefused', player, data:{reason, need}})`（接口请求，§(a)）。头顶的拒绝原因文字（F3）照旧；教练在字幕轨补"怎么办"。
- **文案**（每种原因终身前 2 次，2.0 s）：`sand`「打敌人攒时砂，残响打中也算」；`tape`「刚进门或刚回溯，磁带还短」；`anchor`「离开锁链圈，或打掉锚铃」；`burnt`「自救烧了磁带：{s} 秒后恢复」；`cooldown`（分岔）不补。

#### D8 擦带退太近（S1 #3 的教练侧）

- **前提**：`Teach.has('scrub')`（之前按住 = 轻按，不会发生）。
- **触发**：`rewind {player:p, scrub:true, restored:0}`，且按下时该座位机会 `valid`（磁带上有可撤销的伤，只是没退到）。
- **画面**：「退得不够远：再按久一点 → +{n}」（`{n}` = 机会的 `gain0`），2.2 s；每房间 1 次，终身 ≤ 3 次。

#### D9 未教动词的第一次按键（软闸门）

- **分岔**（未 `Teach.has('fork')`，按座位）：`player.ts` 在 `fork()` 开头问 `ForkGate.allow(p)`（接口请求；默认实现恒为 true）。教练实现：
  - 第一次按：返回 false（**不扣砂、不生成**），字幕两行「这是 {k:fork} 分岔：原地留个残响（−50）」/「再按一次就用 · 清场后详细教你」，3 s；`gate.until = G.time + 3`；并 `Lessons.request('fork')`（若 LessonDirector 存在，把分岔课排到下一个安静时刻队首）。
  - 3 s 内第二次按：返回 true，照常分岔，`Stats.add('did.fork',1)`。
  - 第 3 次起（同一存档）：直接 true，不再解释。
- **按住回溯**（未教擦带）：`rw.phase==='hold'` 且按键持续 > 0.6 s（闸门把它当轻按，玩家可能以为按住有用）→ 终身前 2 次字幕「按住暂时等于轻按 · 擦带稍后教你」，1.8 s。

#### D10 反复死于同一敌人（预先提醒）

- **开局计算** `K`：`Flags('death.lastRun.'+kind) === profile.runs − 1`（上一局死于它）或 `Flags('death.by.'+kind) ≥ 2`。
- **轮询**：`K` 中某类敌人进入前摇（`e.wind !== null`）且距该座位 ≤ 140 px，本局该类第一次 → 字幕「上次栽在{name}手里：挨打就按 {k:rewind}」2.4 s（`{name}` = 该敌人 `EnemyDef.name`，经 `codexId` 查表；查不到用「这个敌人」）。不减速。
- **限制**：每局每类 1 次。

#### D11 最后一秒（单人）

- 停摆最后一秒开始（`p.down.lastSecond > 0`）：教练**清掉所有提示**（tier S 面板在场，§4.4），机会交给最后一秒面板（`downed.ts` 已画「回溯！」+ 按键 + 「回到刚才」）。终身前 2 次，在面板下方 4 px 加一行 `small` K9「倒下了也能回溯：撤销刚才几秒」（教练自己画，不改 `downed.ts`）。
- 自救成功 `revived {player:p, source:'self'}`：`Beat.success({stamp:'自救！', why:'last.ok'})`「自救！磁带烧毁 6 秒，先躲开」（终身前 3 次）。
- 建议（接口请求，F2/冻结 `strings/f2.ts`）：`lastSecondHint` 改为「撤销刚才几秒 / Undo the last seconds」，与心智模型一致。

#### D12 队友倒地（多人）

- **触发**：`downed {player:q}`；对每个存活真人座位 `p ≠ q`：`p.lo.sand ≥ 100`、`dist(p,q) ∈ (48, 200]`、`q.down.t ≤ 3`（拉回窗口）。
- **画面**：`p` 的座位停靠位字幕「{r} 倒了：靠近，按住 {k:rewind} 拉回」（`{r}` = q 的罗马数字 + 形状徽记，q 的槽位色）；世界里 p → q 的 » 箭头（p 的槽位色）。进入 48 px 后由 `downed.ts` 自己的「按住：拉回 Ⅱ」接管，教练字幕消失。窗口过期即消失。
- **成功**：`revived {player:q, by:p, source:'pullback'}` → `Beat.success({p, stamp:'拉回来了', why:'pull.ok.why'})`「拉回来了 · 他回到 3 秒前」。
- **限制**：每次倒地 1 次；终身（槽 I）≤ 5 次，客人按会话。

### 3.7 提示形态规格（全部画在 UI 层，`Hud.register({id:'coach', area:'top', order:95})` 的 `draw` 里；位置一律问 `Stage.place`）

**富文本 `richLine(ctx, s, x, y, o)`**（`coach/card.ts`）：把文案里的 `{k:action}` 切开，文字用 `Text.draw`，令牌用 `drawPrompt(ctx, action, x, y, who)`（`who = p.input`，于是单人跟随最后使用的设备、多人用各自设备）；返回宽度。`measureRich` 同理（`promptW`）。数字占位 `{n}{c}{s}{name}{r}` 在调用前替换。

**2× 按键图标 `bigPrompt(ctx, action, x, y, who)`**：把 `drawPrompt` 画进一张按 `(action, 设备族, 绑定键)` 缓存的 1× 离屏画布，再以 `imageSmoothingEnabled=false` 画成 2×（像素图标整数放大，锐利）。不需要改冻结的 `widgets.ts`。若主程愿意给 `drawPrompt` 加 `{scale}` 参数则改用它。

**按下动画**：周期 0.5 s，其中 0.12 s"按下"：图标下移 1 px（2× 时 2 px）并叠 30% K0；表示"就是按这个"。

**L3 大卡**

```
┌─────────────────────────────────────────┐  ← 1 px C3 顶线；底板 88% K0；多人左侧 3 px 槽位色条
│  刚挨打？按 [LB] 撤销                    │  行 1：title（FP12×2），C4；[LB] 为 2× 图标，按下动画
│  拿回 +14 生命 · 花 100 时砂             │  行 2：body，K9；+14 用 C3，100 用 C4
│  你会回到身后那个淡影（旧影）            │  行 3（仅前 2 次）：small，K8
│  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░       │  倒计时条：2 px，C3 于 K2，宽 = 卡宽 − 20，长度 = frac
└─────────────────────────────────────────┘
内边距 左右 10 / 上下 5；行距 2；宽 = max(行宽) + 20，≤ 360（行 2 超宽时 Text.wrap）
高 = lineH(title) + 2 + lineH(body) + [2 + lineH(small)] + 3 + 2 + 10
出现：0.12 s 由上方 6 px 落下 + 透明度 0→1；消失：0.2 s 透明度 1→0
```

世界效果（L3 同时）：
- **游丝光点**：`CoachDirector.renderUnlit` 沿 `p.rec` 从最新帧往旧影帧取点，一个 2×2 C4 光点每 0.6 s 从玩家流到旧影（只画在游丝上，不画字）。告诉玩家"会回到那里"。
- **旧影 `+N` 与血条斜纹同步脉冲 0.4 s**（清晰度报告 S2 #7）：需要 `rewindHud.ts`（P1）暴露 `RewindHudFx.pulse(p, 0.4)`（接口请求）；退路：教练在芯片位画一个「↑+14」的 C3 小箭头 0.4 s。

**L2 字幕**：一行 `body` 富文本（1× 图标，按下动画）+ 底部 2 px 倒计时条；底板/顶线同大卡。高 = `max(promptH(), lineH(body))` + 4 + 2 + 8。

**L1 芯片**：单人锚在铭牌：`x = 150, y = 8`（HP 数字右侧，`Hud.podRect(0)` 内），内容 `[LB] +14`（图标 + 5×7 数字 C3），底板 85% K0，`alpha` 在 1 与 0.6 间 3 Hz 闪 1.2 s。多人锚在该座位铭牌内侧（§6）。

**座位卡（多人 L3/L2）**：同 L2 字幕的单行形态，但行首加该座位徽记（形状 + 罗马数字，槽位色），按键 2× 但文字 `body`；最大宽 220。

**音效**（新，放进 P7 的 `sfx_story.ts`，或 F4 自己的 `sfx_coach.ts`）：`coachTick`（L3 卡出现：一声很轻的木质钟摆"嗒"，−12 dB）、`beatOk`（成功：上行双音"嘀-嗒"）。过期不发声。

### 3.8 成功节拍 Beat（教练、序章、课程、排练厅共用）

```ts
Beat.success(o: { p: Player; id: string; stamp?: L10n | false; why?: string /* strings key */; whyArgs?: Record<string, string|number>; first?: string })
```
1. 印章：`w.fx.stamp(p.x, p.y − 40, stamp, 'C4', 0.9, { group: 'beat' })`（F3 修复轮的同组合并：0.4 s 内的同组印章合并成"×N"，不堆叠）。
2. 音：`beatOk`；手柄 `p.input.rumble(0.25, 0.4, 120)`。
3. 为什么：`Caption`（tier A，`key:'beat:'+slot`，2.0 s）显示 `why`；`first`（终身第一次）作为第二行 `small`。
4. 记录：`__coach.log.push({…, outcome:'success'})`，`bus.emit('custom', {id:'coach.success', player:p, data:{id}})`（课程系统可借此"认出来就打勾"）。

### 3.9 限流、淡出与抑制

**限流表**

| 规则 | 值 |
|---|---|
| D1 同座位两次提示最小间隔 | 4 s（现实） |
| 慢动作 | 间隔 ≥ 10 s；每房间 ≤ 2；终身 ≤ 6（自动模式）；`coachSlowmo` 关则永不 |
| 每房间每座位"教练提示"（D1 D4 D5 D6 D9 D10 D12） | ≤ 4；D2 D3、成功节拍与轻节拍不计 |
| 同房间提示被无视 2 次 | 本房间不再出 D1（玩家已经顾不过来，交给死亡卡） |
| 字幕轨 | 单人 1 条；多人每座位 1 条 + 共享顶轨 1 条 |
| 排队 | tier C 最多等 4 s、tier B 3 s、tier A 2 s，过期丢弃（不计"已显示"，下次还能出） |
| 房间开头 | 前 1.0 s 不出任何教练提示（楼层卡、入场） |

**淡出**：见 §3.3 等级表——满足条件即降级，降级后旧形态不再出现；`always` 下限 L2。

**抑制条件**（任一成立即不出新提示；已在屏的 tier B/C 0.2 s 淡出，tier A 保留直到结束）：
- `hintsHooks.busy()`（首领战开场/转阶段）、`Hints.hold` 期间；首领房只允许 L1 芯片与 D11。
- 场景有阻塞覆盖层（暂停、选卡、事件、对话）、`G.scenes.transitioning`、★便条在屏。
- 该座位 `p.rw`（正在回溯）、`p.state !== 'alive'`（交给 D11/D12）、`p.anchorT > 0`（交给 D7）、磁带烧毁（D7）。
- 课程进行中（`Coach.quiet(slot)`）；序章非脚本步骤；排练厅由课程控制。
- 机器人座位；`?bot=1` 且无 `?coach=`。

**`calm(p)`**（D4/D5 用）：160 px 内无敌人前摇；96 px 内无敌方子弹；`p.hp > 30% maxHp`；距上次受击 ≥ 1.5 s。

**与便条的关系**：教练把自己的忙碌并进便条节流——`const prev = hintsHooks.busy; hintsHooks.busy = () => prev() || Coach.busy();`（与 `hints.ts` 包装 `G.scenes.onSwitch` 的做法相同，不改冻结文件）。`Coach.busy()` = 任一座位 tier S 在屏。

### 3.10 第一局房 0 逐秒示例（单人、键鼠、序章已完成：`shown=1, coached=1`）

| 时刻 | 发生 | 屏幕 |
|---|---|---|
| 0.0 s | 进房 | 楼层卡 1.8 s（上方三分之一）；顶部一行目标「清空敌人 → 选择下一扇门」 |
| 1.0 s | — | 教练可工作 |
| 6.20 s | 齿轮仔撞中你 −14（顿帧 0.09） | 红色伤害数字；磁带红刻痕 |
| 6.29 s | D1：`shown<2` → 宽限 0.05 s；L3 | 慢动作 0.3×（0.9 s 现实）；**顶轨**大卡「刚挨打？按 [Q] 撤销 / 拿回 +14 生命 · 花 100 时砂 / 你会回到身后那个淡影（旧影）」+ 倒计时条；游丝光点流向旧影；旧影 `+14` 与血条斜纹脉冲 |
| 6.9 s（现实） | 玩家按 Q（轻按） | 卡片按下动画同步消失；倒带涟漪 |
| +0.25 s | 落地 | 印章「撤销！」+ 嘀嗒 + 字幕「伤撤销了 · 刚才的你变成残响再打一遍」/ 小字「这就是回溯：撤销刚才几秒」 |
| +1.1 s | 残响重演你的攻击，打中齿轮仔 | D3 排队（tier C，等节拍字幕结束）→「残响替你打中了 · 伤害白赚」 |
| +1.6 s | 残响 ◆ 就绪，齿轮仔在它 48 px 内，你在 90 px 外 | D4：字幕「残响旁有敌人：走进残响 → 爆炸」+ 箭头 » 流向残响；`armed` 标注被取代 |
| +2.4 s | 你走进残响 | 悖论系统印章「悖论！」+ 字幕「炸到了 · 残响就是你的炸弹」 |
| … | 第二次挨打 | `coached=2`、`shown=2` → 宽限 0.30 s；若玩家 0.2 s 内自己按了 → `self=1`，轻节拍「自己撤销了 · 就是这样！」，无卡 |

---

## 4. 屏幕调度 Stage：字幕轨 + 标注避让（深度，解决清晰度报告 S1 #1–#6）

> F3 修复轮正在写的 `ui/callouts.ts` 已有：术语标注一次 1 个（多人 2 个）、停留 2.5 s、最长 4 s、贴在物体背离最近玩家的一侧、虚线引线、以玩家/残响/预警为障碍；`Caption` 顶轨（`area:'top'` 下方 4 px，单条，按优先级）。**Stage 在它之上做三件事**：(1) 把字幕轨变成"可以换停靠位"的轨；(2) 把教练卡/座位卡/芯片纳入同一张障碍表；(3) 全屏注意力预算与仲裁。需要 `callouts.ts` 暴露两处（§(a) 接口请求）：`Callouts.obstacles(w)`（本帧硬/软障碍，UI 像素）与 `Caption.peek()`（完整的当前条目，供 Stage 重绘）。

### 4.1 屏幕分区（逻辑坐标 640×360）

```
单人                                                                   多人（2–4）
┌──────────────────────────────────────────────────────────────┐   ┌──────────────────────────────────────────────────────────────┐
│[铭牌 0..184 × 0..50] [顶部区 170..470 × 6..46: 连锁/目标] [钱袋 532..632]│   │[铭牌Ⅰ 6..138×6..38]  [钱袋 270..370×6..20]  [铭牌Ⅱ 502..634×6..38]│
│[术语牌 22..~360 × 52..84（前 3 间）]                          │   │ 座位Ⅰ停靠 x6 y42 →        [顶部区 170..470×24..64]   ← 座位Ⅱ停靠 │
│           顶轨 TOP：中心 x320（避开术语牌右缘），顶 y50         │   │           共享顶轨：中心 x320，顶 y68                        │
│                                                              │   │                                                              │
│                         （战斗区）                             │   │                         （战斗区）                             │
│                                                              │   │                                                              │
│           底轨 BOTTOM：中心 x320，底 y318（便条在时 x≥248）     │   │           共享底轨：中心 x320，底 y318                       │
│[便条卡 8..240 × …..326]                                       │   │ 座位Ⅲ停靠 x6 底 y318 →                    ← 座位Ⅳ停靠 底 y318 │
│[底部区 0..640 × 322..360：槽位、首领血条]                      │   │[铭牌Ⅲ 6..138×322..354]  [首领血条]  [铭牌Ⅳ 502..634×322..354]│
└──────────────────────────────────────────────────────────────┘   └──────────────────────────────────────────────────────────────┘
最后一秒面板：中心 (320,132)（约 200×52）      楼层卡（GDD §9.4 改后）：上方三分之一 1.8 s
```

**停靠位定义**

| 停靠 | 单人 | 多人 |
|---|---|---|
| `top` | 中心 x = max(320, 术语牌右缘 + 8 + w/2)，顶 y = 50（`Hud.areaRect('top')` 底 46 + 4） | 中心 x = 320，顶 y = 68（顶部区底 64 + 4） |
| `bottom` | 中心 x = 320，底 y = 318；便条卡在屏时 x 区间限制为 [248, 632] | 同左；座位Ⅲ/Ⅳ停靠在屏时让出其所在半边 |
| `seat`（多人） | — | Ⅰ 左上：左 x6 顶 y42；Ⅱ 右上：右 x634 顶 y42；Ⅲ 左下：左 x6 底 y318（便条在屏时底 = 便条顶 − 4）；Ⅳ 右下：右 x634 底 y318。最大宽 220。备选：向屏幕内侧平移 40 / 80 / 120 px |
| `pod`（芯片） | x150 y8（铭牌内） | Ⅰ：铭牌右侧 x142 y10；Ⅱ：铭牌左侧右对齐 x498；Ⅲ/Ⅳ：同理 y326 |

### 4.2 障碍表（每帧一次，UI 像素；`Stage.obstacles()` 缓存到本帧结束）

| 来源 | 形状（世界 → UI） | 硬/软 | 由谁登记 |
|---|---|---|---|
| 每只存活的手 | 精灵框 (x−8, y−26)–(x+8, y+4) 外扩 8 px | 硬 | `callouts.ts`（已有） |
| 残响（所有人的） | (x−9, y−30)–(x+9, y+4) | 硬 | `callouts.ts`（已有） |
| 悖论预告 | 圆 r+4 的外接框；线形预告的外接框 | 硬 | `Paradox.render`（P4）调 `Callouts.avoid` |
| 敌人前摇预警图形 | line：沿长度每 24 px 一个宽 = width+4 的框；circle：外接框；cone：三角外接框 | 硬 | `Enemy.teleLine/Circle/Cone`（P1/P2）调 `Callouts.avoid`（F3 修复轮注释已规划） |
| **正在前摇的敌人** | 敌人框外扩 **48 px**（清晰度报告：前摇 48 px 内不出标注） | 硬 | Stage 自己遍历 `w.enemies`（`e.wind !== null`） |
| 敌方子弹 | 距任一玩家 ≤ 96 px：子弹框 +4 → 硬；更远 → 软 | 硬/软 | Stage 遍历子弹 |
| 其他敌人（空闲） | 框 +3 | 软 | `callouts.ts`（已有） |
| 印章 | `w.fx.stampBoxes()` | 硬 | `callouts.ts`（已有） |
| 头顶拒绝原因横幅 | 横幅框 | 软 | Stage（读 `fx` 横幅列表） |
| HUD 固定区 | 铭牌、钱袋、顶部区（有内容时）、底部区、首领血条 | 硬 | Stage 常量 + `Hud.podRect/areaRect` |
| 便条卡 | `hintsHooks.bottom()` 往上卡高（`Hints.active` 时） | 硬 | Stage |
| 最后一秒面板 | 中心 (320,132) 的面板框 | 硬（tier S） | Stage（`p.down.lastSecond > 0`） |
| 楼层卡 | 卡框（显示期间） | 硬 | Stage（读 `GameScene.titleCard`，只读） |
| 已放好的教学文字 | 本帧先放的字幕/卡 | 硬 | Stage（并 `Callouts.avoidUi` 让术语标注也避开） |

### 4.3 停靠选择算法

```ts
type Box = { x0: number; y0: number; x1: number; y1: number };
type DockId = 'top' | 'bottom' | 'seat' | 'pod';
interface PlaceReq { key: string; w: number; h: number; tier: 'S' | 'A' | 'B' | 'C'; slot?: number; shared?: boolean; critical?: boolean }
interface Placed { x: number; y: number; alpha: number; dock: DockId; form: 'full' | 'chip' }

const memo = new Map<string, { idx: number; blockedT: number; since: number }>();

function place(req: PlaceReq, dtReal: number): Placed | null {
  const ob = Stage.obstacles();                         // { hard: Box[]; soft: Box[]; players: Box[] }
  const cands = candidates(req);                        // 单人/共享：[top, bottom]；座位：[seat+0, +40, +80, +120]
  const m = memo.get(req.key);
  const freeHard = (b: Box) => !ob.hard.some((o) => hit(b, o)) && !placedThisFrame.some((o) => hit(b, o));
  const freeSoft = (b: Box) => !ob.soft.some((o) => hit(b, o));
  // 1. 黏住：上一帧的位置仍不碰硬障碍 → 不动（防止跳来跳去）
  if (m && freeHard(cands[m.idx])) { m.blockedT = 0; return commit(req, m.idx, 1); }
  // 2. 迟滞：被挡不足 0.15 s 且挡住它的不是玩家 → 先不动；挡住玩家 → 立刻换
  if (m) {
    m.blockedT += dtReal;
    if (m.blockedT < 0.15 && !ob.players.some((o) => hit(cands[m.idx], o))) return commit(req, m.idx, 1);
  }
  // 3. 换位：先找"硬软都不碰"，再找"不碰硬"；换位后至少停留 1.0 s（除非又挡住玩家）
  let idx = cands.findIndex((b) => freeHard(b) && freeSoft(b));
  if (idx < 0) idx = cands.findIndex(freeHard);
  if (idx >= 0) { memo.set(req.key, { idx, blockedT: 0, since: G.time }); return commit(req, idx, 1); }
  // 4. 无处可放
  if (req.critical) return chip(req);                   // 关键提示退成铭牌芯片：铭牌是 HUD，永远可画
  return null;                                          // 非关键：排队等待（§3.9 排队时限），绝不压在动作上
}

function chip(req: PlaceReq): Placed {
  const b = podChipBox(req.slot ?? 0);
  const covered = Stage.obstacles().players.some((o) => hit(b, o));
  return { x: b.x0, y: b.y0, alpha: covered ? 0.35 : 1, dock: 'pod', form: 'chip' };
}
// commit：把放好的框推入 placedThisFrame，并 Callouts.avoidUi(...)，让术语标注下一帧也避开它；
//         换停靠时旧位置 0.1 s 淡出、新位置 0.1 s 淡入；__coach.audit 记录本帧是否与硬障碍相交。
```

- **critical** = 教练 L3/L2 的 D1、D11、D12（与"挨打/倒地"直接相关的时间敏感提示）。
- 字幕轨（F3 的 `Caption`）由 Stage 重新注册同 id 的 HUD 组件 `'caption'`（`Hud.register` 同 id 替换）后，也走 `place()`：没有空位就排队，不再固定在 y50。
- 首领房：`candidates` 去掉被首领血条占用的 `bottom` 部分；首领转阶段 4 s 内 `place()` 对 tier B/C 一律返回 null。

### 4.4 注意力预算与仲裁

**tier**

| tier | 内容 |
|---|---|
| **S** 关键 | 最后一秒面板、教练 L3 卡（D1）、★便条（单人暂停卡） |
| **A** 重要 | 教练 L2 字幕、D4/D6/D9/D12、课程指令、成功节拍的"为什么" |
| **B** 说明 | 术语标注（单人 1 / 多人 2）、D7/D8/D10、教练 L1 芯片、拒绝原因横幅 |
| **C** 点缀 | D2/D3/D5、轻节拍、多人共享术语行（S2 #9）、楼层卡、掌握提示（progressive.md §7） |

**规则**
1. 单人同一时刻：**字幕轨 1 条**（最高 tier；同 tier 先来先显示）+ **术语标注 ≤ 1** + 印章（不限，但合并）。多人：每座位 1 条 + 共享轨 1 条 + 术语标注 ≤ 2。
2. tier S 在屏时：不开始新的术语标注（已在屏的降到 50% 透明）；便条不开新卡（`hintsHooks.busy`）；楼层卡立刻 0.2 s 收起；tier B/C 字幕暂停计时。
3. ★便条（单人暂停）在屏时教练不出任何东西（世界已冻结）。
4. 便条卡（非暂停）在屏时：底轨只能用 x ≥ 248；教练 tier S 卡出现时便条卡计时暂停（它是 6 s 的知识，不是此刻的操作）。
5. 印章永不被压制（它是反馈），但它是硬障碍：字幕和标注绕开它。
6. 同一事实只说一次：D4 字幕在屏 → `armed`/`paradox` 术语标注 `supersedes`；D1 卡在屏 → `shadow` 术语标注推迟（卡片已经说了"旧影"）；成功节拍"为什么"在屏 → 同一座位的 D3 等待。

### 4.5 逐条对照清晰度报告

| 报告条目 | 问题 | 本稿解法 | 依赖 / 状态 |
|---|---|---|---|
| **S1 #1** 术语框盖住玩家/敌人/预警/悖论预告 | `drawCallouts` 只避开其他框 | 障碍表 §4.2（玩家 +8、残响、预告、预警图形、**前摇敌人 +48**、近身子弹、印章、HUD）；一次 1 个（多人 2 个）、2.5 s 轮换；背离最近玩家一侧 + 虚线引线；无空位就等待，**绝不叠画** | F3 修复轮 `callouts.ts` 已实现大部分；本稿补"前摇 +48""近身子弹""tier S 时不开新标注"，并让术语标注避开字幕/卡片（`avoidUi`） |
| **S1 #2** 教学房文字互相压 | 教练提示在玩家头顶、横幅叠地刻 | 教练与横幅全部移到可换位的字幕轨（§4.3）；旧 `RewindCoach`（`tutorial.ts`）退役，由 `CoachDirector` 取代；教学房只剩地刻（F3 #66：靠近 24 px 淡到 0.35），且地刻是软障碍、字幕在其上方绘制；第二只敌人等第一次回溯后再出（F3 #66） | 新玩家走序章，不再进旧教学房；教学房保留为 `?room=tutorial` 测试房 |
| **S1 #3** 短擦带静默回 0 还扣砂 | — | ① 闸门：教擦带前按住 = 轻按（§2.8）；② 教后 D8「退得不够远：再按久一点 → +9」；③ 擦带预览常显 `+0`（灰）与「再往回 → +9」（F3 #65） | ①需 P1 `RewindGate`；③F3 修复轮 |
| **S1 #4** 普通按键被当成擦带 | 0.18–0.3 s 的按键变成 0.1 s 微回溯 | `TAP_GRACE_BACK = 0.35`：光标退过 0.35 s 前松开仍算轻按 | **已在 F3 修复轮 `player.ts` 实现** |
| **S1 #5** 轻按的代价没有提前显示 | — | 教练卡第 2 行固定写「花 {c} 时砂」（`pv.cost`，实时）；HUD「200 (−100)」与沙漏闪烁（F3 #65）；死亡卡与暂停页都写"回溯 25–100" | F3 修复轮 + 本稿 |
| **S1 #6**（报告列 S2 #6）印章挡住爆炸、堆叠 | — | 印章同组 0.4 s 合并"×N"（F3 修复轮 `fx.stamp {group}` 已有）；连锁时只留顶部"连锁 ×N"；Beat 用 `group:'beat'`；印章是字幕/标注的硬障碍 | F3 修复轮 + 本稿 |
| S2 #7 青色斜纹无标签 | — | L3 卡出现时旧影 `+N` 与斜纹同步脉冲 0.4 s，卡片文案"拿回 +14 生命"把数字和血条连起来 | `RewindHudFx.pulse`（P1 接口请求）；退路见 §3.7 |
| S2 #9 多人没有白话 | — | 共享顶轨的 tier C 术语行（前 3 间，每间每词 1 次）；教练提示在座位角 | Stage + F3 #65 |

---

## 5. 死亡卡与"回溯本可以怎样"回放（深度）

### 5.1 采集 DeathTape（`coach/deathTape.ts`，渲染侧，不影响模拟）

- **画面环**：每 0.1 s（现实时间，10 Hz）把世界层画布 `r.w.canvas`（640×360，后处理之前）裁一块 **320×180、1:1 像素**（单人：以玩家屏幕位置为中心偏上：原点 = `(sx − 160, sy − 110)` 夹在画布内；多人：整幅 640×360 缩到 0.5×）拷进预分配的 36 张离屏画布（3.6 s 环）。像素画不缩放，回放锐利。内存约 36 × 230 KB ≈ 8 MB。
  - 拷贝时机：在 `r.worldUi(fn)` 回调里（UI 层刷新时，世界画布已画完）——风险与退路见 §(c) #3。
  - 画面里没有 UI 文字（UI 在另一层），回放的注解由我们自己画（§5.4），所以不会出现旧文字。
- **元数据环**（同 10 Hz，与画面一一对应）：
  ```ts
  interface TapeMeta {
    t: number;                 // world.time
    crop: { x: number; y: number; scale: 1 | 0.5 };
    cam: { x: number; y: number };
    hands: { slot: number; x: number; y: number; hp: number; maxHp: number; sand: number; state: string;
             shadow: { x: number; y: number; ok: boolean; gain: number; cost: number; seconds: number; spr: Sprite | null };
             reason: RewindRefusal | null; anchored: boolean; burnt: number }[];
    hits: { slot: number; amount: number; fixed: boolean; killer: string /* codexId */ }[];   // 本 0.1 s 内的 damaged
    rewinds: { slot: number; scrub: boolean; restored: number }[];
  }
  ```
  `shadow.spr` 存 `p.spriteFor(frame)` 返回的精灵**引用**（不拷贝），回放时用 `outlineOf(spr, 'C3', 'dash')` 画出真正的旧影轮廓。
- **冻结**：单人致命一击（`damaged` 后 `hp ≤ 0`）再录 0.3 s 后冻结环（保留"挨打那一下"）；若最后一秒自救成功 → 解冻继续录。多人：最后一个人停摆时冻结。新房间开始/新局开始清空。
- 开关：`settings.deathReplay === false` 时不录（死亡卡仍出原因行）。

### 5.2 判定 DeathSnap 与用例

在冻结时对**槽 I（单人）或每个座位（多人）**计算：

```ts
interface DeathSnap {
  slot: number; killer: string; killerName: L10n | null;
  best: { t: number; ago: number; gain: number; cost: number; shadowAgo: number } | null;  // 死前 3.5 s 内 gain 最大、ok 为真的一帧
  lastSecond: { offered: boolean; pressed: boolean; sand: number; gain: number } | null;
  reason: RewindRefusal | null;   // 致命时 canRewind 的拒绝原因
  lethalFixed: boolean;           // 最后 3 s 受到的伤害里定格占多数且致命一击为定格
  scrubShort: boolean;            // 死前 3.5 s 内有一次 scrub 且 restored==0，而当时 gain≥5
  repeat: number;                 // Flags('death.by.'+killer)（含本次）
}
```

**用例**（取第一个成立的作标题行；`C1` 与 `C2` 可同时成立，见"第二行"）：

| # | 条件 | 标题行（`body`，C4） | 第二行（`small`，K8） |
|---|---|---|---|
| **C2** 早该撤销 | `best && best.gain ≥ 5 && !rewound`（死前 0.3–3.5 s 内有一帧 ok 且可拿回 ≥ 5） | 你死前 {s} 秒有 +{n} 可以拿回：按 {k:rewind} | 若 C1 也成立：「倒下后那 1.5 秒按也来得及」；否则心智模型第 1 行「回溯 = 撤销刚才几秒（伤也撤销）」 |
| **C1** 最后一秒没按 | `lastSecond.offered && !pressed` | 倒下后那 1.5 秒，按 {k:rewind} 就能撤销 | 你还有 {sand} 时砂，回到 3 秒前能拿回 +{n} |
| **C3** 时砂不够 | `reason === 'sand'` | 时砂只剩 {sand}（回溯至少要 25） | 打敌人攒时砂；残响打中也算 |
| **C4** 磁带烧毁 | `reason === 'burnt'` | 磁带烧毁时不能回溯（自救后 6 秒） | 自救后先躲开，等磁带冷却 |
| **C5** 时间锚 | `anchored` | 你在时间锚里：锁链圈内不能回溯 | 先离开圈子，或打掉锚铃 |
| **C6** 紫色 | `lethalFixed` | 紫色伤害撤销不了 | 看到紫光就冲刺躲开 |
| **C7** 擦带太近 | `scrubShort` | 退得太近了：按住久一点能退更远 | 磁带上的红刻痕要退过去才算撤销 |
| **C8** 其他 | 以上都不成立 | 按敌人给针对性提示（GDD §9.6；表由 P2/P7 提供，如齿轮仔：「齿轮仔蓄力后会直冲：侧向冲刺躲开」） | 「这次来不及回溯：先拉开距离，攒点时砂」 |

- **只说真话**：所有"本可以"都来自当时采样的 `canRewind().ok` 与 `rewindPreview().hpGain`，不推测；数据不全（录像关、刚进房）→ C8。
- `{s}` = `best.ago` 取 0.5 s 步进（「2 秒」「1.5 秒」）；`{n}` = `best.gain`；`{k:rewind}` 用该座位设备图标。
- **反复死亡**：`repeat ≥ 2` 时加一行（`small`，R4）「第 {k} 次栽在{name}手里」+（`small`，B5）「去排练厅练「{lesson}」」（C1/C2 → 撤销；C3 → 残响；C6 → 紫色；C7 → 擦带；C8 → 该敌人对应课，缺省为撤销）。写 `Flags.inc('death.by.'+killer)`、`Flags.set('death.lastRun.'+killer, profile.runs)`（供 D10）。
- 等级联动：C1/C2 → §3.3"死于本可回溯"规则。

### 5.3 版式（游戏场景内；所有人停摆后 0.8 s 出现，覆盖在冻结的世界上）

> 实现为 HUD 组件 `Hud.register({id:'deathCard', area:'top', order:99})`，在 `w.players.every(Down.isOut)` 后绘制全屏卡；**不改 `game.ts` / `summary.ts`**。`game.ts` 现有逻辑在 `deathT > 2.4` 后按确认/攻击进入结算，保持不变；回放用回溯键，`game.ts` 不读它。结算第一页（P6）可选地复用同一标题行（接口请求，非必需）。

```
y 0–360 全屏 70% K0 底
y 40   「是什么让你停下」（body，R3，居中）
┌───────── 回放面板 x36..360 / y64..248（320×180 + 4 px 'dark' 边框）─────────┐   右栏 x376..612
│ 磁带回放（small K8，左上内侧）                                        │   y70  敌人精灵 2×（drawPixelArt）+ 名字（body）
│                                                                      │   y110 标题行（body C4，富文本，maxW 236，≤2 行）
│        （冻结在"该按的那一帧"：旧影虚线轮廓 + "+22"）                  │   y146 第二行（small K8，maxW 236）
│                                                                      │   y172 反复死亡行（small R4，可选）
│                                                   −2.0s（5×7 数字）  │   y188 去排练厅（small B5，可选）
└──────────────────────────────────────────────────────────────────────┘
y 268  [LB] 看回溯怎么救你          [A] 继续（deathT < 2.4 时灰显并有进度细条）
```

- 文字全部在 UI 层；标题行 12 px、附注 10 px；无 `tiny` 中文。
- 键盘玩家看到 `[Q]`（纯键盘玩家按过 L 则 `[L]`，见 §(a) 接口请求 `widgets.keyFor`），手柄 `[LB]`。
- `settings.deathReplay` 关：面板换成冻结帧的静态图 + 注解，没有"看回溯"按钮。

### 5.4 回放时间线（3.6 s，现实时间；面板内画，世界不动）

设 `f*` = `best` 那一帧（C1 无 C2 时用致命前 0.2 s 那帧），`fa` = `f*` 前 1.2 s，`fs` = 旧影所在帧（`f*` 前 `best.shadowAgo` 秒，夹在环内）。

| 时间 | 画面 | 注解（UI 层，坐标经 `crop` 与 `cam` 换算） | 声音 |
|---|---|---|---|
| 0.0–0.3 | 从静态 `f*` 淡到 `fa` | — | — |
| 0.3–1.5 | `fa → f*` 正放（10 Hz 帧） | 玩家脚下槽位色环；受击帧红框闪 0.1 s + 伤害数字；旧影：`outlineOf(shadow.spr,'C3','dash')` + `+N`（C3，随帧更新） | 受击帧 `hurt` 低音量 |
| 1.5–2.0 | 冻结 `f*` | 面板中央 2× `{k:rewind}` 按下两次；面板底部字幕「这时按 {k:rewind}」 | `rewindHold` |
| 2.0–2.6 | `f* → fs` **倒放**（3 倍速） | 以玩家为圆心的 C3 涟漪圈（扫描线、圈外降饱和 30%，面板内实现）；玩家位置沿录像退回 | 每帧 `tapeClick` |
| 2.6–3.6 | 冻结 `fs` | 玩家处缩小的 12 刻度落地环；大号 `+N`（title，C3）；印章「撤销！」；面板底部「回到 {s} 秒前 · 生命 {a}→{b}」 | `rewindLand` + `beatOk` |
| 之后 | 保持 | 再按 `{k:rewind}` 重播 | — |

- **第一次死亡**（终身）自动播放一次；之后需按键。
- 诚实性：回放只展示**发生过的画面**和"倒回旧影"——这正是回溯做的事。不伪造"撤销之后"的未来。
- 多人：面板为整幅 0.5×；每个座位的旧影与 `+N` 用槽位色；`[←][→]`（`tabL/tabR`）切换要讲解的座位。

### 5.5 与最后一秒、拉回的衔接

- 单人：最后一秒 1.5 s 本身就是"死前的最后机会"。死亡卡 C1 明确提到它，让玩家下次知道"倒下了还能按"。
- 自救成功后 6 s 内再死 → C4（磁带烧毁），并在 D11 成功节拍里已经预告过"先躲开"。
- 多人：某座位死前 3 s 内队友在 200 px 内、时砂 ≥ 100 却没拉回 → 该座位第二行改为「队友当时能拉回你：靠近按住 {k:rewind}」（教的是队友，所以显示在**队友**那一行的第二行：「Ⅰ 倒下时，你靠近按住 {k:rewind} 能拉回」）。

### 5.6 多人死亡卡

- 回放面板（整幅 0.5×）+ 右栏每个座位一行：徽记 + 标题行（`small`，富文本，按该座位设备）。按 `tabL/tabR` 选中某座位 → 面板注解只画该座位并显示他的完整两行。
- 任何人按确认都继续（与 `game.ts` 现有规则一致）。

---

## 6. 多人（深度：教练部分）

| 项 | 规则 |
|---|---|
| 座位状态 | 每座位一份 `SeatCoach`；槽 I = 存档（`Flags`）；Ⅱ–Ⅳ = 会话（加入时 L2，降级阈值 2/3/4） |
| 提示位置 | 该座位的 `seat` 停靠位（§4.1），左侧 3 px 槽位色条 + 行首徽记；按键图标 = `p.input`（他自己的设备与绑定，分体键盘看到自己的键） |
| 慢动作 | 不改全局时间；L3 → `world.bubbles.push({x:p.x, y:p.y, r:72, scale:0.4, dur:0.6, owner:p})`，只减慢他身边的敌人与子弹；不影响其他玩家 |
| 互不阻挡 | 教练从不暂停；★便条在多人本来不暂停（`hints.ts`）；座位停靠只在各自的角；共享顶轨只放共享信息（S2 #9 术语行） |
| 同时提示 | 4 个座位可同时各有 1 条；共享轨 1 条；术语标注 ≤ 2 |
| D12 拉回 | §3.6 |
| 新加入的客人 | 加入横幅（`joinPanel.SlotBanners`）后，若该座位 30 s 内第一次可撤销受击 → L2 字幕（即使槽 I 是 L0） |
| 合拍、二重奏 | 不由教练提示（属于 GDD §9.7"两根针"卡与排练厅多人课）；成功时 Beat 的"为什么"可给一次：二重奏「碰队友的残响 · 更大的爆炸」（即 `duet` 白话） |
| 死亡卡 | §5.6 |

---

## 7. 设置与跳过（深度：教练部分）

| 设置（`settings.ts`，P7） | 选项 | 默认 | 菜单提示（`hint`） |
|---|---|---|---|
| `coach` 教练提示 / Coach prompts | 自动 / 总是 / 关闭 | 自动 | 挨打时提示回溯按键。自动：学会后淡出，忘了再出现。 / Shows the rewind button when you get hit. Auto: fades once you've got it, returns if you forget. |
| `coachSlowmo` 教练慢动作 / Coach slow-motion | 开 / 关 | 开 | 头几次提示时让时间稍慢。 / Time slows briefly the first few times a prompt appears. |
| `deathReplay` 死亡回放 / Death replay | 开 / 关 | 开 | 倒下时回放最后 3 秒，看回溯本可以怎么救你。 / Replays your last 3 seconds to show how a rewind could have saved you. |
| 暂停菜单「我会玩了（跳过教学）」 | 确认：「关闭教练和课程？可在设置里恢复」 | — | 核心与分岔/擦带打勾；`coach.lvl = 0`；之后只有死于"本可回溯"连续两局才回到 L1 芯片 |
| 设置「重置教学进度」 | 确认：「重新从头教？进度和奖励不受影响」 | — | 清 `Teach` 中教学项、`Flags coach.*`、`hints`（只清教学类）；碎片/外观不收回 |

- 设置列表实际在 `pause.ts` 的 `SettingsPanel`（P4 拥有）→ 接口请求加三项；`settings.ts`（P7）加字段与 `sanitize`。
- URL 覆盖（本次会话，不存档）：`?coach=auto|always|off|L3|L2|L1|L0`；`?coachslow=0`；`?deathreplay=0`。

---

## 8. 文案总表（`src/game/strings/coach.ts`，`registerStrings('coach', {...})`）

> `{k:x}` = 设备按键图标；`{n}` 生命；`{c}` 时砂代价；`{s}` 秒；`{sand}` 当前时砂；`{name}` 敌人名；`{r}` 座位徽记；`{lesson}` 课名；`{a}{b}` 生命前后。中文行均 ≤ 18 字（不含令牌/数字）。

| key | zh | en |
|---|---|---|
| `model1` | 回溯 = 撤销刚才几秒（伤也撤销） | Rewind = undo the last few seconds (damage too) |
| `model2` | 刚才的你变成残响，把刚才的动作再做一遍 | The you from then becomes an Echo and does it all again |
| `why.undo` | 刚挨打？回溯就撤销 | Just got hit? Rewind undoes it |
| `why.echo` | 残响再打一遍 · 伤害白赚 | Your Echo hits again · free damage |
| `why.paradox` | 碰到自己的残响 → 爆炸 | Touch your own Echo → explosion |
| `hit.title` | 刚挨打？按 {k:rewind} 撤销 | Just hit? Press {k:rewind} to undo |
| `hit.sub` | 拿回 +{n} 生命 · 花 {c} 时砂 | Get +{n} back · costs {c} Sand |
| `hit.subFirst` | 你会回到身后那个淡影（旧影） | You jump back to the faint figure (your Shadow) |
| `hit.still` | 还来得及：{k:rewind} 撤销 +{n} | Still time: {k:rewind} undo +{n} |
| `hit.light` | {k:rewind} 撤销这一下 +{n} | {k:rewind} undo that hit +{n} |
| `hit.chip` | {k:rewind} +{n} | {k:rewind} +{n} |
| `hit.ok.stamp` | 撤销！ | UNDONE! |
| `hit.ok.why` | 伤撤销了 · 刚才的你变成残响再打一遍 | Hit undone · the you from then is now an Echo |
| `hit.ok.first` | 这就是回溯：撤销刚才几秒 | That's rewind: undo the last few seconds |
| `self.ok` | 自己撤销了 · 就是这样！ | You undid it yourself — that's it! |
| `hit.expired` | 那一下已过 {s} 秒，撤销不了了 | That hit is {s}s old — too late to undo |
| `echo.free` | 残响替你打中了 · 伤害白赚 | Your Echo landed a hit · free damage |
| `paradox.nudge` | 残响旁有敌人：走进残响 → 爆炸 | Enemies by your Echo: walk into it → boom |
| `paradox.nudgeFirst` | 走进自己的残响 → 爆炸（悖论） | Walk into your own Echo → explosion (Paradox) |
| `paradox.nudgeStand` | 残响快碎了，现在走进去！ | Your Echo is fading — walk in now! |
| `paradox.ok.why` | 炸到了 · 残响就是你的炸弹 | Got them · your Echo is your bomb |
| `paradox.missed` | 下次 ◆ 亮了就走进残响 | Next time the ◆ lights, walk into your Echo |
| `sand.full.fork` | 时砂满了：按 {k:fork} 分岔，留个帮手 | Sand is full: {k:fork} Fork to leave a helper |
| `sand.full.tap` | 时砂满了，再攒就浪费：大胆用 {k:rewind} | Sand is full, extra is wasted: use {k:rewind} |
| `sand.low` | 时砂不够（{n}/25）：打敌人就能攒 | Not enough Sand ({n}/25): hit enemies to earn it |
| `sand.short` | 时砂只够退 {s} 秒，够不到那一下 | Sand only reaches {s}s back — not that far |
| `fixed.once` | 紫色伤害撤销不了：躲开它 | Violet damage can't be undone: dodge it |
| `refuse.sand` | 打敌人攒时砂，残响打中也算 | Hit enemies for Sand — Echo hits count |
| `refuse.tape` | 刚进门或刚回溯，磁带还短 | Just entered or rewound: the tape is short |
| `refuse.anchor` | 离开锁链圈，或打掉锚铃 | Leave the chains, or break the anchor bell |
| `refuse.burnt` | 自救烧了磁带：{s} 秒后恢复 | Self-rescue burnt the tape: back in {s}s |
| `scrub.short` | 退得不够远：再按久一点 → +{n} | Not far enough: hold longer → +{n} |
| `gate.fork` | 这是 {k:fork} 分岔：原地留个残响（−50） | That's {k:fork} Fork: leave an Echo here (−50) |
| `gate.fork2` | 再按一次就用 · 清场后详细教你 | Press again to use it · lesson after this room |
| `gate.hold` | 按住暂时等于轻按 · 擦带稍后教你 | Holding works as a tap for now · Scrub comes later |
| `repeat.killer` | 上次栽在{name}手里：挨打就按 {k:rewind} | {name} got you last time: if it hits, {k:rewind} |
| `last.note` | 倒下了也能回溯：撤销刚才几秒 | Even down, you can rewind: undo the last seconds |
| `last.ok.stamp` | 自救！ | SAVED! |
| `last.ok` | 自救！磁带烧毁 6 秒，先躲开 | Saved! Tape burnt for 6s — stay clear |
| `pull.near` | {r} 倒了：靠近，按住 {k:rewind} 拉回 | {r} is down: get close, hold {k:rewind} |
| `pull.ok.stamp` | 拉回来了 | PULLED BACK |
| `pull.ok.why` | 拉回来了 · 他回到 3 秒前 | Pulled back · they're 3s back in time |
| `dc.title` | 是什么让你停下 | What stopped you |
| `dc.tape` | 磁带回放 | Tape replay |
| `dc.replay` | {k:rewind} 看回溯怎么救你 | {k:rewind} See how rewind could save you |
| `dc.continue` | {k:confirm} 继续 | {k:confirm} Continue |
| `dc.pressHere` | 这时按 {k:rewind} | Press {k:rewind} here |
| `dc.landed` | 回到 {s} 秒前 · 生命 {a}→{b} | Back {s}s · health {a}→{b} |
| `dc.c2` | 你死前 {s} 秒有 +{n} 可以拿回：按 {k:rewind} | {s}s before the end, +{n} was yours to take back: {k:rewind} |
| `dc.c2b` | 倒下后那 1.5 秒按也来得及 | Pressing in that last 1.5s would have worked too |
| `dc.c1` | 倒下后那 1.5 秒，按 {k:rewind} 就能撤销 | In that last 1.5s, {k:rewind} would have undone it |
| `dc.c1b` | 你还有 {sand} 时砂，回到 3 秒前能拿回 +{n} | You had {sand} Sand: going back 3s gave +{n} |
| `dc.c3` | 时砂只剩 {sand}（回溯至少要 25） | Only {sand} Sand left (a rewind needs 25) |
| `dc.c3b` | 打敌人攒时砂；残响打中也算 | Hit enemies to earn Sand — Echo hits count |
| `dc.c4` | 磁带烧毁时不能回溯（自救后 6 秒） | A burnt tape can't rewind (6s after a self-rescue) |
| `dc.c4b` | 自救后先躲开，等磁带冷却 | After a self-rescue, keep clear until it cools |
| `dc.c5` | 你在时间锚里：锁链圈内不能回溯 | You were in a time anchor: no rewinds in the chains |
| `dc.c5b` | 先离开圈子，或打掉锚铃 | Step out, or break its bell first |
| `dc.c6` | 紫色伤害撤销不了 | Violet damage can't be undone |
| `dc.c6b` | 看到紫光就冲刺躲开 | See violet? Dash out of it |
| `dc.c7` | 退得太近了：按住久一点能退更远 | Not far enough back: hold longer to go further |
| `dc.c7b` | 磁带上的红刻痕要退过去才算撤销 | Rewind past the red notch to undo that hit |
| `dc.c8b` | 这次来不及回溯：先拉开距离，攒点时砂 | No time to rewind: make space, build Sand |
| `dc.repeat` | 第 {k} 次栽在{name}手里 | {name} has stopped you {k} times |
| `dc.practice` | 去排练厅练「{lesson}」 | Practice "{lesson}" in the Rehearsal Hall |
| `dc.pullMate` | {r} 倒下时，你靠近按住 {k:rewind} 能拉回 | When {r} fell, getting close and holding {k:rewind} would pull them back |
| `set.coach` | 教练提示 | Coach prompts |
| `set.coachHint` | 挨打时提示回溯按键。自动：学会后淡出，忘了再出现。 | Shows the rewind button when you get hit. Auto: fades once you've got it, returns if you forget. |
| `set.slowmo` | 教练慢动作 | Coach slow-motion |
| `set.slowmoHint` | 头几次提示时让时间稍慢。 | Time slows briefly the first few times a prompt appears. |
| `set.replay` | 死亡回放 | Death replay |
| `set.replayHint` | 倒下时回放最后 3 秒，看回溯本可以怎么救你。 | Replays your last 3 seconds to show how a rewind could have saved you. |
| `pause.know` | 我会玩了（跳过教学） | I know how to play (skip lessons) |
| `pause.knowConfirm` | 关闭教练和课程？可在设置里恢复 | Turn off the coach and lessons? You can undo this in Settings. |
| `set.reset` | 重置教学进度 | Reset tutorial progress |
| `set.resetConfirm` | 重新从头教？进度和奖励不受影响 | Start the lessons over? Progress and rewards stay. |

术语（`defineTerm`，若 F3 修复轮已定义则复用）：`scrub` 擦带 Scrub — plain「按住回溯 · 自己选退多远」/「Hold rewind · pick how far back」；`perfect` 完美回溯 — plain「躲过一击 · 时砂全额返还」/「Dodged a hit · Sand refunded」（与 progressive.md 相同）。其余术语（时砂/磁带/旧影/残响/悖论/分岔/元凶/定格伤害）沿用 `strings.ts` 的 `TERMS`，**不改名**。

---

## (a) 模块 / 文件计划

> F4（回溯教学）在 PLAN2 里没有现成的包。建议主程把 F4 设为 F3 之后、生产包之前的一个基础小包（或并入 P7）。下表"归属"按 PLAN §3。

### 新建（F4 拥有）

| 文件 | 内容 |
|---|---|
| `src/game/coach/coach.ts` | `CoachDirector`（每房间实体，`GameHooks.onRoomStart` 加入）、`SeatCoach`、`Opportunity`、等级规则、`Coach.{mode, busy, quiet, seat, force}`；包装 `hintsHooks.busy` |
| `src/game/coach/detectors.ts` | D1–D12（每个一个对象：`{id, on?: {busEvent: fn}, poll?: fn}`） |
| `src/game/coach/stage.ts` | 障碍表、停靠选择（§4.3）、注意力预算（§4.4）、`Stage.audit`；重新注册 HUD 组件 `'caption'`（同 id 替换，走 `place()`） |
| `src/game/coach/card.ts` | `richLine/measureRich`（`{k:action}` 令牌）、`bigPrompt`（2× 缓存）、L3 卡 / L2 字幕 / L1 芯片 / 座位卡绘制；`Hud.register({id:'coach'})` |
| `src/game/coach/beat.ts` | `Beat.success`（印章 + 音 + 震动 + 为什么 + `custom coach.success`） |
| `src/game/coach/deathTape.ts` | 画面环 + 元数据环、冻结/解冻 |
| `src/game/coach/deathCard.ts` | `DeathSnap` 判定、HUD 组件 `'deathCard'`、回放播放器 |
| `src/game/coach/gates.ts` | `RewindGate.tapOnly(p)` 与 `ForkGate.allow(p)` 的教练实现（注册进 P1 提供的钩子） |
| `src/game/coach/debug.ts` | 路由 `coach` `coachdet` `drill=death` `glyphs`、`window.__coach` |
| `src/game/strings/coach.ts` | §8 全部文案 + `defineTerm('scrub'|'perfect')`（若未定义） |
| `src/audio/sfx_coach.ts` | `coachTick` `beatOk`（若并入 P7，则写进 `sfx_story.ts`） |
| `tools/scripts/coach_*.json`、`tools/scripts/blind_*.json`、`tools/coachaudit.cjs` | §(b) |

### 修改现有文件（全部走"接口请求"，各自只加一个钩子或一行）

| 文件 | 归属 | 改什么 |
|---|---|---|
| `src/game/ui/callouts.ts` | F3 修复轮（之后随 `ui/*` 冻结） | 导出 `Callouts.obstacles(w)`；导出 `Caption.peek()`；前摇敌人 +48 px 记为硬障碍；`Coach.busy()` 为真时不开始新标注 |
| `src/game/entities/player.ts` | P1 | `refuse()/refuseFork()` 发 `custom rewindRefused/forkRefused`；`settings.rewindMode === 'tap'` 两处改读 `RewindGate.tapOnly(this)`（默认实现 = 原逻辑）；`fork()` 开头 `if (!ForkGate.allow(this)) return false;`（默认 true） |
| `src/game/ui/rewindHud.ts` | P1 | `RewindHudFx.pulse(p, sec)`：旧影 `+N` 与 HP 斜纹同步脉冲 |
| `src/game/entities/enemy.ts` | P1 | `teleLine/teleCircle/teleCone` 调 `Callouts.avoid`（F3 修复轮已规划） |
| `src/game/systems/paradox.ts` | P4 | `Paradox.render` 对预告圈/线调 `Callouts.avoid` |
| `src/game/ui/pause.ts` | P4 | 暂停菜单加「回溯怎么用」「我会玩了」；`SettingsPanel` 加三项 |
| `src/game/settings.ts` | P7 | 字段 `coach` `coachSlowmo` `deathReplay` + `sanitize` |
| `src/game/rooms/tutorial.ts` | P7 | 删除 `RewindCoach`（由 `CoachDirector` 取代）；地刻保留（F3 #66 的淡化） |
| `src/game/ui/widgets.ts` + `src/engine/input.ts` | 冻结（主程） | `keyFor` 选"该动作最近一次实际按下的键"（纯键盘玩家看到 L/J/I）；可选 `drawPrompt(..., {scale})` |
| `src/game/strings/f2.ts` | 冻结（主程） | `lastSecondHint` 改为「撤销刚才几秒 / Undo the last seconds」 |
| `src/game/scenes/summary.ts` | P6 | （可选）结算第一页复用死亡卡标题行 |
| `src/game/qa/bot.ts` | P1 | 无需改：教练对机器人座位不出提示 |
| `src/game/scenes/game.ts` `src/game/systems/downed.ts` `src/game/ui/hints.ts` | P2 / 冻结 / 冻结 | **不改** |

---

## (b) 盲测测试计划

### 调试路由（`coach/debug.ts` 注册）

| 路由 | 作用 |
|---|---|
| `?coach=auto\|always\|off\|L3\|L2\|L1\|L0` | 本次会话覆盖教练模式/等级（不存档）；`L3` 同时把 `shown/self/coached/slowmos` 归零 |
| `?coachslow=0` / `?deathreplay=0` | 关慢动作 / 关回放 |
| `?coachdet=<id>` | 房间第 1 s 强制触发一个检测器（`hit` `echoIgnored` `sandFull` `sandLow` `scrubShort` `untaught` `repeatKiller` `pullBack`），用于单张截图 |
| `?glyphs=pad\|kbm\|kb` | 强制按键图标族（`pad` = 每帧 `G.input.lastDevice = 'pad'`；`kb` = 视为纯键盘，显示第二绑定） |
| `?drill=death&case=c1\|c2\|c3\|c4\|c5\|c6\|c7\|c8&seed=2` | 用真实局 + 脚本伤害制造对应死法，走到死亡卡（回放用真实录像） |
| `?room=tutorial` | 旧教学房（地刻 + 新教练），回归用 |

### `window.__coach`（也挂到 `window.__tut.coach`，供序章/课程脚本统一使用）

```ts
__coach = {
  level(slot = 0): 'L3' | 'L2' | 'L1' | 'L0';
  state(slot = 0): { lvl, self, coached, ignored, missed, slowmos, shown, rate10 };
  visible(slot = 0): { id: string; form: 'card' | 'caption' | 'chip'; dock: DockId; text: string; rect: [x, y, w, h]; alpha: number; glyph: string /* 'Q' | 'L' | 'LB' … */ } | null;
  log: { t: number; slot: number; det: string; form: string; dock: string; text: string; glyph: string; outcome?: 'self' | 'coached' | 'expired' | 'success' | 'dropped' }[];
  audit(): { frames: number; overlapFrames: number; worst: { key: string; with: string } | null };   // 教学文字/卡/标注 ∩ 硬障碍
  force(det: string, slot?: number): void;
  setLevel(slot: number, lvl: 0 | 1 | 2 | 3): void;
  death(): DeathSnap[] | null;
  replay(): { playing: boolean; t: number; frame: number } | null;
};
```

### 截图脚本（`node tools/shot.cjs "<query>" tools/out/F4/coach/<name>.png 2500 1280 720 tools/scripts/<name>.json`；每个脚本第 0 步注入 `__rw` 同款辅助库，按模拟时间等待，`freeze()` 后截图）

| 脚本 | URL | 步骤与截图 | eval 判定 |
|---|---|---|---|
| `coach_hit_kbm.json` | `seed=2&floor=0&spawn=cogling&lang=zh&coach=L3` | 01 开局 → 脚本受击 14 → 02 L3 卡（冻结在慢动作中）→ 按 Q → 03 落地印章「撤销！」+ 为什么 → 04 残响打中（D3 字幕） | `visible().form==='card' && dock==='top' && glyph==='Q'`；`audit().overlapFrames===0`；`log` 末项 `outcome==='success'` |
| `coach_hit_pad.json` | 同上 `&glyphs=pad` | 同 01–03 | `glyph==='LB'` |
| `coach_hit_kb.json` | 同上 `&glyphs=kb` | 先按 L 回溯一次，再受击 → 卡 | `glyph==='L'` |
| `coach_hit_en.json` | 同上 `&lang=en` | 02 卡（英文宽度） | 卡宽 ≤ 360、两行内 |
| `coach_fade.json` | `…&coach=L3` | 连续 6 次"受击后 0.1 s 内按 Q" → 截 L2 字幕（第 3 次后）、L1 芯片（第 5 次后）、无提示（第 7 次） | `level()` 依次为 L2 / L1 / L0 |
| `coach_miss.json` | `…&coach=L2` | 受击不按 → 字幕倒计时 → 过期字幕「那一下已过 3 秒」→ 同房间再错过一次 → 下一次受击出 L3 卡 | `state().ignored===2`；第三次 `visible().form==='card'` |
| `coach_echo.json` | `…&spawn=cogling&coach=L3` | 定住敌人（`__rw.pin`）→ 受击 → 回溯 → 残响就绪 → D4 字幕 + 箭头 → 走进 → 悖论 + 为什么 | `log` 含 `echoIgnored` 与 `success` |
| `coach_sand.json` | `…&coachdet=sandFull` 与 `coachdet=sandLow` | 两张字幕 | 文案键正确 |
| `coach_gate.json` | `…&coach=L3`（新档） | 按 R → 软闸门字幕、时砂不变 → 3 s 内再按 → 分岔发生；按住 Q 1 s → 轻按 + `gate.hold` 字幕 | 第一次后 `sand` 不变；第二次后残响数 +1 |
| `coach_dock.json` | `…&coach=L3` | 把玩家放到顶轨下方（`p.y` 设到屏幕 y≈70）→ 受击 → 卡在**底轨**；再在底部放一个前摇敌人 → 卡退成**芯片** | `dock==='bottom'`，然后 `dock==='pod'`；全程 `overlapFrames===0` |
| `coach_coop2.json` | `players=2&seed=2&floor=0&spawn=cogling&coach=L3&coachbots=1` | 座位Ⅰ受击 → 左上座位卡；座位Ⅱ（`coachbots=1` 时把机器人当真人）受击 → 右上座位卡；Ⅱ 停摆 → Ⅰ 出 D12 | 两个 `visible(slot)` 同时非空且矩形不相交 |
| `death_cases.json` | `drill=death&case=c2&lang=zh`（另跑 c1…c8） | 死亡卡静态 → 按 Q → 回放 0.5 / 1.6 / 2.3 / 3.1 s 四张 | `death()[0]` 用例匹配；`replay().playing` |

`tools/coachaudit.cjs`：对上表每个脚本跑完后读取 `__coach.audit()`，任何 `overlapFrames > 0` 即失败，并输出 `worst`。同时检查控制台 `[text] CJK in tiny` 为 0。

### 盲测代理（新档、只看截图）

- 脚本 `tools/scripts/blind_prologue.json`（`?scene=prologue&lang=zh`，每步截 2 张：示范中、成功后）与 `tools/scripts/blind_floor1.json`（序章结束 → 工坊截 2 张 → 开局 → 第 1 层逐房截图：每次教练提示出现时截一张（`await R.until(() => __coach.visible())`）、按下后截一张、每次课程示范/成功截一张、死亡则截死亡卡与回放 4 张）。按键用真实键盘事件（脚本模拟一个"会照提示按键"的玩家：提示出现后 0.4 s 按下提示上的键；第二局起改为"有一半时间不按"以产生错过与死亡卡）。
- 另跑一份 `&glyphs=pad` 的第 1 层，检查图标全部为手柄图标。
- **通过标准（教练视角）**：代理的自述里正确说出 ① 挨打后 3 秒内按回溯键能撤销伤害、会回到身后的淡影（旧影）、要花时砂；② 残响会把刚才的动作再做一遍、打中的伤害白赚；③ ◆ 亮了走进残响会爆炸（悖论）；④ 按住回溯能自己选退多远（擦带）；⑤ 分岔键不移动、原地留一个残响、花 50；⑥ 用自己的话解释时砂/磁带/旧影/残响/悖论；⑦ 说出"死亡卡告诉我当时能按什么"。自动部分：全部脚本 `overlapFrames === 0`、无 `tiny` 中文、每条提示的 `glyph` 与设备一致。

---

## (c) 五大风险与对策

| # | 风险 | 后果 | 对策 / 去风险 |
|---|---|---|---|
| 1 | **慢动作 + 大卡被嫌"啰嗦/幼稚"**，或打断节奏 | 有经验的玩家关掉一切；新玩家觉得被说教 | 只在刚挨打后（本已被打断）、只在 L3、终身 ≤ 6 次、自己撤销 2 次就降级；首启「我会玩了」、设置可关慢动作；指标 `__coach.log` 的"提示后按下率"——第 1 局 < 50% 说明提示没被看懂（改文案），> 90% 且平均反应 < 0.3 s 说明可以更早淡出（调阈值）。盲测与真人试玩各一轮后再定常数 |
| 2 | **停靠算法在拥挤房间无处可放 / 来回跳** | 关键提示看不见，或闪烁 | 0.15 s 迟滞 + 1.0 s 最短停留；关键提示有永远可画的铭牌芯片退路；首领房只允许芯片；`coachaudit.cjs` 在 dock/coop/boss 三类脚本上自动核对"零覆盖"；四人局（`players=4&bot=1&coach=L3&coachbots=1`）跑 180 s 统计 `dropped` 比例 < 20% |
| 3 | **死亡回放采集**：世界画布在 UI 刷新时可能已被清空/未合成光照；10 Hz 拷贝的性能与 8 MB 内存 | 回放黑屏或与玩家所见差别大；低端机掉帧 | 先做一个 1 天的探针：在 `r.worldUi` 回调里拷 `r.w.canvas` 并截图对比；若不可用，改为 HUD 组件 `draw` 里拷（同样在世界之后），再不行请主程在 `renderer.ts` 加 `r.onWorldDone(cb)`（冻结文件，接口请求）；光照差异可接受（"录像带"质感），面板加扫描线统一观感；`deathReplay` 开关 + 低端机（帧时间 > 20 ms 持续 5 s）自动降到 5 Hz；失败时退回静态帧 + 注解 |
| 4 | **"本可以救你"判断错**（其实时砂不够、在锚里、旧影在坑上、紫色伤害） | 死亡卡说谎，玩家不再信任提示 | 只用当时采样的 `canRewind().ok` 与 `rewindPreview().hpGain`（F3 的真实接口，已考虑坑、锚、烧毁、定格），不推断；数据不全退 C8；`?drill=death&case=…` 8 个用例各有 eval；第二行措辞保守（"能拿回 +N"而不是"你就不会死"） |
| 5 | **与其他包/其他草案冲突**：F3 修复轮正在改 `callouts.ts`（`Caption`）；P1/P4/P6/P7 文件里需要钩子；`progressive.md` 的 `LessonDirector` 也想管字幕与"安静时刻" | 合并冲突、两个"教练"互相抢屏 | 所有改动收敛为**带空默认实现的钩子**（`RewindGate` `ForkGate` `RewindHudFx` `Callouts.obstacles` `Caption.peek` `custom rewindRefused`），没有 F4 时游戏行为完全不变；`Stage` 是全屏唯一的教学文字调度者，课程/掌握提示/教练都向它申请位置；综合稿统一：`LessonDirector` 管"安静时刻的课"，`CoachDirector` 管"战斗中的提醒"，课程进行中 `Coach.quiet(slot)`；文案键名两稿对齐（`model1/model2/why.*` 相同） |
