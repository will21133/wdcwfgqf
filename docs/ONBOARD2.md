# 《秒针 2：十二响》回溯教学与新手引导 2.0 (ONBOARD2)

> 版本 1.0 · 设计总监综合稿 · 工作包 **F4 · 回溯教学与新手引导**（`docs/PLAN2.md` §2 F4）。
> 本文档是 2.0 新手引导的**唯一权威设计**。它取代 `docs/GDD2.md` 的 §9.1（序章 8 步表）、§9.5（排练厅）、§9.6（死亡卡）中与本文冲突的部分，并细化 §9.2、§9.4、§9.7、§9.8。GDD2 其余章节（尤其 §3 回溯 2.0 的数值）不变，除非 §10.2 明确列出改动。
> 来源：三份设计草案 `docs/onboard2_drafts/show-then-do.md`（示范优先，下称 **A 稿**）、`progressive.md`（渐进掌握，**B 稿**）、`coaching.md`（即时教练，**C 稿**）；盲测报告 `f3_clarity.md`（下称**清晰度报告**，S1/S2/S3 编号沿用）与其截图 `tools/out/F3/ux/*`、`tools/out/F3/{zh,rw}_*`；当前代码（F3 修复轮进行中的工作树）。
> 写法约定：坐标为 640×360 逻辑像素；"UI 层"= 设备分辨率 UI 画布（F1）；`{@rewind}` 是按键令牌，画成**该玩家当前设备**的按键图标（§1.7）；中文每行 ≤ 18 个汉字（不含令牌与数字）；所有文案 `{zh, en}`。

---

## 裁决一览（给主程与客户的 20 条）

1. **一句话**：「回溯 = 撤销刚才几秒（伤也撤销），刚才的你变成残响，把刚才的动作再做一遍」。全游戏只用这一种说法，每一课的成功句都回扣它（§1）。
2. **先看、再做、再盖章**：每节核心课 = 示范（你自己的表针被脚本驾驶，粉笔白虚线描边，头顶 2× 按键图标随按下动画）→ 你来做 → 成功节拍（字幕轨上的印章 + 音 + 一句"为什么有用"）。示范随时按 `{@info}` 重看（§2、§3）。
3. **示范木偶 = 自动驾驶玩家本人**（A 稿），不做离屏小世界（B 稿 Vignette 需要改冻结的渲染器，风险最高）。暂停页与排练厅幕布上的小循环用**关键帧小舞台 LoopPlayer**（真实精灵、真实画法，不跑战斗代码）（§3、§7）。
4. **序章改为 6 课约 4 分 40 秒**：走 → 打+冲 → **撤销** → **残响** → **悖论** → 小考。擦带、分岔、同步、紫色、卡秒命名移出序章（改 GDD2 §9.1）（§2）。
5. **第一局只用核心动词战斗**；分岔在第 1 间清场后、擦带在第 2 间清场后各上一节 ≈25 秒的"清场课"，一次一个（调和非协商项 4 与 10）（§5.6）。
6. **未教之前**：擦带**禁用**（按住 = 轻按）；分岔**先解释再给用**（每间房第一次按只解释、不扣时砂，3 秒内再按照常分岔）；其余被动规则（同步、卡秒、完美回溯、连锁、穿越）**照常生效、只是不宣传**；元凶标记在第 2 局教之前**不画**（+50% 照常）（§5.3）。
7. **即时教练四级自适应**（C 稿）：L3 慢动作 0.3×·0.9 s + 大卡「刚挨打？按 {@rewind} 撤销」→ L2 一行字幕 → L1 铭牌芯片 → L0 关。自己撤销 2/4/6 次各降一级；同房间错过 2 次临时升一级；死于"本可回溯"下一局至少 L2（§6）。
8. **慢动作只发生在受击后的无敌时间内**，教练永远不会害死玩家；终身最多 6 次，可关（§6.7）。
9. **屏幕只有一个教学文字调度者 Stage**（C 稿算法 + A 稿聚光圈）：教学文字只能落在 4 种停靠位（顶轨 / 底轨 / 座位角 / 铭牌芯片），每帧避开玩家 +8 px、残响、悖论预告、前摇敌人 +48 px、预警图形、近身子弹、印章；世界里只画细圈和虚线引线，不画盒子（§4）。
10. **注意力预算**：单人同一时刻最多 1 条教学字幕 + 1 个术语标注；关键卡在屏时不开新标注、便条排队、楼层卡收起（§4.6）。
11. **暂停页「回溯怎么用」**：6 个真实精灵小循环（撤销 / 残响 / 悖论 / 按住选落点 / 分岔 / 时砂与磁带），网格 + 放大两种视图，按键图标跟随打开者的设备（§7）。
12. **排练厅第一次进工坊就开放**（B 稿布局，不改 `hub.ts`），课程板 ✓ 学会 / ★ 掌握，每课 = 示范 → 时砂补满的练习 → 奖励；★ 即 GDD2 §9.5 的 8 个训练（§8）。
13. **死亡卡在倒下那一刻出现**（游戏场景内），一句实话（「你死前 2 秒有 +22 可以拿回：按 {@rewind}」）+ 按 `{@rewind}` 播放的"磁带回放"——用录下的真实位置与数字重画，冻结在该按的那一帧、倒放回旧影（§9）。
14. **掌握提示**（回应"难以刻意打出组合"）：第 2 局起，检测到"现在正好能打出你学过但还没用过的 X"时给一行提示，每间 ≤1、每局 ≤3、冷却 45 s（§6.10）。
15. **跳过**：首次启动「第一次玩？」二选一；设置「引导 完整/精简/关闭」「教练提示 自动/总是/关闭」；暂停「我会玩了」；每节清场课走进门即"稍后再学"（§5.10）。
16. **存档结构不改**：学会 = `Teach`（`profile.taught[]`），次数 = `Stats('did.*')`，教练与推迟 = `Flags`（§5.9）。
17. **纯键盘玩家看到 L/I/J 而不是 Q/R/左键**：F4a 在冻结的 `input.ts`/`widgets.ts` 加"该动作最近一次实际按下的键"（§1.7）。
18. **改变 GDD2 数值或行为的 12 项**已在本文裁决（轻按判定、序章 6 课、紫色、分岔/擦带改在清场课教、未教闸门、元凶显示、旧影标注时长、死亡卡位置、排练厅奖励、首启卡、教练慢动作、L5 训练轮），见 §10.2。
19. **F4 = 基础阶段第 4 个包**，v2-F3 之后、生产包之前；两名实现者 **F4a（核心：字幕舞台、示范、课程、序章、闸门、清场课）/ F4b（教练、死亡卡、暂停页、排练厅、阶梯后段、菜单与工具）**，文件归属互不相交（§11）。
20. **可测**：`window.__tut`、14 条调试路由、`tools/scripts/onboard/*.json` 共 21 个脚本、零遮挡审计、盲测代理只凭自己边玩边截的图答 10 题，Q1–Q8 必须全对（§12）。

---

## 0. 用户反馈与目标

### 0.1 客户原话

| 时间 | 原话 | 我们的理解 |
|---|---|---|
| 本轮 | 「反馈一点，玩不明白，需要多点教程，整个回溯机制不知道怎么用」 | 缺的不是说明文字，而是**会用**：什么时候按、按哪个、按了会怎样 |
| 1.0 后 | 「回溯机制不是很明白」 | 心智模型没建立 |
| 1.0 后 | 「有些难去打出一些特定的机制和组合」 | 学会"是什么"之后，还要在**能打的那一刻**被提醒、并有地方练 |
| 1.0 后 | 「你的有些名称、UI、风格我理解你这样是好的，但是就是第一次玩有点难明白到底是什么」 | **不改名、不改 UI 风格**；第一次出现时必须看得懂是什么 |
| 一贯 | 喜欢美术与创意 | 所有新增 UI 走现有调色板与像素风；不加卡通箭头、不加弹窗墙 |

### 0.2 现在的版本为什么"玩不明白"（诊断）

来自清晰度报告与截图（`T_zh_01hit`、`T_zh_04later`、`T_zh_06fork2`、`A_zh_09fork2`、`C_zh_hold`、`C_zh_c07`、`z6_b`、`A_zh_13fork6`）：

1. **第一次接触回溯的地方是一面字墙**：教学房 6 块地刻 + 教练提示 + 两条横幅叠在一起（`T_zh_04later` 中"触碰它，引发悖论"压在分岔地刻上，完全不可读）。读说明 ≠ 会用。
2. **解释盖住了被解释的东西**：旧影/元凶/悖论术语框压在玩家、敌人、红色预警和悖论预告圈上（`C_zh_c07`、`A_zh_13fork6`）。
3. **按了却"没用"**：0.18–0.3 s 的普通按键被判成微擦带，花 25 时砂、回血 +0，玩家结论"回溯坏了"（`C_zh_hold`）。F3 修复轮已把轻按宽限到光标走过 0.35 s，但"按住"这个动词在被教之前仍然存在。
4. **代价与按键不在眼前**：轻按花 100（池子的一半）没人说；教学房外没有任何地方显示 Q/LB。
5. **一次教太多**：教学房同时出现移动、攻击、冲刺、特技、轻按、按住、时砂、分岔、旧影、元凶、悖论 11 个概念。
6. **没有"为什么"**：玩家知道"按 Q 回到淡影"，但不知道"挨打后按 = 把伤撤销"、"残响再打一遍 = 白赚伤害"、"碰它 = 炸弹"。

### 0.3 成功标准（验收口径）

**唯一的硬标准**：一个没读过任何文档的盲测代理，用全新档案，只靠它自己边玩边用 `tools/shot.cjs` 截下的图，走完 首启 → 序章 → 工坊 → 第一局第一层，能用自己的话正确说出：
- 回溯 **怎么用、什么时候用**（挨打后约 3 秒内按 Q/LB，回到旧影，伤撤销，花时砂）；
- 残响、悖论、分岔、擦带（按住回溯）**怎么用、什么时候用**；
- 时砂、磁带、旧影、残响、悖论 **是什么**。

量化闸门（§12）：10 题问卷 Q1–Q8 全对且留出题 ≥ 1 题对；中文、英文、手柄图标三轮各用新代理；序章参考跑模拟时长 ≤ 360 s；全部截图帧教学文字与硬障碍相交数 = 0；`[text] CJK in tiny` = 0；示范 `demo-desync` = 0；单人与 4 人 QA 机器人回归 0 错误。

### 0.4 五条设计原则

1. **一种说法**（§1）。同一事实全游戏只用一句话说，名字永远配白话。
2. **先看再做**（§2–§3）。核心课一律示范 → 尝试 → 成功节拍；失败只说"发生了什么 + 下次怎么做"。
3. **一次一件**（§5）。每个房间最多一件新东西；未教的按钮要么禁用要么先解释，绝不让玩家"按出一个看不懂的结果"。
4. **刚好那一刻**（§6）。战斗中只在"刚好用得上"的瞬间给"情境 → 按键 → 结果"，学会就退场。
5. **绝不遮挡**（§4）。教学文字只进停靠位，世界里只有细圈和引线；做不到就等待，不叠画。

### 0.5 三份草案的评分与取舍

评分 1–5（5 最好）。

| 维度 | A 示范优先 | B 渐进掌握 | C 即时教练 |
|---|---|---|---|
| ① 新手真的能懂（怎么用 + 什么时候用） | **5** 逐帧序章、模型条、磁带当截止线 | 4 阶梯与介绍卡清楚，但示范窗太小 | 4 战斗中"那一刻"最强，序章靠别人 |
| ② 修掉清晰度报告 S1/S2 | 4 字幕栏 + 聚光、课程期间静音术语框 | 3 依赖 F3 的 Caption | **5** Stage 停靠算法、障碍表、注意力预算 |
| ③ 一个包两人 + 修复轮可实现 | 3 Player 驱动木偶可行；整个 World 重建偏重 | 2 离屏 Vignette 要改冻结渲染器 + 沙盒替换 `G.*` | 3 像素级死亡回放有风险；12 个检测器偏多 |
| ④ 保留名字/UI/风格 | 5 | 5 | 5 |
| ⑤ 单人 + 多人 + 手柄 | 3 多人泳道仅草图 | 4 座位停靠、客人"新手"标记 | **5** 每座位等级、r72 时间气泡、拉回教练 |
| ⑥ 盲测代理可测 | **5** `__tut`、允许/禁止清单、参考脚本 | **5** 留出题问卷、overlapcheck、autoplay | 4 `__coach`、audit |

**取了什么**：A 稿的序章逐课、演示木偶（自动驾驶玩家本人）、成功节拍、帮助等级、胶片擦除、暂停页 6 个循环、`__tut` 与盲测规则；B 稿的阶梯总表、禁用/不宣传裁决、安静时刻调度、排练厅布局与课程表、掌握提示节流、"认出就不教"、不改存档、留出题问卷；C 稿的四级教练与机会窗口、句式规则、Stage 停靠算法与注意力预算、死亡卡用例与"按回溯键播放回放"、多人座位规则。

**没取什么（及原因）**：B 稿的离屏 Vignette（改冻结渲染器、`G.r/G.audio` 沙盒替换风险最高，且示范窗与玩家抢地方）；C 稿的像素环死亡回放（世界画布拷贝时机未验证，8 MB 内存）→ 改为"元数据重画"（§9.4）；A 稿的整个 World 重建 → 改为"同一课重开一个 GameScene"（复用现成场景机制，效果相同，§3.7）；C 稿的 D5「时砂满 20 秒」与 D10「反复死于同一敌人」降为可砍项。

---

## 1. 心智模型一句话 + 用语规范

### 1.1 标准句 `MODEL`（`S('onboard','model')`，逐字不改）

| | zh | en |
|---|---|---|
| 一行 | **回溯 = 撤销刚才几秒（伤也撤销），刚才的你变成残响，把刚才的动作再做一遍** | **Rewind = undo the last few seconds (damage too). The you from those seconds becomes an Echo and does it all again.** |
| 两行排版 `model1` / `model2` | 回溯 = 撤销刚才几秒（伤也撤销） / 刚才的你变成残响，把刚才的动作再做一遍 | Rewind = undo the last few seconds (damage too) / The you from then becomes an Echo and does it all again |

**出现位置（只用这句，不得改写或同义替换）**：序章 L3 开场与 L4 开场；成绩单底部；暂停页「回溯怎么用」页眉；排练厅课程板页眉；死亡卡 C1/C2 第二行；钟典"回溯"条目首行（P7）；楼层卡技巧轮换第 1 条（P7）；首启卡的"玩过了"小字下方。

### 1.2 三个"为什么" `why1–3`（每节课的成功句必须回扣其一）

| id | 图标 | zh（≤ 18 字） | en | 对应模型分句 |
|---|---|---|---|---|
| W1 撤销 | `rewind` | 刚挨打？回溯就撤销 | Just got hit? Rewind undoes it | 撤销刚才几秒（伤也撤销） |
| W2 白打 | `echo` | 残响再打一遍 · 伤害白赚 | Your Echo hits again · free damage | 刚才的你变成残响，再做一遍 |
| W3 爆炸 | `paradox` | 碰到自己的残响 → 爆炸 | Touch your own Echo → explosion | （残响的另一个用途） |

进阶课的成功句格式统一为「结果 · 回扣」，例：分岔「不回溯也能留下残响 · 花 50 时砂」（回扣 W2）。

### 1.3 模型条 `ModelStrip`（新 widget，F4a `src/game/onboard/modelStrip.ts`）

5 格图标 + 短词，按课点亮，是"每课都回到同一句话"的视觉锚。出现在：成功节拍（点亮本课那一格）、成绩单、暂停页页眉、死亡卡底部、排练厅课程板页眉。

| 格 | 图标（12×12，C3 线稿） | zh | en | 点亮于 |
|---|---|---|---|---|
| ① | 逆时针箭头 | 撤销几秒 | Undo seconds | L3 尝试 A |
| ② | 心形 + 回卷箭头 | 伤也撤销 | Damage too | L3 尝试 A |
| ③ | 青色小人 | 刚才的你 = 残响 | Past you = Echo | L4 |
| ④ | 青色双刀 | 再做一遍 | Does it again | L4 |
| ⑤ | ◆ + 爆环 | 碰 ◆ = 爆炸 | Touch ◆ = boom | L5 |

- 格宽 = `max(28, Text.measure(label,'small').w + 6)`，高 = `12 + 2 + Text.lineH('small')`，格间 5 px 的 "→"（K6）。未点亮：图标 K5、字 K6（K6 只作装饰态；点亮后字 K8）。
- 点亮：图标 0.15 s K5→C4→C3，1 px 白环 r+0→r+6，`sfx('spotPing')`。
- `ModelStrip.draw(ctx, cx, y, lit: number /*bitmask*/, o?: { size?: 'small'|'body'; pulse?: number }): { w: number; h: number }`。

### 1.4 用语规范（每个回溯概念的标准说法）

"字幕里怎么说"一列是教学/教练/死亡卡/暂停页唯一允许的说法；"名字 + 白话"沿用 `TERMS`（不改名）。

| 概念 | 名字（TERMS id） | 白话 plain（TERMS） | 字幕里怎么说（zh / en） | 禁用说法 |
|---|---|---|---|---|
| 轻按回溯 | 回溯 `rewind`（新） | 撤销刚才几秒 · 伤也撤销 / Undo the last seconds, damage too | 轻按 {@rewind}：回到旧影，伤也撤销 / Tap {@rewind}: back to your Shadow, damage undone | 倒带、复活、读档、闪避、时间倒流（世界不会倒流）、瞬移（霍拉不瞬移） |
| 按住回溯 | 擦带 `scrub`（新） | 按住回溯 · 自己选退多远 / Hold rewind · pick how far back | 按住 {@rewind}：自己选退多远，松开落地 / Hold {@rewind}: pick how far back, release to land | 蓄力、长按回溯技能 |
| 旧影 | 旧影 `shadow` | 3 秒前的你 · 回溯会回到这里 | 身后的淡影 = 3 秒前的你（旧影） / The faint outline = you 3s ago (Shadow) | 残影、鬼魂、幽灵（幽灵 = 幽灵指针状态） |
| 磁带 | 磁带 `tape` | 能倒回的最近几秒 | 血条下这条是磁带：最近 3 秒 / The strip under your health is the Tape: the last 3s | 体力条、能量条 |
| 红刻痕 | （磁带细节） | — | 红刻痕 = 挨打的那一刻 · 退过它就撤销 / Red notch = the moment you were hit · go back past it to undo | — |
| 青色斜纹 | 青色斜纹 `hpPromise` | 回溯能拿回的生命 | 血条上的青色 = 能拿回的血 / The cyan on your bar = health you can get back | 护盾、回复中 |
| 时砂 | 时砂 `sand` | 回溯/分岔要消耗的能量 | 回溯花时砂，打中敌人就攒回来 / Rewinding spends Sand; hitting enemies earns it back | 法力、钱 |
| 代价 | — | — | 退得越远越贵：轻按 = 退满 3 秒 = 100 / Further costs more: a tap = 3s back = 100 | — |
| 残响 | 残响 `echo` | 过去的你 · 会重复你做过的动作 | 刚才的你（残响）把刚才的动作再做一遍 / The past you (Echo) does it all again | 分身、克隆、召唤物、幻影 |
| 就绪 | 就绪 ◆ `armed` | ◆ 出现后碰它 → 爆炸 | ◆ 亮了 = 残响就绪 / ◆ lit = Echo is armed | — |
| 悖论 | 悖论 `paradox` | 碰到自己的残响 → 爆炸 | 走进就绪的残响 → 爆炸（悖论） / Walk into an armed Echo → explosion (Paradox) | 被残响碰到会受伤（错误） |
| 分岔 | 分岔 `fork` | 原地留下一个残响 | 按 {@fork}：不回溯，原地留个残响（50 时砂） / {@fork}: leave an Echo here, no rewind (50 Sand) | 第二个回溯键 |
| 元凶 | 元凶 `culprit` | 打伤你的敌人 · 残响打它 +50% | 让残响去打打伤你的那个：+50% / Let your Echo hit the one that hurt you: +50% | 急救、治疗标记 |
| 同步 | 同步 `sync` | 两次攻击同时命中 → +50% | 珠子缩完时和残响一起砍 / Strike with your Echo as its bead closes | — |
| 完美回溯 | 完美回溯 `perfect` | 躲过一击 · 时砂全额返还 | 打中前一刻按 {@rewind}：时砂全退 / {@rewind} just before the hit: Sand refunded | — |
| 卡秒 | 卡秒 `tickDodge` | 攻击命中前一刻冲刺 → 反击 | 敌人闪白时 {@dash}：下一击必暴击 / {@dash} on the white flash: next hit crits | — |
| 最后一秒 | — | — | 倒下了也能回溯：撤销刚才几秒 / Even down, you can rewind: undo the last seconds | — |
| 拉回 | — | — | 靠近，按住 {@rewind} 拉回队友 / Get close, hold {@rewind} to pull them back | 复活 |
| 紫色伤害 | 定格伤害 `fixed` | 回溯也拿不回的伤害 | 紫色伤害撤销不了：躲开它 / Violet damage can't be undone: dodge it | — |

### 1.5 句式规则（教学、教练、死亡卡共用；实现时逐条自查）

1. **情境 → 按键 → 结果**，按这个顺序：`刚挨打？按 {@rewind} 撤销`。不写"建议""你可以试试"。
2. 中文一行 ≤ 18 个汉字，英文 ≤ 44 字符；超出由 `Text.wrap` 换行，卡宽上限 360，最多 3 行。
3. 按键只写令牌 `{@action}`，永不写死 Q / LB。
4. 只用**已教过**的风格名；还没教的用白话（"走进残响 → 爆炸"，而不是先说"悖论"）。风格名第一次出现时写成「名字（白话）」或用 `drawTermLabel`。
5. 颜色只用调色板：回溯相关 C3/C4；危险 R4；紫色 V3；奖励/框 B5；正文 K9/K10；次要 K8/K7。
6. 不责备：错过时说"那一下已过 3 秒，撤销不了了"，不说"失败"。错过不发声。
7. 字号：卡片标题行 `title`（FP12×2），正文 `body`（FP12），附注 `small`（FP10）。**中文永不用 `tiny`**；所有框的尺寸从 `Text.lineH / measure / measureWrapped / inkH` 与 `promptH() / promptW()` 推出（TECH F1）。
8. 数字从 `mods` 与实时预览读，不写死：`{cost}` = `p.rewindPreview().cost`，`{stand}` = `mods.echoStandT`，`{fork}` = `mods.forkCost`。

### 1.6 TERMS 变动（`src/game/strings/onboard.ts` 里 `defineTerm`；不改任何既有名字）

| id | 动作 | name | plain（≤ 14 汉字） | detail |
|---|---|---|---|---|
| `rewind` | **新增** | 回溯 Rewind | 撤销刚才几秒 · 伤也撤销 / Undo the last seconds, damage too | 轻按回到旧影（3 秒前的你），受的伤一起撤销，打出的伤害保留；被你丢下的那几秒变成残响。花 {c:25}–{c:100} 时砂。 |
| `scrub` | **新增** | 擦带 Scrub | 按住回溯 · 自己选退多远 / Hold rewind · pick how far back | 按住回溯，预览影沿磁带往回走；松开就落在那里，按冲刺取消（不花时砂）。退得越少越便宜（每秒约 33，最少 25）。 |
| `hall` | **新增** | 排练厅 Rehearsal Hall | 练习技巧 · 不会停摆 / Practise moves · you can't fall here | 工坊里的练习场：示范 + 时砂补满的练习，学会打勾，掌握得奖励。 |
| `perfect` `hpPromise` | 复用（F3 修复轮已定义） | — | — | — |
| `armed` | 不变（F3 已改为"◆ 出现后碰它 → 爆炸"，不在悖论被教前说出"悖论"） | — | — | — |
| `strings/f2.ts` `lastSecondHint` | **改文案**（冻结文件，F4a 改） | — | — | 「回到刚才」→「撤销刚才几秒 / Undo the last seconds」 |

### 1.7 按键令牌与设备规则

- **语法**：`{@rewind}` `{@fork}` `{@attack}` `{@dash}` `{@special}` `{@interact}` `{@confirm}` `{@cancel}` `{@info}` `{@pause}` `{@move}`。与 Text 既有颜色标记 `{c:…}` `{g:…}` `{r:…}` `{v:…}` 共存（`{@` 前缀不冲突；不用 `{k:`，K 是灰阶色名，将来可能被颜色标记占用）。
- **绘制**：`Rich.draw(ctx, s, x, y, o)` / `Rich.measure(s, size, who)`（F4a `onboard/rich.ts`）：文字走 `Text.draw`，令牌走 `drawPrompt(ctx, action, x, y, who)`，竖直居中到 `y + Text.inkMid(size) − promptH()/2`，左右各 2 px。`{@move}`：键鼠/纯键盘画 W A S D（最近一次移动来自方向键则画方向键），手柄画 `LS`。
- **大号图标** `bigPrompt(ctx, action, cx, cy, who, state: 'up'|'down'|'hold', fill: 0..1)`：把 `drawPrompt` 画进按 (action, 设备族, 键) 缓存的 1× 离屏画布，再以 `imageSmoothingEnabled=false` 整数 2× 贴出；`down` = 下移 2 px + 叠 30% K0；`hold` = 外圈 C3 进度弧（fill 0..1）。不改 `drawPrompt` 签名。
- **按下动画**（令牌）：被按下的令牌下沉 1 px 并画 C3 1 px 圆角框扩张 0.25 s；演示木偶按键时，字幕里同名令牌同步按下（`pressed` 回调，§3.5）。
- **谁的设备**：`who` = 该字幕所属玩家的 `PlayerInput`（单人 = 唯一玩家，`lastDevice` 随最后使用的设备切换；多人 = 各自设备与各自绑定；分体键盘自动给出 kbL/kbR 键位）。`settings.padSwap` 交换肩键时图标跟随（`padFor` 已支持）。
- **纯键盘列**（冻结文件接口改动，F4a 做）：`engine/input.ts` 的 `raw` 记录每个动作**最近一次实际触发它的 code**，`PlayerInput.lastCodeFor(a: Action): string | null`；`widgets.keyFor` 改为 `who?.lastCodeFor?.(a) ?? table[a][0]`。于是用 J/K/L/I 那一列的玩家看到 `L`（回溯）、`I`（分岔）、`J`（攻击）。另：从未按过某动作时，若最近 20 s 内没有鼠标移动且最后一次攻击来自 `KeyJ`，同一列的其他动作也取第二绑定（`raw.kbColumn`）。验收脚本 `prologue_kbonly.json`。
- **强制图标族**（测试）：`?glyph=kbm|kb|pad`（每帧覆盖 `lastDevice` 与 `kbColumn`）。

---

## 2. 序章《最后一分钟》The Last Minute（取代 GDD2 §9.1 的 8 步表）

> 只教三件核心事：**轻按回溯（撤销）、残响、悖论**，外加约 50 秒的移动、攻击、冲刺。擦带、分岔放到第一局清场课（§5.6）；同步、元凶、卡秒、完美回溯放到第 2–4 局（§5.7）；紫色伤害放到第一次被紫色打中（§5.7）。理由：GDD2 §9.8 规则 2 本就要求序章只教核心；紫色在玩家刚学会"伤能撤销"的同一分钟里说"有些伤撤销不了"，会直接动摇唯一的心智模型；1–2 层几乎没有紫色敌人（GDD2 §3.11）。

### 2.0 公共设定

| 项 | 规定 |
|---|---|
| 结构 | `PrologueDirector`（F4a 新建 `src/game/scenes/prologue.ts`）。一局"练习"`Run`：`Flow.newRun({ mode: 'practice', seed: 1159, contracts: {}, players: <已入座> })`，**不**计入 `profile.runs`。每课的每个阶段（演示 / 尝试第 i 步）= 一个 `GameScene`，房间类型 `'prologue'`；课号、阶段、步骤用 `run.flags.pl / pp / ps`（数字）传给 `build()`，不改 `GameScene` 的选项类型 |
| 房间 | `RoomTypes.register('prologue', { label: L('序章','Prologue'), icon: 'boss', combat: false, weight: () => 0, advancesRoom: false, build: Prologue.build })`；`roomgen.ts` 加一行分支 `kind === 'prologue'` → 内部 22×11、形状 `plain`、无障碍物（F4a 改）；0 个出口（若 `GameScene` 不支持 0 出口，`build()` 把生成的门全部锁住并隐藏）。`build()` 里把 `scene.titleCard = null`（不出"第 1 层"楼层卡） |
| 舞台坐标 | 本节所有坐标以**地面中心** `scene.center()` 为原点 (0,0)，单位逻辑像素；舞台 = x −160..160、y −72..72（20×9 格），地面四周各留 16 px。镜头：房间小于视口，固定居中。按 22×11 房计算，地面上沿约在屏幕 y 108，舞台道具全部在 y ≥ −56（屏幕约 ≥ 140）；顶轨卡片（§4）约占屏幕 y 50..127，几何上不与道具相交（实测为准，Stage 避让兜底） |
| 右上角序章时钟 | 替代钱袋位置：x 532..632，y 6..30。钟面图标 12×12 + `11:59:27`（5×7 数字 2×），下方 `3/6`（`small`，K8）。成功节拍时跳秒（§2.9） |
| HUD 渐进 | `Gates.hud(id, p)`（§11.5）：L1–L2 只画 `hp` 与 `dash`；L3 起加 `tape` 与 `sand`（由字幕聚光引出）；整个序章不画 `special` 表盘、回忆槽、钱袋 |
| 便条 | 序章期间 `hintsHooks.busy` 包一层恒为真（不弹伊妮丝便条；不改冻结的 `hints.ts`） |
| F3 术语框 | 序章与所有课程进行中，`Callouts` 的世界术语框（旧影/就绪/悖论/元凶）与 HUD 下方白话牌**静音**（`Callouts.mute()`、`RewindHudHooks.muted()`，§11.5）；教学只走字幕轨 + 聚光。聚光某物时调用 `Terms.seen(id)`，第一局的白话框因此少出现 |
| 冻结引导 `FreezeGuide` | 凡写"冻结引导"：受击的同一帧把 `world.stop` 设为极大值（世界与玩家都不更新 ⇒ 磁带停止录制，旧影、`+N`、红刻痕停在原处；画面照常绘制）；课程的逐帧逻辑挂在 Stage 的 HUD 组件 `update(dtReal)` 上（顿帧期间照常运行），它每帧读 `p.input.pressed('rewind')`，按下的那一帧 `world.stop = 0` 并调用 `p.tryRewind()`（未教擦带时按住 = 轻按，立即确认）。最长 6 s，超时解除冻结并重说。**不需要改 `player.ts`** |
| 安全 | L1–L5 的伤害设计上一次尝试最多 3 次命中、总计 ≤ 30 < 50；若仍归零（意外），`scene.onDeath` 被导演覆盖为"擦除重来"（满血）；停摆的"最后一秒"照常出现，不按也只是重来。L6 允许真实的"最后一秒"（教会"回溯能救命"） |
| 伊妮丝 | 舞台上站着 `buildInes()` 精灵（只做手势动画：抬手指向聚光物）；台词全部在字幕轨，说话人图标 = 伊妮丝头像 12×12 |
| 时砂 | 每个阶段开始补满（200/200）；L3 尝试 B0 第一次补满时页脚说一次「排练中时砂会补满 / Sand refills during rehearsal」 |
| 武器 | 玩家当前武器（新档 = 默认武器）。所有"打几下"的数值从武器真实连段伤害计算（GDD2 §9.1 默认 12/12/22） |
| 暂停菜单（序章中） | `再看演示`、`跳过这一课`（二次确认）、`跳过序章`（二次确认「之后可在排练厅重玩」）；F4b 在 `pause.ts` 加 |
| 开放的动词 | L1：move；L2：move/attack/dash；L3–L6：+ rewind（`Gates.tapOnly` 为真，按住 = 轻按）。整个序章分岔关闭：按 {@fork} → 字幕（tier B，1.6 s，每步一次）「这一课用 {@rewind} / This lesson uses {@rewind}」，不扣时砂 |

**通用流程**（每节核心课；状态机见 §3.6 `LessonRunner`）：

```
intro（字幕 1.5–3 s，玩家可走动，道具不激活）
 → demo（演示木偶 ≤ 8 s，玩家不可控；按住 {@confirm} 0.6 s 跳过）
 → wipe（"倒回开头"胶片擦除 0.4 s，重开本课尝试场景）
 → try[步骤 i]（字幕给出这一步要做的一件事）
      失败 → failBeat（1.8 s：一行"发生了什么 + 下次怎么做"）→ wipe → try[步骤 i]（attempt++，帮助等级 §2.10）
 → success（成功节拍 2.4 s，§2.9）→ 下一课
```

### 2.1 P0 首启选择（标题"开始"，`!profile.prologueDone && !Flags.get('onboard.firstCard')`）

| 项 | 内容 |
|---|---|
| 画面 | 标题场景上叠 `drawPanel('dark')` 面板 360×170，居中（x 140..500，y 95..265）；`MenuList` 两项 |
| 标题（`title`，B5） | **第一次玩《秒针 2》？** / **First time in Second Hand 2?** |
| 选项 A（默认焦点） | **第一次：从序章开始（约 5 分钟）** / **First time: start the prologue (~5 min)** |
| 选项 B | **我会玩了：跳过教学** / **I know how to play: skip** |
| B 下方小字（`small`，K8） | 之后可在排练厅和暂停菜单里学 / You can still learn in the Rehearsal Hall and the pause menu |
| 页脚（`small`，K8） | 随时可在 暂停 → 回溯怎么用 复习 / Review any time: Pause → How rewind works |
| 设备行（`small`，K8） | `正在使用：{device} · 按任意键切换` / `Using: {device} · press any key to switch`，`{device}` = 键盘+鼠标 / 键盘 / 手柄，旁边画实时 `{@rewind}` |
| 1.0 存档迁移玩家 | 标题改为 **欢迎回来！2.0 的回溯变了很多** / **Welcome back! Rewind changed a lot in 2.0**；小字 **体验新的序章？** / **Try the new prologue?**；默认焦点仍为 A |
| 结果 | A → `Flags.set('onboard.firstCard',1)` → （`!introSeen` 时先播开场过场）→ `PrologueDirector.start()`；B → `Onboard.skipAll()`（§5.10）→ （开场过场）→ `Flow.hub('start')` |
| 多人（标题"同行"已入座 ≥ 2 人） | 选项 A 文案改为 **一起排练（约 5 分钟）** / **Rehearse together (~5 min)**，走 §2.11 |
| 路由 | `?scene=p0`、`?onboard=fresh`（再从标题开始） |
| 盲测看什么 | 截图 `p0`：读出"约 5 分钟""可以跳过""去哪复习" |

### 2.2 L1 醒来·走 Move —— 11:59:00

| 项 | 内容 |
|---|---|
| 场地 | 表针躺在 (−80, 0)（倒地帧），伊妮丝 (72, −8)，目标圈 `MarkerRing` (56, 0) r12（B5 点线，2 Hz 脉冲） |
| 开场 | 0.6 s 后表针起身（`sfx('windUp')` 上弦声） |
| 字幕（伊妮丝，tier A，until 到达） | **醒醒，小表针。走到我这儿。{@move}** / **Wake up, little hand. Walk over to me. {@move}**；聚光目标圈 |
| 成功 | 进入目标圈 → 无印章，只有"嗒" + 时钟跳到 11:59:08；0.5 s 后 `'clock'` 转场进 L2 |
| 闲置 | 8 s 无输入 → `{@move}` 令牌脉冲并重说 |
| 演示 | 无（移动是通用动词） |
| 盲测截图 | `L1_wake` |

### 2.3 L2 打·冲 Attack + Dash —— 11:59:08

```
x→ −160        −88   −32       32   48          104   160
y −72 ┌──────────────────────────┃──┼────────────────────┐   ┃ = 栅栏（在 x=32，只在摆刀路径处开 24 px 口）
                                  ┃  ╲ 摆刀：枢轴 (48,−56)，刀身沿 x=48 在 y −40..40 往返，周期 1.6 s
   0  │      S      [木人]        ┃   ◎ 目标 (104,0)            │   S = (−88,0)，木人 (−32,0)
  72  └───────────────────────────────────────────────────────┘
```

| 步 | 触发 | 字幕（伊妮丝，zh / en） | 成功 | 失败/重试 |
|---|---|---|---|---|
| 2a | 进场 0.5 s | **打木人：{@attack} 连按三下** / **Hit the dummy: {@attack} three times**（聚光木人） | 一次完整三连段落在木人上（2.0 s 内同一目标 3 次 `hit`，第 3 段命中） | 只打 1–2 下停 3 s → 重说 |
| 2a 成功 | — | 小成功卡：印章 **好！** / **Nice!**，why **第三下最重。** / **The third hit lands hardest.** | — | — |
| 2b | 2a 成功 1.2 s 后 | **摆刀扫过来：按 {@dash} 冲过去** / **A pendulum blade: {@dash} through it**（聚光摆刀） | 冲刺状态下穿过摆刀判定一次并到达目标圈 | 被扫中（0 伤害、`info.hazard`、击退 140）→ **被扫到了：冲刺中才无敌，再来。** / **Clipped! You're only safe mid-dash. Again.**（不擦除，原地继续） |
| 2b 成功 | — | 成功卡：印章 **冲过去了！** / **Through!**，why **冲刺的瞬间无敌。** / **You can't be hurt mid-dash.** | 时钟 → 11:59:18 → 转场 L3 | — |

- 木人 `PracticeDummy({ hp: 9999, punch: false })`，不显示血条。摆刀 `PendulumBlade`（`info.hazard = true`：不触发卡秒，不提前教"卡秒"这个名字）。
- 2b 失败 2 次后伊妮丝做一次示范（演示木偶 2.5 s 片段：等刀经过最低点前 0.2 s 冲刺），之后回到尝试。
- 盲测截图：`L2_attack`、`L2_dash`、`L2_done`。

### 2.4 L3 撤销（旧影 + 轻按回溯）—— 11:59:18 · **最重要的一课**

**教会**：旧影 = 3 秒前的你；挨打后轻按回溯 → 回到旧影，伤撤销；血条青色 = 能拿回的血；花时砂（退满 3 秒 = 100）；磁带 = 最近 3 秒，红刻痕滑出前来得及。

```
x→ −160  −120         −10   16        64   96        128  160
y −40 │                                         伊妮丝(128,−40)│
    0 │   S ─→─→─→─→─→─→─┊─→─(A)─→─→─→─┊─→─(B)─→─→─→─▸      │   S=(−120,0)；A 触发线 x≥−10、落点 (16,0)；B 触发线 x≥64、落点 (96,0)
   72 └────────────────────────────────────────────────────────┘   地面一排淡箭头（B3，20%，纯装饰，不是文字）
```

道具 `FallingGear`（F4a `onboard/props.ts`）：触发后在落点画影子圆（K0 40%，r 4→14，0.8 s；前 0.5 s 跟随玩家脚下、之后锁定），落下造成 12 伤害（`kind:'melee'`，击退 0，可撤销），碎成两片齿轮。玩家冲刺躲开 → 字幕 **躲开了！不过这一课要练挨打以后。** / **Dodged! But this lesson is about after the hit.**，1.0 s 后再落一个预警 0.2 s 的齿轮（躲不开）。

**开场**（2.5 s，可走动，齿轮未激活）：伊妮丝 **接下来最重要：回溯。** / **Now the most important part: rewind.**（1.6 s）→ 模型句第 1 行 `model1`（1.6 s，`small` 页脚）→ **先看一遍。** / **Watch first.**（0.9 s）→ 演示。

**演示 `UNDO_DEMO`**（模拟时间约 7.0 s；d2.0–d3.3 为冻结引导：世界停住，木偶等按键，按键气泡照常动）：

```ts
const UNDO_DEMO: DemoClip = { id: 'undo', start: { x: -120, y: 0, face: 'right', hp: 50, sand: 200 }, maxDur: 9,
  steps: [ { k: 'walkTo', x: 16, y: 0 },                        // ≈1.4 s；越过 x=−10 时舞台 cue dropGearA
           { k: 'waitFor', ev: 'hit', timeout: 2.5, force: () => forceHit(12) },
           { k: 'wait', s: 1.3 },                                // 冻结中：聚光节拍
           { k: 'tap', a: 'rewind' },
           { k: 'waitFor', ev: 'rewindLand', timeout: 1.0 },
           { k: 'wait', s: 2.4 } ],
  segments: { tap: [2.0, 4.6] } };
```

| 时刻 | 字幕（zh / en） | 聚光 | 画面 |
|---|---|---|---|
| d0.0 | — | — | 顶部小牌 `▶ 演示 0:07`；木偶向右走，身后旧影空心轮廓跟随 |
| d0.6 | **身后的淡影 = 3 秒前的你（旧影）** / **The faint outline = you 3s ago (Shadow)** | `shadow` | 旧影与游丝 |
| d≈1.6 | — | — | 齿轮影子出现在木偶脚下 |
| d≈2.0（`hit`） | **挨打了！血条上的青色 = 能拿回的血** / **Hit! The cyan on your bar = health you can get back** | `hpStripe` + `shadowGain` | −12 红字；血条 38 红 + 12 青斜纹；旧影头顶 `+12`；磁带红刻痕；世界停住；`RewindHudHooks.pulse(p)` 让斜纹与 `+12` 同步脉冲 |
| d≈2.9 | （同上字幕） | — | 头顶 `{@rewind}` 2× 浮现，小字「轻按 / Tap」 |
| d≈3.3（`press:rewind`） | **按一下 {@rewind}（轻按）** / **Tap {@rewind} once** | — | 气泡与字幕里的令牌同时下沉、圆环扩散 |
| d≈3.6（`rewindLand`） | **回到旧影，伤也撤销了。** / **Back to the Shadow — damage undone.** | — | 木偶沿游丝倒行 0.25 s 落到旧影处；局部涟漪；`+12`；血条回满 |
| d≈4.6 | **代价：100 时砂（退了 3 秒）** / **Cost: 100 Sand (3 seconds back)** | `sand` | 时砂 200 → 100，一个沙漏变空；（背景里残响走过——不讲，留给 L4） |
| d≈7.0 | — | — | 演示结束 → 胶片擦除 → 字幕 **现在你来。** / **Your turn.**（1.2 s） |

**尝试**：

| 步 | 触发 / 画面 | 字幕（zh / en） | 成功 | 失败 / 重试 |
|---|---|---|---|---|
| A0 观察 | 擦除后立即；旧影在脚下 | **走两步，看旧影跟着你。{@move}** / **Walk a bit — your Shadow follows. {@move}**；聚光 `shadow` | 累计走动 ≥ 1.5 s | — |
| A 引导 | 玩家越过 x=−10 → 齿轮 A | 被砸中瞬间冻结引导；字幕（tier S 卡，§4.3）标题 **刚挨打？按 {@rewind} 撤销** / **Just hit? {@rewind} to undo**，第 2 行 **拿回 +12 生命 · 花 100 时砂** / **+12 health back · costs 100 Sand**，第 3 行 **你会回到身后的淡影（旧影）** / **You jump back to the faint outline (Shadow)**；2× 令牌按下动画；聚光 `shadow` + `hpStripe`（**与第一局的教练 L3 卡是同一张卡**，玩家进第一局时已经认识它） | 回溯落地且 `restored > 0` | 6 s 内不按：解除冻结，卡片缩成一行「还来得及：{@rewind} 撤销 +12」直到机会过期；过期 → failBeat **那一下已过 3 秒，撤销不了了。再来。** / **That hit is 3s old — too late to undo. Again.** → 擦除回 A0。按了分岔 → 「这一课用 {@rewind}」 |
| A 成功 | — | 成功卡：印章 **撤销！** / **UNDONE!**；why **挨打后按回溯：伤也撤销。** / **Got hit? Rewind — the damage is undone.**；小字 **−100 时砂 · 退了 3 秒** / **−100 Sand · 3 seconds back** | 模型条点亮 ①② | — |
| B0 磁带 | A 成功 2.4 s 后；胶片擦除，起点改为 (−10,0)（时砂补满，页脚说明一次） | **血条下这条是磁带：最近 3 秒** / **The strip under your health is the Tape: the last 3s**；聚光 `tape` | 2.5 s 后自动下一步 | — |
| B 独立 | 玩家越过 x=64 → 齿轮 B；**不冻结** | 在 B0 之后立即说 **再来一次，这次没人提醒。** / **Once more. No reminder this time.**；被砸中时字幕轨不出新提示 | 被砸中后、磁带上那道红刻痕滑出左端之前（≤ 3.0 s）完成回溯，`restored > 0` | 砸中 1.5 s 仍未按 → 小字提示（tier B）**红刻痕滑出磁带前，按 {@rewind}** / **Rewind before the red notch slides off the Tape**，聚光 `tapeNotch`。红刻痕滑出 → failBeat **晚了：磁带只记得 3 秒。再来。** / **Too late: the Tape only holds 3 seconds. Again.** → 擦除回 B0。连续失败 2 次 → 帮助等级 3（恢复冻结引导） |
| B 成功 | — | 成功卡：印章 **自己做到了！** / **All by yourself!**；why **3 秒内按回溯，伤就能撤销。** / **Rewind within 3 seconds and the hit is undone.** | `Teach.mark('undo')`；时钟 → 11:59:30 → L4 | — |

- 用到：`FallingGear`、`FreezeGuide`、`p.rewindPreview()`、bus `damaged`/`rewind`、`Stage`、`ModelStrip`、`RewindHudHooks.pulse`。
- 路由：`?scene=prologue&lesson=undo[&phase=demo|try][&step=A0|A|B0|B][&help=3]`。
- 盲测截图（每次 `__tut.wait('caption')` 返回后截）：`L3_demo_shadow`、`L3_demo_hit`、`L3_demo_tap`、`L3_demo_back`、`L3_demo_cost`、`L3_tryA_card`、`L3_tryA_success`、`L3_tape`、`L3_tryB_hint`（若出现）、`L3_tryB_success`。
- 盲测应能说出："身后淡影是 3 秒前的我；挨打后轻按 Q（LB）回到它，伤撤销；花 100 时砂；磁带是最近 3 秒，红刻痕没滑出去就来得及。"

### 2.5 L4 残响（你打出的伤害保留，刚才的你再打一遍）—— 11:59:30

**教会**：回溯后被丢下的那段时间变成残响，它把你刚才的动作再做一遍；你打出的伤害不会被撤销；残响的伤害算你的，也攒时砂。

场地：S = (−96, 0)；木人 D = (48, 0)；伊妮丝 (128, −40)。

道具 `PracticeDummy`（F4a）：`hp = 武器三连段总伤 + 4`（默认 12+12+22+4 = 50，**生成时按真实武器数值计算**）；不回血；头顶 6 格血条（B5 框、R3 填充），血条右侧留 40 px 给"保留 ✓"；**反击**：受到第 2 下后立即起手（`windup` 0.5 s，红色 r34 扇形预警），出拳 8 伤害（可撤销）、击退 120；玩家在 36 px 内停留 1.6 s 未攻击也会出拳；之后冷却 2.0 s；被打碎时掉一枚黄铜齿轮（装饰）。

**开场**：伊妮丝 **回溯还有另一半：刚才的你。** / **Rewind has a second half: the you from before.**（1.8 s）→ 模型句第 2 行 `model2`（1.6 s）→ **看。** / **Watch.**（0.7 s）

**演示 `ECHO_DEMO`**（≈ 7.6 s）：

```ts
steps: [ { k: 'walkTo', x: 26, y: 0 }, { k: 'aimAt', x: 48, y: 0 }, { k: 'combo', n: 3 },
         { k: 'waitFor', ev: 'hit', timeout: 1.5, force: () => forceHit(8) }, { k: 'wait', s: 0.3 },
         { k: 'tap', a: 'rewind' }, { k: 'waitFor', ev: 'rewindLand', timeout: 1 },
         { k: 'waitFor', ev: 'propBroken', timeout: 4, force: () => killDummy('echo') }, { k: 'wait', s: 1.4 } ]
```

| 时刻 | 字幕（zh / en） | 聚光 | 画面 |
|---|---|---|---|
| d0.0 | — | — | 木偶走向木人 |
| d≈1.0 | **打三下……还差一点。** / **Three hits… almost.** | 木人 | 12 / 12 / 22；血条剩 4 |
| d≈1.8（`hit`） | **挨打 → 撤销。** / **Hit → undo.** | — | 木人出拳 −8；气泡 `{@rewind}` 预告 |
| d≈2.4（`press:rewind`） | （同上，令牌下沉） | — | 木偶回到旧影 |
| d≈2.7（`rewindLand`） | **你打出的伤害，保留。** / **The damage you dealt stays.** | 木人血条 | 血条仍剩 4，右侧弹出 **保留 ✓** / **Kept ✓**（G4，`small`，1.6 s） |
| d≈3.2（`echoSpawn`） | **刚才的你（残响）再打一遍！** / **The past you (Echo) does it again!** | 残响 | 青色残响沿刚才的路线走向木人 |
| d≈4.6 | — | — | 残响第一刀（青字带主人色描边；木人此时是元凶 +50%，不讲）→ 木人碎 |
| d≈5.4 | **残响的伤害算你的，也攒时砂。** / **Echo damage counts — and earns Sand.** | `sand` | 时砂随命中上涨（青色小点飞向 HUD） |
| d≈7.6 | — | — | 擦除 → **现在你来。** |

**尝试**：

| 步 | 字幕（zh / en） | 成功 | 失败 / 重试 |
|---|---|---|---|
| 1 | **打木人，挨打后撤销。** / **Hit the dummy, undo when it hits back.**（聚光木人） | 木人被打碎，且至少 1 次命中来自本玩家的残响（`hit` 的 `info.src === slot*2+1`） | 见下 |
| 失败 a：自己打碎（无残响命中） | failBeat **打碎了！这次挨打后撤销，让残响补刀。** / **Broken! This time undo after the hit and let your Echo finish.** → 木人"咔嗒"重组 1 s（不擦除） | | |
| 失败 b：挨打后 1.2 s 未回溯 | 提示（tier A，不算失败）**挨打了 → {@rewind}，让残响补刀。** / **Hit → {@rewind}, let your Echo finish.**；第二次起冻结引导 | | |
| 失败 c：回溯前没攻击（残响无物可打） | failBeat **残响只重复你做过的：先打，再撤销。** / **An Echo only repeats what you did: hit first, then undo.** → 擦除 | | |
| 失败 d：残响打完木人仍未碎 | 提示 **还差点：再打几下，挨打再撤销。** / **Not yet: hit more, undo after the next hit.**（不擦除） | | |
| 成功 | 成功卡：印章 **残响补刀！** / **ECHO FINISH!**；why **回溯后，刚才的你再打一遍：白赚伤害。** / **After a rewind, past you attacks again: free damage.** | 模型条点亮 ③④；`Teach.mark('echo')`；时钟 → 11:59:42 | |

- 路由：`?scene=prologue&lesson=echo`。盲测截图：`L4_demo_almost`、`L4_demo_kept`、`L4_demo_echo`、`L4_demo_sand`、`L4_try`、`L4_success`（+ 任何 failBeat）。
- 盲测应能说出："回溯后会留下'刚才的我'（残响），它把刚才的攻击再做一遍；我打的伤害不会被撤销，所以等于白赚伤害。"

### 2.6 L5 悖论（◆ 亮了 → 走进残响 → 爆炸）—— 11:59:42

**教会**：残响出现 0.4 s 后头顶亮 ◆（就绪）；走进就绪的残响 = 悖论爆炸；爆炸能打碎普通攻击打不动的东西，+20 时砂。

场地：S = (−104, 24)；钟罩 J = (48, −8)；炮台 T = (104, −56)（台座）；伊妮丝 (−140, −40)。

- `GlassJar`（F4a）：作为不移动、不攻击的敌方 Actor（不计入清场与击杀统计，因此 `Paradox.preview` 会在它头顶画 ▾），**只接受 `info.kind === 'paradox'` 的伤害**（1 次即碎）；普通攻击 → "叮"、白闪、首次字幕 **钟罩打不碎……** / **The bell jar won't break…**；玩家进入 44 px 或攻击它 → 警报铃响。罩内一枚铜钥匙（碎后掉出）。
- `AlarmTurret`（F4a）：警报后 0.5 s 预警（M 品红细线指向玩家，经 `Enemy.teleLine` 同款绘制并调用 `Callouts.avoid`），发射一枚慢速品红弹（120 px/s，6 伤害，可冲刺躲开）；之后玩家仍在钟罩 60 px 内则每 1.5 s 再发一枚。保证"在钟罩旁边挨打"。
- **训练轮（只此一项）**：本课残响驻留 `echoStandT = 2.0`（正式 0.6 s），L6 开场明说真实数值（风险 5）。

**开场**：伊妮丝 **残响还能当炸弹用。** / **An Echo can be a bomb, too.**（1.4 s）→ **看。**

**演示 `PARADOX_DEMO`**（≈ 7.8 s）：

| 时刻 | 字幕（zh / en） | 聚光 | 画面 |
|---|---|---|---|
| d0.0 | — | — | 木偶走到钟罩旁 (30, 0) |
| d≈1.1 | **钟罩打不碎……** / **The bell jar won't break…** | 钟罩 | 木偶砍一刀："叮" |
| d≈1.6 | — | — | 警报；炮台预警线；弹丸 −6 |
| d≈2.1（`press:rewind`） | **挨打 → 撤销。** / **Hit → undo.** | — | 回到旧影（≈ (−56, 20)） |
| d≈2.4（`echoSpawn`） | — | — | 残响沿路线走向钟罩 |
| d≈3.5（`echoArmed`，残响停在钟罩旁） | **◆ 亮了 = 残响就绪。** / **◆ lit = Echo is armed.** | `armed` | ◆ 旋转，描边由虚变实，白环脉冲 |
| d≈4.0 | **走进它 → 悖论（爆炸）。** / **Walk into it → Paradox (explosion).** | `preview` | 木偶走近；56 px 内地面出现虚线预告圈，钟罩头顶 ▾ |
| d≈5.0（`paradox`） | — | — | 爆环 r48；钟罩碎、钥匙掉出；`+20` 飞向时砂 |
| d≈5.6 | **爆炸能炸开打不动的东西。** / **Blasts break what attacks can't.** | — | — |
| d≈7.8 | — | — | 擦除 → **现在你来。** |

**尝试**：

| 步 | 字幕 | 成功 | 失败 / 重试 |
|---|---|---|---|
| 1 | **用残响的爆炸打碎钟罩。** / **Break the jar with your Echo's blast.** | 钟罩被 `paradox` 打碎 | 见下 |
| 失败 a：残响驻留结束碎掉、没碰到 | failBeat **慢了一步：◆ 亮了就走进去。** / **Too slow: walk in once the ◆ lights.** → 擦除 | | |
| 失败 b：爆炸没碰到钟罩 | failBeat **等残响走到钟罩旁再碰。** / **Let your Echo reach the jar, then touch it.** → 擦除；聚光钟罩 | | |
| 失败 c：◆ 亮前就碰（未就绪） | 不算失败；字幕 **等 ◆ 亮起再碰。** / **Wait for the ◆, then touch.**（残响在分开后就绪） | | |
| 成功 | 成功卡：印章 **悖论！** / **PARADOX!**；why **碰到就绪 ◆ 的残响 → 爆炸，+20 时砂。** / **Touch an armed ◆ Echo → explosion, +20 Sand.** | 模型条点亮 ⑤；`Teach.mark('paradox')`；时钟 → 11:59:52 | |

- 路由：`?scene=prologue&lesson=paradox`。盲测截图：`L5_demo_jar`、`L5_demo_armed`、`L5_demo_preview`、`L5_demo_blast`、`L5_try`、`L5_success`。
- 盲测应能说出："残响头上 ◆ 亮了就走进去碰它，会爆炸（悖论），能打碎普通攻击打不动的东西，还给时砂。"

### 2.7 L6 合起来（小考）—— 11:59:52

| 项 | 内容 |
|---|---|
| 场地 | S = (−96, 0)；1.2 s 后在 (80, −32)、(80, 32) 两个刷怪圈出两只**真实**齿轮仔（`cogling`，第一层数值） |
| 开场 | 伊妮丝 **最后一关：用上学会的一切。** / **Last test: use everything you learned.**（1.8 s）；字幕轨下方展示完整模型条（全部点亮）2.5 s；伊妮丝 **实战里残响只停 {stand} 秒，要快。** / **In a real fight an Echo waits only {stand}s — be quick.**（1.6 s，`{stand}` = 0.6） |
| 教练 | 即时教练（§6）在本课以**脚本模式**开启：第一次可撤销受击 = L3 卡（含慢动作）；之后按 §6.3 规则；玩家自己撤销 2 次后降为 L2 |
| 额外提示 | 第一次有就绪残响在敌人 48 px 内：教练 D4（§6.5）**残响旁有敌人：走进残响 → 爆炸** |
| 死亡 | 真实"最后一秒"（0.2×，字幕 tier S **倒下了也能回溯：按 {@rewind} 撤销刚才几秒** / **Even down, rewind: {@rewind} undoes the last seconds**）；不按 → 擦除重来（满血） |
| 成功 | 两只齿轮仔全灭。成功卡：印章 **排练完成** / **REHEARSAL COMPLETE**；why **挨打 → 撤销 → 残响补刀 → 碰它爆炸。** / **Hit → undo → Echo strikes → touch it to blast.** |
| 失败 | 无失败条件（只有死亡重来）；45 s 未清场 → 帮助等级 +1（齿轮仔移速 0.8×） |
| 路由 | `?scene=prologue&lesson=final` |
| 盲测截图 | `L6_start`、`L6_coach`、`L6_success` |

### 2.8 成绩单 + 尾声 —— 11:59:59

**成绩单** `ReportCard`（overlay，8 s 或按 `{@confirm}`）：面板 400×200 居中（x 120..520，y 80..280），`drawPanel('paper')`。

| 行 | 内容 |
|---|---|
| 标题 | **排练成绩单** / **Rehearsal report**（`title`） |
| 1 | ✓（G4）**撤销** · 挨打后按 {@rewind}，伤也撤销 / **Undo** · Got hit? {@rewind}, damage undone |
| 2 | ✓ **残响** · 刚才的你再打一遍 / **Echo** · Past you attacks again |
| 3 | ✓ **悖论** · 碰 ◆ 残响 → 爆炸 / **Paradox** · Touch a ◆ Echo → boom |
| 底部 | `model1` / `model2`（`small`，K8）+ 模型条全亮 |
| 页脚 | 暂停 → 回溯怎么用：随时复习 / Pause → How rewind works: review any time |

某课被跳过 → 该行 ○（空心）+ 「排练厅可补 / Practise it in the Rehearsal Hall」。

**尾声**：大钟敲一下，时钟停在 11:59:59（数字变 B5 并轻抖）；伊妮丝 **……钟停了。离午夜只差一秒。** / **…The clock stopped. One second to midnight.**（2.4 s）→ **跟我回工坊。** / **Come back to the workshop.**（1.4 s）→ `profile.prologueDone = true`、`profile.shards += 15`、`Teach.mark('move','attack','dash')`、排练厅 `hall.undo/echo/paradox` 打 ✓（不重复给碎片）→ `Flow.hub('start')`。

### 2.9 成功节拍 `Beat.success`（序章、清场课、排练厅、教练共用；F4a `onboard/beat.ts`）

| 时刻 | 发生什么 |
|---|---|
| 0.00 | 顿帧 0.04 s；字幕轨切换为**成功卡**（§4.3）：左侧 ✓ 圈（G4），印章词（`title`，C4，从 2× 砸到 1×，0.07 s，与 `drawStamp` 同手感），下方一句 why（`body`，K10）；`sfx('lessonPass')`（上行双音"嘀-嗒"）；该玩家手柄 `rumble(0.25, 0.4, 120)` |
| 0.80 | 模型条在成功卡下方出现，点亮本课对应格（只在序章与核心课） |
| 1.60 | 序章：右上时钟跳秒（如 11:59:18 → 11:59:30），`sfx('clockJump')` |
| 2.40 | 进入下一课 / 下一步；清场课：道具"噗"地消失 |

- 印章永远在字幕轨里，**不在玩家或爆炸上方**（同时回应清晰度报告 S2 #6）；放不下 `title` 尺寸时（多人座位卡宽 220、英文长词）退回 `body` + C4 描边。
- 教练的成功（§6）用同一个组件，但不出模型条、不跳时钟，时长 2.0 s。
- 发出 `bus.emit('custom', { id: 'onboard.success', player, data: { id } })`（阶梯"认出"与成就可用）。

### 2.10 失败、帮助等级与闲置（全课统一）

- **只从当前步骤重来**，不是整课。重来 = 胶片擦除 + 重开本阶段场景（序章）或软重置（清场课、排练厅，§3.7）；血量/时砂/磁带回到该步起点。
- 失败字幕 = **发生了什么 + 下次怎么做**，一行 ≤ 18 汉字（各课逐条已列）。
- **帮助等级**（每步独立计数）：

| attempt | 等级 | 效果 |
|---|---|---|
| 1 | 0 | 正常 |
| 2 | 1 | 失败字幕更具体；页脚 `{@info} 再看一遍` 闪烁 |
| 3 | 2 | 自动询问「要不要再看一遍演示？{@confirm} 看 · 走开 = 不看」/「Watch the demo again? {@confirm} watch · walk away = no」；只放失败那段 2–3 s 片段（`DemoClip.segments`） |
| 4–5 | 3 | 辅助：本步世界 0.6×（时间气泡）、受击时冻结引导 + 大按键、残响驻留 +1 s、预警 +0.4 s |
| 6+ | 3 | 额外出现「{@confirm} 先跳过这一课（排练厅可补）/ {@confirm} Skip this lesson (practise it in the Hall)」；跳过 = 动词照样开放，课程记为未完成（排练厅课程板空心 ○） |

- **闲置**：尝试阶段 8 s 无任何输入 → 重说本步字幕、令牌脉冲；16 s → 帮助等级 +1。
- **按错键**：按了本课未开放的动词 → 「这一课用 {@rewind} / This lesson uses {@rewind}」（每步一次，tier B）。

### 2.11 节奏预算

| 段 | 目标 | 上限（含 1 次失败） | 时钟 |
|---|---|---|---|
| P0 首启选择 | 8 s | 15 s | — |
| L1 醒来·走 | 15 s | 25 s | 11:59:00 → :08 |
| L2 打·冲 | 35 s | 60 s | → :18 |
| L3 撤销 | 60 s | 95 s | → :30 |
| L4 残响 | 50 s | 80 s | → :42 |
| L5 悖论 | 50 s | 80 s | → :52 |
| L6 小考 | 45 s | 75 s | → :59（停住） |
| 成绩单 + 尾声 | 17 s | 20 s | 11:59:59 |
| **合计** | **≈ 4 分 40 秒** | **≈ 7 分 30 秒（极端）** | |

`__tut.log` 记录每段的模拟时间与真实时间；参考脚本断言总模拟时间 ≤ 360 s（§12）。

### 2.12 多人序章（可砍项 C2，§13）

- 标题"同行"入座 ≥ 2 人且槽 Ⅰ 档案 `!prologueDone` 时，P0 选项 A 改为「一起排练」。
- 舞台按人数分**泳道**：2 人 = 两条（中心 y −36 / +36，各高 64）；3–4 人 = 内部 22×14 的房间、四条 48 px 泳道。每条泳道一份道具（坐标按泳道中心平移），道具只接受本泳道玩家与其残响的伤害（`prop.owner = p`，道具自己的 `acceptsHit(info)` 过滤 `info.player === owner`，不改 `combat.ts`）。
- 演示同时在每只手上播放（每只手各一个 `DemoDirector`）；各自尝试、各自软重置（只作用于本泳道）；字幕进各自的座位停靠位（§4.2）。
- **谁也不卡谁**：全员成功 → 下一课；或第一人成功 25 s 后进入下一课，没完成的人记"未完成"，在第一局清场课或排练厅补。
- 客人座位（槽 Ⅱ–Ⅳ）的学会记录只存本次会话（`SeatTeach`，§5.9）。

---

## 3. 示范木偶 Demo puppet（F4a `src/game/onboard/demo.ts`、`lesson.ts`、`host.ts`）

### 3.1 选型（裁决）

| 方案 | 能演示回溯/旧影/HUD？ | 风险 | 结论 |
|---|---|---|---|
| 纯残响回放（`Echo` + 预录录像） | 不能：残响不会回溯、不会产生旧影与新残响 | 低 | 只够"残响打人"，不够 |
| 隐藏槽位的第二个 `Player` | 能 | 高：受伤、仇恨、镜头、HUD、门都按 `world.players` 遍历；放进去多一个铭牌，不放进去打不中 | 否 |
| B 稿离屏小世界 Vignette | 能 | **最高**：`Renderer` 构造会插 DOM、建 WebGL；`player.ts` 直接写 `G.r.params`、`G.audio`；注册表/便条被污染；要改冻结的 `renderer.ts`/`registry.ts`/`hints.ts` | 否 |
| **自动驾驶玩家本人的表针，演完"倒回开头"**（A 稿） | **能**：走的就是真实的回溯/残响/悖论/HUD 代码，演示里的 `+12`、青色斜纹、红刻痕、`−100` 都是真 HUD | 中：换输入、交还控制、重置舞台（§3.3、§3.7） | **采用**（序章、清场课、排练厅） |
| 关键帧小舞台 LoopPlayer（A 稿 §7.3） | 只是动画（真实精灵、不跑战斗代码） | 低 | **采用**于暂停页、排练厅幕布、死亡回放（§7.3、§8.2、§9.4） |

### 3.2 数据：`DemoClip` 与步骤 DSL

```ts
// src/game/onboard/demo.ts
export interface DemoClip {
  id: string;
  /** 舞台坐标（§2.0；清场课与排练厅为"相对玩家起点"的偏移） */
  start: { x: number; y: number; face?: 'left' | 'right' | 'up' | 'down'; hp?: number; sand?: number };
  steps: DemoStep[];
  captions: DemoCaption[];          // 与步骤同步的字幕（各课时间轴）
  maxDur: number;                   // 超时保护（模拟秒）
  segments?: Record<string, [number, number]>;   // 帮助等级 2 时只放的片段
}
export type DemoStep =
  | { k: 'walkTo'; x: number; y: number; speed?: number }   // 转向驱动：朝目标的单位向量，3 px 内停
  | { k: 'wait'; s: number }
  | { k: 'waitFor'; ev: DemoEvent; timeout: number; force?: () => void }   // 等事件；超时则 force 并记 desync
  | { k: 'tap'; a: Action }                    // 按下 4 tick 后松开（< 0.18 s，必为轻按）
  | { k: 'hold'; a: Action; s: number }        // 按住 s 秒后松开（擦带演示用；演示期间对木偶 Gates.tapOnly=false）
  | { k: 'press'; a: Action } | { k: 'release'; a: Action }
  | { k: 'aimAt'; x: number; y: number } | { k: 'aimAtNearest' }
  | { k: 'combo'; n: number }                  // 连按攻击 n 下，间隔取武器连段窗口的 60%
  | { k: 'cue'; id: string };                  // 舞台脚本事件（dropGearA、spawnJar…）
export type DemoEvent = 'hit' | 'rewindLand' | 'echoSpawn' | 'echoArmed' | 'paradox' | 'propBroken' | 'echoEnd' | 'fork' | `cue:${string}`;
export interface DemoCaption { at: number | DemoEvent | `${DemoEvent}+${number}` | `press:${Action}`; key: string; spot?: SpotRef | SpotRef[]; dur?: number }
```

- **转向驱动**而不是录制原始摇杆值：移速、连段时间被 P1/P5 调参后演示仍然走到位。
- 每个 `waitFor` 都有 `timeout` 与 `force`（例："等齿轮砸中"超时 → `force` 直接对木偶 `hurt({ amount: 12, kind: 'melee' })`；"等木人碎"超时 → 直接击碎）。每次 force 记 `__tut.log {ev:'demo-desync', data:{clip, step}}` 并在开发模式 `console.warn`。**CI 要求 desync = 0**（§12）。

### 3.3 输入替换与交还 `DemoDirector`

```ts
class DemoDirector extends Entity {
  constructor(run: LessonRun, p: Player, clip: DemoClip)
  added():   // ① this.real = p.input
             // ② this.bot = new PlayerInput(p.slot, `bot${8 + p.slot}`); p.input = this.bot  （BotInput 每 tick 写 move/aim/held/pressed）
             // ③ p.renderTint = PUPPET_TINT（§3.4）；只在 p.rw === null 且 forkHold < 0 时开始（舞台刚重置，角色静止）
  update(dt):// 按模拟时间推进步骤机；跳过：this.real.down('confirm') 累计 ≥ 0.6 s → finish(true)
  finish(skipped):
             // p.input = this.real; this.bot 释放; p.renderTint = null
             // 消耗 real 上所有动作（consume），要求 0.2 s"中立输入"（无按键、摇杆归零）后才交还控制
             // emit custom { id: 'demoEnd', data: { clip, skipped } }
}
```

- 演示中真实设备的按键被忽略（跳过与暂停除外）；可以打开暂停菜单（演示暂停）。
- 按键图标的设备族始终取 `this.real`（玩家真正在用的设备），**不是** bot。
- 演示期间木偶不会死：舞台伤害本来就小；若意外归零，演示立即结束并重置。
- 多人：每只手各自一个 `DemoDirector`，只换该手的输入。
- `player.ts` 需要的唯一改动：`renderTint?: { alpha: number; desat: number; outline: ColorKey; dashed: boolean } | null`（`render()` 里套用；描边用 `engine/gfx/outline.ts` 的 `outlineOf`）。F4a 在本包内加。

### 3.4 木偶外观：粉笔描边（与旧影、残响都不撞色）

| 东西 | 外观 | 区分点 |
|---|---|---|
| 旧影 | 空心 C3 虚线轮廓 | 青、空心 |
| 残响 | 青色实心身体 | 青、实心 |
| **演示木偶** | 玩家本来的颜色，85% 不透明、饱和度 −50%，外加 **1 px K10 白色虚线描边**（"粉笔"，3 实 2 空，沿轮廓 8 px/s 流动） | 白、暖、非青 |

- **演示画框**（UI 层）：屏幕四角各一个 10×10 的 K9 L 形角标（距边 4 px）；顶轨正上方小牌 `▶ 演示 0:04` / `▶ DEMO 0:04`（`small`，K9，85% K0 底；数字为剩余秒）。**不加黑边**——HUD 必须完整可见（HUD 的变化本身就是教学内容）。
- 演示期间后期色彩分级饱和度 −15%（全屏轻微），回到"你来"时恢复；青/品红/紫依旧可辨。

### 3.5 按键气泡（木偶头顶的按键动画）

木偶头顶（世界 `p.x, p.y − 34`，经 `r.worldUi` 画在 UI 层）显示**当前设备**的按键图标，2×（`bigPrompt`，§1.7）。

| 阶段 | 时间 | 画面 |
|---|---|---|
| 预告 | 按下前 0.6 s | 图标淡入，上下浮动 1 px（2 Hz）；下方小字 `轻按 / Tap` 或 `按住 / Hold`（`small`，K9） |
| 按下 | 按下瞬间 | 图标下沉 2 px、键面加深；C3 圆环 r10→r20（0.25 s）；`sfx('glyphPress')`（很轻的"咔"）；字幕里同名 `{@action}` 同步下沉 |
| 按住 | 按住期间 | 图标外一圈 C3 进度弧（满圈 = 该步 `s`）；小字变 `按住 0.8s` |
| 松开 | 松开瞬间 | 图标回弹 + 第二个圆环；0.3 s 后淡出 |

`walkTo` 期间不显示气泡；移动只在字幕里用 `{@move}`。气泡是 UI 层的世界标签，但它跟随木偶自己，Stage 把它登记为木偶的一部分（不会被别的教学文字压住）。

### 3.6 课程运行器 `LessonRunner`（F4a `onboard/lesson.ts`；序章、清场课、排练厅共用）

```ts
export interface LessonDef {
  id: LessonId;                       // 'move'|'strike'|'undo'|'echo'|'paradox'|'final'|'fork'|'scrub'|…（§5.7 全表）
  teach: string;                      // 成功时 Teach.mark 的 id
  term?: string;                      // 介绍卡第 1 行的 TERMS id
  where: ('prologue' | 'calm' | 'hall' | 'seat')[];
  intro?: { lines: L10n[]; dur: number };
  demo?: DemoClip;
  steps: LessonStep[];                // 尝试的各步
  success: { stamp: L10n; why: L10n; sub?: L10n; strip?: number /* 模型条 bitmask */ };
  sand: 'refill' | 'keep';            // refill = 每次尝试开始补满、结束退还本课花费
  verbs?: { scrub?: boolean; fork?: boolean };   // 本课期间对本玩家放开的闸门
  props(ctx: LessonCtx): void;        // 放道具（舞台坐标或相对玩家）
}
export interface LessonStep {
  key: string;                        // 字幕 key
  until?: (e: LessonEvent, ctx: LessonCtx) => boolean;   // 本步推进条件（总线事件，只认本课玩家：e.player === ctx.p）
  done?: (e: LessonEvent, ctx: LessonCtx) => boolean;    // 成功条件（最后一步）
  fail?: (e: LessonEvent, ctx: LessonCtx) => L10n | null;// 具体失败原因（→ failBeat）
  hint?: (ctx: LessonCtx, t: number) => L10n | null;     // 不算失败的提示（tier B）
  freezeOnHit?: boolean;              // 冻结引导
  timeout?: number;
}
export const Lessons: {
  define(d: LessonDef): void; get(id: LessonId): LessonDef | null;
  start(id: LessonId, p: Player, where: Where, host: StageHost): LessonRun;
  active(p?: Player): LessonRun | null;            // Gates 与教练据此判断"本课进行中"
  state(id: LessonId, p?: Player): 'locked' | 'eligible' | 'queued' | 'taught' | 'mastered';
  complete(id: LessonId, p: Player, how: 'lesson' | 'recognised' | 'soft' | 'skip'): void;   // Teach.mark + 排练厅 ✓ + 奖励
  onComplete(cb: (id: LessonId, p: Player, how: string) => void): void;
  tick(dtReal: number): void;                      // Stage 的 HUD 组件 update 调用（顿帧期间照常）
};
```

状态机：`intro → demo → wipe → try[i] ⇄ fail → success → end`；事件 `lessonStart demoStart demoEnd demo-desync fail success skip postpone` 写入 `__tut.log`。

### 3.7 舞台重置（两种宿主 `StageHost`，F4a `onboard/host.ts`）

**刻意不用游戏里的回溯涟漪**：舞台重来不是"回溯"，否则玩家会以为回溯能倒退整个世界。

**胶片擦除**（两种宿主共用的画面）：

| 时刻 | 画面 |
|---|---|
| 0.00–0.20 | 一条 K0 横幅从屏幕底向上扫（两侧 K3 片孔），后面画面变暗；中央小牌 `⏪ 倒回开头 / Back to the start`（`small`）；`sfx('filmWipe')`（胶片卷动 + 三声快速咔嗒） |
| 0.20 | **重置**（见下） |
| 0.20–0.40 | 横幅继续上扫离开，新舞台出现 |

| 宿主 | 用在 | 重置做什么 |
|---|---|---|
| `RebuildHost` | 序章 | 先写 `lo.hp = lo.mods.maxHp`、`lo.sand = lesson.sand ?? lo.sandMax`、`lo.tape = null`，设 `run.flags.pl/pp/ps`，再 `G.scenes.go(() => new GameScene(run, { kind: 'prologue', … }), 'fade', 0.2)`：一个全新的 `World`（`world.after` 计时器、总线监听、时间气泡、残响、粒子、元凶标记一并清空，比逐项清理更不会漏）；新场景前 0.4 s 由导演画擦除横幅的后半段；玩家由 `Player.added()` 按入口站位预填磁带 |
| `SoftHost` | 清场课、排练厅 | 不能重建真实房间：① `world.cancelTimers(lesson)`；② 移除本课生成的道具（无碎裂特效）与**本玩家**的全部残响（`echo.shatter` 的无特效版，不发 `paradox`）；③ 移除本玩家拥有的时间气泡；④ 血量/时砂恢复到本步起点快照；⑤ `p.rec.clear()` 后 `prefill(p.x, p.y, 180, …)`（旧影回到脚下）；⑥ 不移动玩家，道具按玩家**当前**位置与朝向重新摆放（离墙/坑 ≥ 24 px，取不到就镜像到另一侧） |

### 3.8 重放与跳过

- 尝试阶段字幕轨页脚常驻 `{@info} 再看一遍 / {@info} Watch again`（`info` = Tab / View）。按下 → 当前步骤立即擦除 → 演示 → 擦除 → 回到该步（attempt 不增加）。暂停菜单 `再看演示` 同。帮助等级 2：只放 `segments[step]`（2–3 s）。
- 演示中按住 `{@confirm}` 0.6 s 跳过演示（先出现一圈进度提示，防误跳）。
- 多人：`info` 按各自设备，只重放自己那条泳道 / 自己那节课。
- 计数 `__tut.demoPlays[lesson]`。

### 3.9 自动驾驶 `?autoplay=onboard`（CI 与盲测模板用，不给盲测代理）

- 课程尝试阶段，把该课 `demo` 的步骤（坐标换算为尝试起点）喂给真实玩家的 `DemoDirector`（同一套代码，木偶描边关闭）；`&fumble=1` 时每课第一次故意做错（不按回溯、自己打碎木人、在钟罩远处回溯、擦带松早、分岔后站着不动），让失败字幕进截图。
- 课程之外的战斗交给 QA 机器人（`bot.ts` 的大脑，关闭它自带的回溯与分岔：F4b 在 `bot.ts` 加 `BotOpts.noRewind`）；教练提示出现时由驾驶员在 0.4 s 后按提示上的键，3 次后改为"自己按"（受击后 0.1 s 内），以展示教练淡出。
- 这让 QA 机器人能**完成**教学；`?bot=1` 则**跳过**教学（§12.5）。

---

## 4. 字幕轨 Caption rail + 标注避让 Stage（F4a `src/game/onboard/stage.ts`；修清晰度报告 S1 #1–#3、S2 #6–#11）

> F3 修复轮的 `ui/callouts.ts` 已有：世界术语框一次 1 个（多人 2 个）、停留 2.5 s、最长 4 s、贴在物体背离最近玩家的一侧、虚线引线、以玩家/残响/预警为障碍；`Caption` 顶部单行轨。**Stage 在它之上做四件事**：(1) 把字幕轨变成"可以换停靠位"的轨，并接管 `Caption.say`；(2) 教练卡、课程字幕、成功卡、芯片、座位卡全部纳入同一张障碍表；(3) 全屏注意力预算与仲裁；(4) 世界聚光（细圈 + 引线）。F4a 修改 `callouts.ts`：`Caption.say()` 改为转给 `Stage.say()`（prio → tier 映射：≥2 → A，1 → B，0 → C），导出 `Callouts.obstacles(w)` 与 `Callouts.mute` 钩子。

### 4.1 规则

1. **所有教学文字只进停靠位**：教练提示、课程步骤、失败原因、成功卡、伊妮丝的序章台词、多人共享白话行、掌握提示。
2. **世界里不画教学盒子**：需要指向世界物体时只画**聚光圈**（物体外 6 px 的 1 px C3 点线圈，2 Hz 脉冲）+ 从卡片到圈的 **1 px 虚线引线**（C2，60%，带 K0 下像素）。同屏最多 2 个聚光。HUD 目标画圆角矩形框。
3. 每个停靠位一次只显示一条；按 tier 排队；同 `key` 替换。
4. 停靠位不得盖住硬障碍（§4.4）；没有空位就排队，**绝不叠画在动作上**。

### 4.2 屏幕分区与停靠位（逻辑 640×360）

```
单人                                                         多人（2–4）
┌───────────────────────────────────────────────┐           ┌───────────────────────────────────────────────┐
│[铭牌 0..184×0..50] [顶部区 170..470×6..46] [钱袋/时钟 532..632]│ │[铭牌Ⅰ 6..138×6..38] [钱袋 270..370×6..20] [铭牌Ⅱ 502..634]│
│[F3 白话牌 22..~360 × 52..100（首见）]                   │           │ 座位Ⅰ停靠 x6 y42→        共享顶轨 中心 x320 顶 y68  ←座位Ⅱ │
│        顶轨 TOP：中心 x320（或白话牌右侧），顶 y50        │           │                                               │
│                    （战斗区）                            │           │                    （战斗区）                  │
│        底轨 BOTTOM：中心 x320，底 y318（便条在时 x≥248）   │           │        共享底轨：中心 x320，底 y318             │
│[便条卡 8..240 × …..326]                                 │           │ 座位Ⅲ停靠 x6 底 y318→           ←座位Ⅳ 底 y318 │
│[底部区 0..640×322..360：槽位、首领血条]                  │           │[铭牌Ⅲ 6..138×322..354]  [首领血条]  [铭牌Ⅳ]      │
└───────────────────────────────────────────────┘           └───────────────────────────────────────────────┘
最后一秒面板：中心 (320,132)，约 200×52      楼层卡（§10，F4a 改）：屏幕上三分之一 1.8 s
```

| 停靠 | 单人 | 多人 |
|---|---|---|
| `top` | 中心 x = `max(320, platesRight + 8 + w/2)`，右缘 ≤ 632；放不下时本帧隐藏 F3 白话牌（`RewindHudHooks.hidePlates`）再用 x320；顶 y = `Hud.areaRect('top')` 底 + 4（≈ 50）；P2 的目标行在显示时贴其下 2 px | 共享顶轨：中心 x320，顶 y = 顶部区底 + 4（≈ 68） |
| `bottom` | 中心 x320，底 y318；左下伊妮丝便条在屏时 x 区间限制为 [248, 632] | 同左；座位Ⅲ/Ⅳ停靠在屏时让出其半边 |
| `seat` | — | Ⅰ 左上：左 x6 顶 y42；Ⅱ 右上：右 x634 顶 y42；Ⅲ 左下：左 x6 底 y318（便条在屏时底 = 便条顶 − 4）；Ⅳ 右下：右 x634 底 y318；最大宽 220；备选：向屏幕内侧平移 40 / 80 / 120 px |
| `pod`（芯片） | x150 y8（铭牌内 HP 数字右侧） | Ⅰ：铭牌右侧 x142 y10；Ⅱ：铭牌左侧右对齐 x498；Ⅲ/Ⅳ：同理 y326 |

### 4.3 卡片形态（全部在 UI 层；尺寸由 `Text.*`、`promptH()`、`promptW()` 推出）

| 形态 | 用途 | 规格 |
|---|---|---|
| **大卡 card** | 教练 L3、序章 L3 尝试 A、最后一秒附注 | 行 1 `title`（FP12×2，C4，令牌 2×）；行 2 `body`（K9，数字 C3/C4）；行 3 仅前 2 次 `small`（K8）；底部 2 px 倒计时条（C3 于 K2，宽 = 卡宽 − 20，长 = `timer()`）。内边距左右 10 / 上下 5；宽 = max(行宽) + 20，≤ 360；88% K0 底板 + 1 px C3 顶线；多人左侧 3 px 槽位色条。入场 0.12 s 自上方 6 px 落下 + 淡入；退场 0.2 s 淡出 |
| **字幕 line** | 课程步骤、教练 L2、提示、伊妮丝台词 | 一行（最多 3 行）`body` 富文本（1× 令牌）；左侧说话人图标 12×12（伊妮丝头像 / 系统 ⓘ K8 / 多人槽位徽记）；可选底部倒计时条；可选页脚 `small` K8（`{@info} 再看一遍`、`走进门 = 稍后再学`） |
| **成功卡 success** | `Beat.success` | 左侧 ✓ 圈（G4）+ 印章词（`title`，C4，2×→1× 砸下）+ why（`body` K10）+（序章）模型条 |
| **芯片 chip** | 教练 L1；关键提示无处可放时的退路 | 铭牌内 `{@rewind} +14`（令牌 + 5×7 数字 C3），85% K0 底，透明度 1↔0.6 3 Hz 闪 1.2 s |
| **座位卡 seat** | 多人的 L3/L2 与课程 | 同 line 单行形态，行首槽位徽记，令牌 2× 但文字 `body`，最大宽 220 |

- 时长：`dur = clamp(1.2 + 0.09 × 字符数, 2.5, 6)`；`until` 条件型字幕显示到条件满足；计时用真实时间，被遮挡或排队期间暂停。

### 4.4 障碍表（每帧一次，UI 像素；`Stage.obstacles()` 缓存到本帧结束）

| 来源 | 形状（世界 → UI） | 硬/软 | 由谁登记 |
|---|---|---|---|
| 每只存活的手 | 精灵框 (x−8, y−26)–(x+8, y+4) 外扩 8 px | 硬 | `callouts.ts`（已有） |
| 残响（所有人的） | (x−9, y−30)–(x+9, y+4) | 硬 | `callouts.ts`（已有） |
| 旧影 + 头顶 `+N/−N` 标签 | 旧影框上延 30 px | 硬 | `rewindHud.ts`（F3 已调 `Callouts.avoid`） |
| 悖论预告圈/线 | 外接框 | 硬 | `paradox.ts`（F3 已有） |
| 敌人预警图形 | line / circle / cone 外接框 | 硬 | `enemy.ts` 的 `teleLine/teleCircle/teleCone`（F3 已有） |
| **正在前摇的敌人** | 敌人框外扩 **48 px** | 硬 | Stage 遍历 `w.enemies`（`e.wind !== null`）|
| 敌方子弹 | 距任一玩家 ≤ 96 px：子弹框 + 4 → 硬；更远 → 软 | 硬/软 | Stage 遍历子弹 |
| 其他敌人（空闲） | 框 + 3 | 软 | `callouts.ts`（已有） |
| 印章 | `w.fx.stampBoxes()` | 硬 | `callouts.ts`（已有） |
| 木偶按键气泡 | 气泡框 + 4 | 硬 | Stage（`DemoDirector` 登记） |
| HUD 固定区 | 铭牌、钱袋/时钟、顶部区（有内容时）、底部区、首领血条 | 硬 | Stage 常量 + `Hud.podRect/areaRect` |
| 便条卡 | `hintsHooks.bottom()` 往上卡高（`Hints.active` 时） | 硬 | Stage |
| 最后一秒面板 | 中心 (320,132) 的面板框 | 硬 | Stage（`p.down.lastSecond > 0`） |
| 楼层卡 | 卡框（显示期间） | 硬 | Stage（只读 `GameScene.titleCard`） |
| 本帧已放的教学文字 | 先放的卡/字幕 | 硬 | Stage（并 `Callouts.avoidUi` 让术语框下一帧也避开） |

### 4.5 停靠选择算法

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
  // 1 黏住：上一帧的位置仍不碰硬障碍 → 不动（防跳）
  if (m && freeHard(cands[m.idx])) { m.blockedT = 0; return commit(req, m.idx, 1); }
  // 2 迟滞：被挡不足 0.15 s 且挡住它的不是玩家 → 先不动；挡住玩家 → 立刻换
  if (m) { m.blockedT += dtReal; if (m.blockedT < 0.15 && !ob.players.some((o) => hit(cands[m.idx], o))) return commit(req, m.idx, 1); }
  // 3 换位：先找"硬软都不碰"，再找"不碰硬"；换位后至少停 1.0 s（除非又挡住玩家）
  let idx = cands.findIndex((b) => freeHard(b) && freeSoft(b));
  if (idx < 0) idx = cands.findIndex(freeHard);
  if (idx >= 0) { memo.set(req.key, { idx, blockedT: 0, since: G.time }); return commit(req, idx, 1); }
  // 4 无处可放：关键提示退成铭牌芯片（铭牌是 HUD，永远可画）；非关键排队（计时暂停）
  if (req.critical) return chip(req);
  return null;
}
// commit：推入 placedThisFrame 并 Callouts.avoidUi(...)；换停靠时旧位置 0.1 s 淡出、新位置 0.1 s 淡入；
//         Stage.audit 记录本帧放好的框是否与任一硬障碍相交（应恒为 0）。
```

- **critical** = 教练 D1（L3/L2）、最后一秒附注、D12 拉回（与"挨打/倒地"直接相关的时间敏感提示）。
- 首领房：`candidates` 去掉被首领血条占用的 `bottom`；首领转阶段 4 s 内 tier B/C 一律返回 null。
- 序章与排练厅：舞台几何保证顶轨不与道具相交，算法照跑（兜底）。

### 4.6 注意力预算 tier 与仲裁

| tier | 内容 |
|---|---|
| **S** 关键 | 最后一秒面板与附注、教练 L3 卡、序章冻结引导卡、★ 便条（单人暂停卡） |
| **A** 重要 | 教练 L2 字幕、D4/D6/D9/D12、课程步骤与失败字幕、成功卡 |
| **B** 说明 | F3 世界术语框（单人 1 / 多人 2）、D7/D8、教练 L1 芯片、拒绝原因横幅、"这一课用 {@rewind}" |
| **C** 点缀 | D2/D3、轻节拍、多人共享白话行（S2 #9）、掌握提示（§6.10）、楼层卡 |

1. 单人同一时刻：**字幕轨 1 条**（最高 tier；同 tier 先来先显示）+ **术语框 ≤ 1** + 印章（合并后不限）。多人：每座位 1 条 + 共享轨 1 条 + 术语框 ≤ 2。
2. tier S 在屏：不开始新的术语框（已在屏的降到 50%）；便条不开新卡（`hintsHooks.busy`）；楼层卡 0.2 s 收起；tier B/C 暂停计时。
3. ★ 便条（单人暂停）在屏：教练与课程不出任何东西。
4. 印章永不被压制（它是反馈），但它是硬障碍：字幕和术语框绕开它。
5. **同一事实只说一次**：D4 字幕在屏 → `armed`/`paradox` 术语框 `supersedes`；D1 卡在屏 → `shadow` 术语框推迟（卡已说"旧影"）；课程与序章期间 F3 术语框整体静音（§2.0）。
6. 教学文字与便条：Stage 有 tier S/A 在屏时 `hintsHooks.busy()` 为真（包一层，不改 `hints.ts`）。

### 4.7 世界聚光 `SpotRef`

| 值 | 圈的位置 |
|---|---|
| `'shadow'` | `p.rewindPreview()` 的 (x, y)，r12 |
| `'shadowGain'` | 旧影头顶 `+N` 标签外接框 |
| `'hpStripe'` | HUD 血条青色斜纹段（`RewindHudHooks.rect('hpStripe', slot)`，F4a 在 `rewindHud.ts` 暴露） |
| `'tape'` / `'tapeNotch'` | HUD 磁带条 / 最近一道红刻痕（`RewindHudHooks.rect('tape'|'notch', slot)`） |
| `'sand'` | HUD 时砂数字（`RewindHudHooks.rect('sand', slot)`） |
| `'armed'` | 指定残响头顶 ◆ |
| `'preview'` | 当前 `Paradox.preview(p)` 圈 |
| `Entity` | 实体 AABB 外扩 6 px |

引线从卡片底边最近点出发；若直线穿过玩家 AABB，经偏移 16 px 的中点折一次。聚光时调用 `Terms.seen(id)`。

### 4.8 API（F4a，F4b 与 P7 只调用）

```ts
export interface SayOpts {
  key: string;                         // 同 key 替换
  text: L10n | string | (() => string);// 支持 {@action} 与 {n} 等占位
  vars?: Record<string, string | number> | (() => Record<string, string | number>);
  tier: 'S' | 'A' | 'B' | 'C';
  form?: 'card' | 'line' | 'success' | 'chip';
  slot?: number;                       // 多人：该座位停靠；省略 = 单人顶轨 / 多人共享轨
  who?: PromptDevice | null;           // 令牌的设备；默认 = slot 的 PlayerInput
  sub?: L10n; sub2?: L10n;             // 大卡第 2/3 行
  stamp?: L10n; why?: L10n; strip?: number;   // 成功卡
  timer?: () => number;                // 0..1 倒计时条
  dur?: number; until?: () => boolean;
  spot?: SpotRef | SpotRef[];
  footer?: L10n;
  pressed?: () => ReadonlySet<Action>; // 演示同步按下
  speaker?: 'ines' | 'sys' | number;
  critical?: boolean;
}
export const Stage: {
  say(o: SayOpts): { close(): void; update(o: Partial<SayOpts>): void };
  clear(key: string, slot?: number): void;
  busy(slot?: number, tier?: 'S' | 'A'): boolean;
  current(slot?: number): { key: string; text: string; dock: DockId; rect: [number, number, number, number]; alpha: number; tier: string } | null;   // 测试
  obstacles(): { hard: Box[]; soft: Box[]; players: Box[] };
  audit(): { frames: number; overlapFrames: number; worst: { key: string; with: string } | null };
  update(dtReal: number): void;        // HUD 组件 'caption'（order 90，同 id 替换 F3 的）调用；内部再调 Lessons.tick
};
```

### 4.9 逐条对照清晰度报告（本节负责的条目）

| 条目 | 问题 | 解法 | 依赖 / 状态 |
|---|---|---|---|
| **S1 #1** 术语框盖住玩家/敌人/预警/悖论预告 | `drawCallouts` 只避其他框 | F3：障碍、一次 1 个、背离侧、引线、无空位就等（已做）。F4：前摇敌人 +48 px、近身子弹、木偶气泡入表；tier S 时不开新框；课程期间整体静音；`Stage.audit` 进 CI | F3 修复轮 + F4a |
| **S1 #2** 教学房文字互相压 | 地刻 + 教练 + 横幅叠在一起 | 旧教学房退役（`tutorial.ts` 的地刻与 `RewindCoach` 删除，`?room=tutorial` 重定向到 `?scene=prologue&lesson=undo`）；新手走序章，所有教学文字只进停靠位；一课只放一种道具、一个敌人 | F4a |
| **S1 #3** 短擦带静默回 0 还扣砂 | — | ① 未教擦带前按住 = 轻按（§5.3）；② 教后教练 D8「退得不够远：再按久一点 → +{n}」；③ F3：预览常显 `+0`（灰）与「再往回 → +9」、刻痕闪烁 | F4a 闸门、F4b D8、F3 已做 |
| **S2 #6** 印章挡住爆炸、堆叠 | — | F3：印章放在爆炸半径上方、0.4 s 同组合并 ×N、连锁时只留顶部计数（已做）。F4：课程/教练成功只进字幕轨成功卡，不新增世界印章；印章是硬障碍 | F3 + F4a |
| **S2 #7** 青色斜纹无标签 | — | F3：`hpPromise` 白话牌 + 首几次与 `+N` 同步脉冲（已做）。F4：序章 L3 演示与尝试 A 字幕「血条上的青色 = 能拿回的血」+ 聚光 `hpStripe`；教练卡第 2 行「拿回 +{n} 生命」把数字和血条连起来 | F4a |
| **S2 #8** "−N" 两种意思、紫色无白话 | — | F3：锁定段写「🔒6」无负号、`drawTermLabel('fixed')`（已做）。F4：紫色第一次命中的清场课 `fixed` + 排练厅（§5.7） | F3 + F4b |
| **S2 #9** 多人没有白话 | — | F3：共享 Caption 白话行（已做）。F4：Stage 共享顶轨 tier C、前 3 间每间每词 1 次；教练与课程进座位停靠位 | F3 + F4a |
| **S2 #10** 完美回溯无白话、回报看不见 | — | F3：术语 `perfect`、`+100` 飞向时砂（已做）。F4：第 4 局 `perfect` 课 + 排练厅 ★ | F3 + F4b |
| **S2 #11** 行动珠倒数数字像伤害数字 | — | F3：改为缩小的 1 px 青环（已做）。F4：不再改；`sync` 课用这个环教"珠子缩完时一起砍" | F3 + F4b |

### 4.10 审计 `Stage.audit()` 与 `tools/stageaudit.cjs`

- 每帧：把本帧放好的每个教学框（字幕、卡、成功卡、芯片、座位卡、木偶气泡除外）与 `obstacles().hard` 求交，相交且 `alpha > 0.5` 记 1 帧，并记录 `worst = {key, with}`。
- `tools/stageaudit.cjs <shot.cjs 日志>`（F4a 新建）：读取各脚本末尾 `{"eval":"__tut.audit()"}` 的输出，任何 `overlapFrames > 0` 即失败并打印 `worst`。
- `?stagedebug=1`：画出硬障碍（红框）、软障碍（黄框）、四种停靠候选（青框）。

---

## 5. 渐进揭示阶梯（F4a `onboard/gates.ts`、`calm.ts`、`lessons/inrun.ts`；F4b `onboard/ladder.ts`、`lessons/advanced.ts`）

### 5.1 五条原则

1. **一次一件**：每个房间最多出现 1 个新动词或新词（课程、认出、便条共用这 1 个额度）。
2. **按做到开门**：每一阶的闸门 = 前置课已学会 ∧ 最早局数 ∧ 行为证据（`Stats('did.*')`）。局数只决定"最早"，从不单独开门。
3. **只在安静时刻教**（§5.5）；战斗中只允许即时教练（核心）与掌握提示（低优先级、事后型）。
4. **好奇心加速**：玩家按了没学的键（分岔）、在暂停页点了"清场后教我"、在死亡卡点了"去练"，对应课程排到队首。
5. **认出来就不再教**（§5.8）：自然打出 2 次 → 一行认可 + 打勾。

### 5.2 阶梯总表（默认节奏；`R` = `profile.runs`，`Flow.startRun` 递增后第 1 局 R = 1；`room` = 清场时的 `run.roomIndex`）

| 阶 | 动词（Teach id） | 名字（白话） | 在哪教 | 闸门（全部满足） | 最早 | 教之前 |
|---|---|---|---|---|---|---|
| S0 | `move` `attack` `dash` | — | 序章 L1–L2 | 新档 | 序章 | — |
| S0 | `undo` | 回溯（撤销刚才几秒 · 伤也撤销） | 序章 L3 | — | 序章 | 只能轻按 |
| S0 | `echo` | 残响（过去的你 · 会重复你做过的动作） | 序章 L4 | `undo` | 序章 | — |
| S0 | `paradox` | 悖论（碰到自己的残响 → 爆炸） | 序章 L5 | `echo` | 序章 | — |
| S1 | `fork` | 分岔（原地留下一个残响） | 清场课 §5.6.1 | `paradox` ∧ room ≥ 1（或被按键请求 → 下一个安静时刻） | R1 第 1 间清场 | **先解释再给用**（§5.3） |
| S2 | `scrub` | 擦带（按住回溯 · 自己选退多远） | 清场课 §5.6.2 | `fork` ∧ room ≥ 2 | R1 第 2 间清场 | **按住 = 轻按** |
| S3 | `sync` | 同步（两次攻击同时命中 → +50%） | 清场课 | `scrub` ∧ R ≥ 2 | R2 第 1 间清场 | 照常生效（印章 + 白话照 F3） |
| S3 | `culprit` | 元凶（打伤你的敌人 · 残响打它 +50%） | 清场课 | `sync` ∧ R ≥ 2 ∧（本局已上过 1 课时 room ≥ 3） | R2 第 3 间清场 | +50% 照常；**不画元凶标记、磁带白菱形、元凶术语框** |
| S4 | `tick` | 卡秒（攻击命中前一刻冲刺 → 反击） | 清场课 | `culprit` ∧ R ≥ 3 | R3 第 1 间清场 | 照常 |
| S4 | `chain` | 连锁（爆炸引爆其他残响 · 越连越痛） | 清场课 | `tick` ∧ R ≥ 3 ∧ `did.paradox ≥ 3` | R3 第 3 间清场 | 照常（顶部"连锁 ×N"照 F3） |
| S5 | `perfect` | 完美回溯（躲过一击 · 时砂全额返还） | 清场课 | `chain` ∧ R ≥ 4 ∧ `did.undo ≥ 10` | R4 第 1 间清场 | 照常 |
| S5 | `pierce` | 穿越悖论（冲刺穿过残响 → 直线爆炸） | 清场课 | `perfect` ∧ R ≥ 4 | R4 第 3 间清场 | 照常 |
| E | `fixed` | 定格伤害（回溯也拿不回的伤害） | ★便条 `fixed_hit`（P7）+ 下一个安静时刻 15 s 课 | 第一次受到 `info.fixed` 伤害 | 任意 | 紫色锁定段与"锁定"照常（安全信息） |
| E | `lastSecond` | 最后一秒 | 当场（停摆 1.5 s 大字 + 教练附注，§6.5 D11）+ 死亡卡 | 第一次生命归零 | 任意 | 照常（安全网从第 1 局就要有） |
| E | `recall` | 召回（按住分岔：残响飞回你身边） | 购买后第一个安静时刻 + 排练厅 | `mods.recall ≥ 1`（主发条 IV·中环） | 约 R3–R6 | 由主发条锁（GDD 已定） |
| E | `duet` `pullBack` `tandem` | 二重奏 / 拉回 / 合拍回溯 | 排练厅多人课 + P7"两根针"卡；拉回由教练 D12 当场教 | 第一次 ≥ 2 名真人 | 任意 | 照常 |
| P1 | `heavy` `interrupt` `break` `reverse` `tempo` | 重击/打断/破绽/逆弹/节拍 | 便条（P7）+ 排练厅"战斗"分组（P1 定义课程） | 各自首次触发 | R1–R3 | 节拍摆锤、破绽条在 `Teach` 之前不显示（GDD2 §9.8 规则 2） |

**每局课程上限**：R1 = 2 课（分岔、擦带）；R2–R4 = 2 课；R5+ = 0 门强制新课（只剩事件型）。未教完的课**顺延**：下一局第 1 间清场先上欠下的课。

> **对非协商项 4 与 10 的调和（裁决）**：第一局的**战斗**只用核心动词；分岔、擦带各作为一节"之后、一次一个"的清场课放在第 1、2 间清场后（每课 ≈ 25 秒），第一局不再引入任何其他动词。顺序取**分岔在先**：它直接延伸刚学的悖论（"能自己埋的炸弹"），趁热巩固序章最后一课；它的按键闸门也比擦带更显眼，早解开早好；擦带要看两道红刻痕与磁带光标，留给玩家已在实战中轻按过几次之后。参数 `LADDER.forkRoom = 1`、`scrubRoom = 2` 可调。

### 5.3 禁用 vs 不宣传（裁决）

**原则**：只限制"按了会出乎意料、看起来像坏了"的东西；"只会加分"的被动规则一律照常生效、只是不宣传（不上课、不出便条、不出掌握提示；GDD2 §9.8 规则 1 要求的首见白话照 F3 显示）。

| 动词 / 规则 | 教之前 | 理由 | 实现 |
|---|---|---|---|
| **擦带（按住回溯）** | **禁用：按住 = 轻按** | 清晰度报告 S1 #3/#4：新手的普通按键常持续 0.18–0.3 s，被判成擦带，退 0.1–0.4 s、花 25、回血 +0，结论"回溯坏了"——这是"不会用回溯"的头号根因。禁用后按任何时长都落在旧影，正是序章教的那件事；老玩家走跳过路径不受影响 | `Gates.tapOnly(p)` 为真时：`beginRewind` 末尾直接 `confirmRewind()`、`updateRewind` 不进入擦带（复用现有 `settings.rewindMode === 'tap'` 分支，`player.ts` 两处各加 `|| Gates.tapOnly(this)`）。教练 D9：按住 > 0.6 s 时终身前 2 次字幕「按住暂时等于轻按 · 擦带稍后教你」 |
| **分岔** | **先解释再给用**：每个房间第一次按只解释、**不扣时砂、不生成**；3 s 内再按一次照常分岔；同时把分岔课排到下一个安静时刻队首 | 键鼠 R 紧挨 Q、手柄 RB 紧挨 LB，误按率高；误按 = 凭空少 50（池子的 1/4）+ 冒出一个没解释的青色分身（清晰度报告 After forking #1）。B 稿"锁死"让好奇的玩家无从下手，C 稿"第二下就给"尊重好奇。综合：解释在先、第二下给用、课程随后就到；最多影响 1–2 间房 | `player.ts` 的 `fork()` 开头 `if (!Gates.forkAllow(this)) return false;`（两个调用点都经过 `fork()`；召回不受影响）。`forkAllow` 的实现：未学 `fork` ∧ 本房间本座位没在 3 s 窗口内 → 返回 false 并说 tier A 两行「这是 {@fork} 分岔：原地留个残响（−50）」/「再按一次就用 · 清场后详细教你」（en: "That's {@fork} Fork: leave an Echo here (−50)" / "Press again to use it · lesson after this room"），开 3 s 窗口，`Calm.request('fork','press')`。序章里分岔整体关闭（§2.0） |
| 召回 | 由主发条锁 | 无需新锁 | `mods.recall` |
| 同步 / 连锁 / 二重奏 / 合拍 | 不禁用，不宣传 | 是伤害规则不是按键；禁用会让"残响白打"的承诺忽大忽小 | F3 的印章与首见白话照旧；局末复盘点名（§6.10） |
| **元凶** | 不禁用，**不画标记** | 清晰度报告：元凶标记读作"急救标志"、"所以呢？"；在学会"让残响去打它"之前只是噪音 | `rewindHud.ts` 的元凶钟针、磁带白菱形、元凶术语框加 `Gates.shows(p,'culprit')`（= `Teach.has('culprit')` 或引导 ≠ 完整） |
| 卡秒 / 完美回溯 / 穿越 | 不禁用，不宣传 | 是时机奖励；"意外打出"正是最好的教学钩子（§5.8 认出） | F3 印章 + 白话照旧 |
| 最后一秒 | 不禁用，**从第 1 局就大声说** | 安全网；有砂却死掉会被认为不公平 | F2/F3 的 1.5 s"回溯！"+ 图标；教练 D11 附注；死亡卡 C1 |
| 拉回 | 不禁用 | 「按住 {@rewind} 拉回 Ⅱ」本身就是教学 | 教练 D12 |
| 紫色伤害 | 不可禁用（敌人属性），**不隐藏** | 安全信息 | 第一次受到时教 |

**谁受闸门约束**：引导设置 = 完整（默认）的槽 Ⅰ 存档；或自称新手的客人座位（§5.10）。`?bot=1`、`?onboard=skip|lite|off`、`run.config.mode ≠ 'standard'`（每日一秒、自定义种子、契约、加班）一律视为全部已学。**课程进行中**对本课玩家临时放开该课的动词（`LessonDef.verbs`）。跳过某课 = 动词照样开放（`Teach.mark(id + ':soft')`）。

### 5.4 HUD 与画面元素按阶段显隐（`Gates.hud(id, p)` / `Gates.shows(p, what)`）

| 元素 | 序章 | R1 | R2 | R3+ | 条件 |
|---|---|---|---|---|---|
| 血条红/青斜纹 + 磁带 + 时砂数字 | L3 起 | ✓ | ✓ | ✓ | 始终（序章 L1–L2 只有血条与冲刺点） |
| 青色斜纹白话牌 | 静音 | 首见（F3） | — | — | `Terms.showPlain('hpPromise')` |
| 轻按代价「200 (−100)」与旧影下 `−100⌛` | L3 起 | ✓ | — | — | F3：`Terms.showPlain('sand')`（前几次） |
| 紫色锁定段 + "锁定" | — | ◐ | ◐ | ◐ | 有定格伤害时（安全信息，不受阶梯控制） |
| 冲刺点 | ✓ | ✓ | ✓ | ✓ | 始终 |
| 特技表盘 | — | ✓ | ✓ | ✓ | 第一次用特技后带标注（P1） |
| 底部回忆槽 | — | 只画已装备的槽 | ✓ | ✓ | `R ≤ 1` 时空槽不画（清晰度报告"槽像锁住"）；P4 组件 `slots` 读 `Gates.hud` |
| 节拍摆锤 / 精英破绽条 / 擒纵器槽 | — | — | ◐ | ◐ | `Teach.has('tempo'|'break')`、拿到第一个擒纵器后（P1/P4 读 `Gates.hud`） |
| 旧影 + `+N` | L3 起 | ✓ | ✓ | ✓ | 始终 |
| 旧影白话框 | 静音（字幕代替） | 首见 4 s + 前 3 次受击（共 3 次） | — | — | §10.2 改动 6 |
| 残响路径 + 行动珠（青环倒数） | L4 起 | ✓ | ✓ | ✓ | 始终（F3 已去掉数字） |
| ◆ 就绪 + 悖论预告圈 | L5 起 | ✓ | ✓ | ✓ | 始终 |
| 元凶钟针 / 磁带白菱形 / 元凶框 | — | — | 元凶课后 | ✓ | `Gates.shows(p,'culprit')` |
| 世界术语框（F3） | 静音 | 只为已教或正在发生的词 | 同左 | 同左 | 同屏 ≤ 1（多人 ≤ 2） |
| 房间目标行 | — | 全部房 | 新房型前 3 次 | — | GDD2 §9.8 规则 3；P2 的 `objective` 组件，P2 落地前由 F4a 注册同 id 的最小版 |

### 5.5 安静时刻与调度 `Calm`（F4a `onboard/calm.ts`；F4b 的 `ladder.ts` 通过 `Calm.addRule` 增加 R2+ 规则）

`GameHooks.onRoomStart` 里给每个真实房间（`run.config.mode === 'standard'`，不含 `prologue`/`rehearsal`）挂一个 `CalmDirector` 实体，订阅本房间总线（换房间时总线已换新，不泄漏）。

**安静时刻** `isCalm(scene, p)`（每 tick）：
- 单人：`scene.cleared && 存活敌人 = 0 && !scene.boss && 没有打开的阻塞覆盖层（选卡/事件/暂停） && p.state === 'alive' && 清场后 ≥ 1.2 s`；或房型为 `rest` / `shop` 且进门 ≥ 1.5 s。
- 永不：首领房、宝库、楼层第一间清场前、`hintsHooks.busy()`、`G.scenes.transitioning`、伊妮丝便条在屏、本间"新东西额度"已用。
- 多人：每个座位独立判定（该座位没有打开的奖励面板）。

**调度**：安静时刻成立的那一帧依次检查：① 队首请求（按键 / 暂停页 / 死亡卡，`Calm.request(id, why)`）→ ② 欠下的课 → ③ `Calm.rules` 中第一个满足闸门且本局未达上限的课（F4a 注册 R1 的 fork/scrub；F4b 注册 R2+ 与事件型）→ ④ 认出（§5.8）→ ⑤ 都没有则什么也不做（安静本身就是奖励）。选中后 `Lessons.start(id, p, 'calm', new SoftHost(scene, p))`。

**推迟**：课程开始后玩家走进任一出口门框停留 1.0 s、暂停菜单"稍后再学"、或 25 s 未尝试 → `Flags.inc('onboard.postpone.' + id)`，门照常可用（**课程从不锁门**，门框上方 `small` 小牌「排练中 · 走进门 = 稍后再学」/「Rehearsing · walk in = later」）。推迟 2 次后不再在局内弹出，改为排练厅课程板该课挂"!"；闸门型动词（分岔、擦带）推迟 2 次后**自动解锁**（`Teach.mark(id + ':soft')`），避免玩家永远用不上。

**多人**：课程**自愿**：清场后在该座位停靠位显示「按住 {@interact} 学{x}（25 秒）」/「Hold {@interact}: learn {x} (25 s)」（0.6 s 按住开始），道具只对该座位与其残响有效（`prop.owner`）；不接受即当作推迟；队友照常走门（门的过半规则不变），学习中的座位看到「队友在等 · 走进门 = 稍后再学」。

### 5.6 第一局的两节清场课（F4a `onboard/lessons/inrun.ts`）

公共：`where: ['calm','hall']`；`sand: 'refill'`（每次尝试开始补满，课程结束退还本课花费）；道具在玩家面朝方向 48 px 处生成（离墙/坑 ≥ 24 px）；成功后 `Teach.mark`、排练厅 ✓、+3 碎片（§8.7）；对应便条（`fork_ready`、`scrub`）永久抑制（§5.11）。

#### 5.6.1 分岔课 `fork`（R1 第 1 间清场，或被按键请求后的第一个安静时刻）—— 约 25 s

| 项 | 内容 |
|---|---|
| 介绍（2.2 s） | 伊妮丝 **不挨打也能有残响：分岔。** / **An Echo without taking a hit: Fork.** + 第二行 `drawTermLabel('fork')`「分岔 — 原地留下一个残响」；页脚「走进门 = 稍后再学」 |
| 道具 | `GlassJar`（同 L5，罩内 **10 黄铜**，碎后真实掉落），在玩家前方 48 px |
| 演示（≈ 6.5 s，`FORK_DEMO`） | 木偶沿 L 形走 1.8 s 到钟罩旁 16 px，砍一刀（"叮"），按 `{@fork}`（气泡）→ 脚下出现 8 px 钟面记号、时砂 −50 → 木偶向外走开 40 px（1.0 s）→ 残响从 2 秒前的位置出发沿路线走来、砍一刀、停在记号上 → ◆ 亮 → 木偶走回去碰它 → 悖论，钟罩碎、黄铜弹出 |
| 演示字幕 | d1.8 **在钟罩旁按 {@fork}：脚下留个记号。** / **{@fork} beside the jar: it marks your spot.** · d2.1 **−50 时砂** / **−50 Sand**（聚光 `sand`）· d2.6 **2 秒前的你从这儿出发，走到记号。** / **You-from-2s-ago starts here and walks to the mark.**（聚光残响）· d4.2 **◆ 亮了 → 走回去碰它。** / **◆ lit → walk back into it.**（聚光 `armed`） |
| 尝试步骤 | ① **轮到你：在钟罩旁按 {@fork}。** / **Your turn: {@fork} next to the jar.**（`fork` 事件推进）→ ② **走开几步，等 ◆ 亮起。** / **Step away; wait for the ◆.**（该分岔残响 `echoArmed` 推进）→ ③ **◆ 亮了 → 走回去碰它。** / **◆ lit → walk back into it.** |
| 成功 | 钟罩被 `paradox` 打碎，且该悖论的 `e.echo.kind === 'fork'`。用回溯残响打碎也算成功，补一句 **也行！不过分岔不用挨打。** / **That works too! But Fork needs no hit.** |
| 失败 / 提示 | 残响驻留结束碎掉 → failBeat **慢了：◆ 亮了就走回去（它只等 {stand} 秒）。** / **Too slow: walk back once the ◆ lights (it waits {stand}s).** → 软重置回 ①；爆炸没碰到钟罩 → **在钟罩旁边按 {@fork}。** / **Press {@fork} right next to the jar.**；站在记号上 1.5 s 不动（重叠时不就绪）→ 提示 **先走开：站在上面它不会就绪。** / **Step off: it won't arm while you stand on it.**；分岔前没砍 → 提示（不算失败）**先砍一下：残响会重复你最近 2 秒。** / **Swing first: it repeats your last 2s.**。帮助等级 3：本课 `echoStandT` 1.5 s 并在字幕页脚注明「练习中残响多停一会儿」 |
| 成功节拍 | 印章 **分岔！** / **FORK!**；why **不回溯也能留下残响 · 花 50 时砂。** / **An Echo without rewinding · 50 Sand.** |
| 之后 | `Teach.mark('fork')`；闸门解开；HUD 分岔冷却小图标开始显示（P1） |
| 路由 | `?inrun=fork&seed=2&floor=0`（= `?lesson=fork&where=calm`：直接进入一个已清场的第 1 间并开课）；`?lesson=fork`（空房沙盒） |
| 盲测截图 | `R1_fork_press`、`R1_fork_walk`、`R1_fork_armed`、`R1_fork_success` |

#### 5.6.2 擦带课 `scrub`（R1 第 2 间清场）—— 约 25 s

| 项 | 内容 |
|---|---|
| 介绍（2.2 s） | 伊妮丝 **趁安静，再学一招：按住回溯。** / **While it's quiet, one more trick: hold rewind.** + `drawTermLabel('scrub')`「擦带 — 按住回溯 · 自己选退多远」 |
| 闸门 | 本课期间（INTRO → END）对本玩家 `Gates.tapOnly` 返回 false；成功时才 `Teach.mark('scrub')`；推迟则重新关上 |
| 道具 | 两枚 `FallingGear`，间隔 1.0 s 砸在玩家当前位置附近（第 1 枚脚下，第 2 枚移动方向前方 24 px），各 8 伤害 |
| 演示（≈ 5.5 s，`SCRUB_DEMO`） | 木偶走 1.6 s，连挨两下 → 按住 `{@rewind}` 1.0 s（气泡显示按住进度弧）→ 预览影沿路径倒退，磁带光标左移，预览头顶 `+0`（灰）→ 越过第 2 道刻痕 `+8 −38` → 越过第 1 道 `+16 −60` → 松开 → 落地 `+16` |
| 演示字幕 | d1.8 **连挨两下：磁带上两道红刻痕。** / **Two hits: two red notches on the Tape.**（聚光 `tape`）· d2.2 **按住 {@rewind}：预览影往回走。** / **Hold {@rewind}: a preview walks back.** · d2.8 **越过红刻痕 = 撤销那一下。** / **Pass a red notch = undo that hit.**（聚光 `tapeNotch`）· d3.4 **松开 → 落在预览影那儿。** / **Release → land on the preview.** · d4.0 **只退 1.8 秒：花 60，不是 100。** / **Only 1.8s back: 60 Sand, not 100.**（聚光 `sand`） |
| 尝试 | **轮到你：按住，看准了再松开。** / **Your turn: hold, release when it looks right.**；第一次按住时页脚 **按住时按 {@dash} = 取消，不花时砂** / **While holding, {@dash} cancels — no Sand spent** |
| 成功 | 一次擦带落地：`rewind.scrub && restored ≥ 8 && seconds ≤ 2.4` |
| 失败 | 轻按了 → **那是轻按（退满 3 秒）。这次按住。** / **That was a tap (full 3s). Hold this time.**；`scrub && restored === 0` → **松开早了：还没退过红刻痕。** / **Too early: not past the red notch yet.**（F3 的「再往回 → +N」此时可见）；`seconds > 2.4` → **退太远更贵：越过红刻痕就松。** / **Further costs more: let go just past the notch.**（第 2 次直接算成功）；不按 → 3 s 后重说并让令牌脉冲 |
| 成功节拍 | 印章 **擦带！** / **SCRUB!**；why **按住看预览 · 只退一点更省时砂。** / **Hold to preview — a short rewind costs less.** |
| 之后 | 前 3 次真实擦带时预览影下显示「松开 = 落在这里 · 冲刺取消」（F3 已做）；回溯模式恢复为设置值 |
| 路由 | `?inrun=scrub&seed=2&floor=0`；`?lesson=scrub` |
| 盲测截图 | `R1_scrub_notches`、`R1_scrub_hold`、`R1_scrub_cost`、`R1_scrub_success` |

### 5.7 进阶课与事件课（F4b `onboard/lessons/advanced.ts`；局内清场课与排练厅共用）

均为 INTRO / DEMO / TRY / SUCCESS 标准流程；坐标为相对玩家（局内）或排练台中心（§8.2）的偏移；文案全部 ≤ 18 字。

| id | 介绍 何时 / 为什么 | 示范要点 | 练习布置 | 尝试指令 | 成功条件 | 典型失败提示 | 成功章 · why |
|---|---|---|---|---|---|---|---|
| `sync` | 残响要砍的时候 / 两下同时命中 +50% | 木偶砍铃一下 → 回溯 → 残响路径上刀形珠的青环缩小，木偶站旁边，环缩到 0 时一起砍 →「同步」 | 双铃 `DuetBell`（两来源 0.25 s 内命中才响）@ (0,−24) | 「砍铃一下 → 按 {@rewind}」→「看刀形珠：环缩完时一起砍」 | `sync` 且 target = 铃 | 早了 →「早了：等环缩完」；晚了 →「晚了：环一缩完就砍」 | 「同步！」·「和残响一起打 · 第二下 +50%」 |
| `culprit` | 回溯之后 / 让过去的你去报仇 | 木偶挨木偶一拳 → 回溯 → 打它的木偶头顶红钟针 + 磁带白菱形 → 残响砍它，数字 ×1.5 | `PracticeDummy punch` @ (0,−24) | 「让它打你 → 回溯」→「残响去打红针的那个」 | 残响 `hit` 且目标 `culpritOf.has(slot)` | 回溯时没越过受伤刻痕 →「要退过红刻痕，它才会被标记」 | 「复仇！」·「残响打元凶 +50%」 |
| `tick` | 攻击快打到你时 / 时间变慢 + 下一击暴击 | 慢拳前摇最后闪白时冲刺穿过 → 白色钟环「TICK!」→ 反击 ×2 | `PracticeDummy slowPunch`（前摇 1.2 s，最后 0.18 s 闪白） | 「拳头闪白时按 {@dash}」 | `tickDodge` | 早了 →「冲早了：等它闪白」；被打中 →「晚了一点」 | 「TICK!」·「下一击必定暴击 ×2」 |
| `chain` | 两个残响挨着时 / 一起炸，越连越痛 | 分岔 → 走 2 格 → 再分岔 → 两个终点相距 32 px → 碰一个 →「连锁 ×2」 | 木偶 ×2 @ (±28,−28)；地面两个淡色落脚圈 @ (±16,0) | 「在两个圈里各放一个残响（{@fork}）」→「碰其中一个」 | `paradox` 且 `chain ≥ 2` | 相距 > 48 →「离太远：爆炸要碰得到另一个」 | 「连锁 ×2」·「每多一环 +25%」 |
| `perfect` | 确定要挨打的前一刻 / 时砂全退，残响镀金 | 慢拳最后闪白时轻按回溯 →「完美回溯」+ `+100` 飞回时砂 | `slowPunch` | 「拳头闪白时按 {@rewind}」 | `perfectRewind` | 早了 →「早了：等闪白」；被打后才按 →「晚了：要在打中前按」 | 「完美回溯」·「躲过一击 · 时砂全退」 |
| `pierce` | 残响和敌人在一条线上时 / 直线爆炸，还你一次冲刺 | ◆ 亮后冲刺穿过残响 → 96×20 直线爆炸打中后面的木偶 | 自动放一个分岔残响 @ (−32,0)，木偶 @ (48,0) | 「◆ 亮了 → {@dash} 穿过它」 | `paradox` 且 `kind === 'pierce'` | 走进去而非冲刺 →「是普通悖论：这次冲刺穿过」 | 「穿越！」·「直线爆炸 · 冲刺返还」 |
| `fixed` | 看到紫色时 / 紫色伤害只能躲 | 紫弹打中 −6，血条出现紫色锁段「锁定」；回溯后锁段仍在，旧影头顶「🔒6」 | `PracticeDummy violet`（紫弹 6 定格伤害） | 「挨一下紫弹，再回溯看看」 | 回溯时 `rewindPreview().locked > 0` | — | 「看懂了」·「紫色伤害：回溯拿不回」 |
| `lastSecond` | 生命归零的一瞬间 / 还能自救一次 | 木偶 HP 归零 → 世界 0.2× + 大字「回溯！」→ 轻按 → 回到旧影 | 排练厅专用：HP 设 5，木偶一拳 10 | 「归零后 1.5 秒内按 {@rewind}」 | `revived` 且 `source === 'self'` | 没按 →（排练厅不会死）「刚才那 1.5 秒按 {@rewind} 就能回来」 | 「自救！」·「倒下了也能撤销刚才几秒」 |
| `recall` | 残响在敌人另一边时 / 一路切穿再爆炸 | 两个残响在三个木偶后方 → 按住 `{@fork}` 0.4 s → 残响直线飞回切过木偶 → 召回悖论 | `LineDummies` + 两个落脚圈 | 「圈里放残响 → 站到另一边 → 按住 {@fork}」 | `paradox` 且 `kind === 'recall'` 且命中 ≥ 1 木偶 | 按太短 →「按住 0.4 秒：手上一圈亮满再松」 | 「召回悖论！」·「一路切穿，到你身边爆炸」 |

（`duet` `pullBack` `tandem`：排练厅多人课 §8.8；`heavy` `interrupt` `break` `reverse`：P1 定义，排练厅"战斗"分组。）

### 5.8 认出来就不再教（F4b）

- 对 `sync chain tick perfect pierce culprit recall duet` 统计自然次数 `Stats('did.<id>')`（只算真实局，不算排练厅与课程）。
- 某动词在被教之前自然次数 ≥ 2 → 下一个安静时刻**不开课**，改为字幕认可 3.0 s（tier C）「你刚才打出了 **{x}**！」/「You just pulled off **{x}**!」+ 第二行该词白话；`Teach.mark(id)`、排练厅 ✓、+3 碎片。
- 自然次数 = 1 且尚未到闸门：不提前教，局末复盘列出（§6.10）。

### 5.9 数据（**不改 `save.ts`**）

| 数据 | 存在哪 | 键 |
|---|---|---|
| 已学会 | `Teach`（`profile.taught[]`） | `move attack dash undo echo paradox fork scrub sync culprit tick chain perfect pierce fixed lastSecond recall duet pullBack tandem`；软解锁 `fork:soft` `scrub:soft` |
| 排练厅 ✓ / ★ | `Teach` | `hall.<id>` / `star.<id>` |
| 自然次数 | `Stats` | `did.undo`（`restored > 0` 的回溯）`did.scrub did.fork did.echoHit did.paradox did.sync did.chord did.culprit did.grandfather did.chain did.tick did.counter did.perfect did.pierce did.recall did.duet did.pullBack did.tandem did.lastSecond` |
| 教练（槽 Ⅰ） | `Flags` | `coach.lvl coach.self coach.coached coach.ignored coach.missed coach.slowmos coach.shown coach.rate coach.noSelfRuns coach.expireShown` |
| 推迟 / 跳过 / 首启 | `Flags` | `onboard.postpone.<id>`、`onboard.firstCard`、`onboard.skipped`（1 = 首启选了跳过） |
| 掌握提示 | `Flags` | `prompt.ignored.<id>`、`prompt.shown.<id>` |
| 死亡统计 | `Flags` | `death.by.<kind>`、`death.lastRun.<kind>` |
| 设置 | `settings.ts`（F4a 加字段） | `onboarding: 'full'\|'lite'\|'off'`（默认 full）、`coach: 'auto'\|'always'\|'off'`（默认 auto）、`coachSlowmo: boolean`（true）、`deathReplay: boolean`（true） |
| 多人客人 | 会话内 `SeatTeach: Map<slot, { novice: boolean; taught: Set<string>; coach: SeatCoach }>` | 不存档 |

### 5.10 跳过路径与"我会玩了"

| 入口 | 行为 |
|---|---|
| 首启卡 P0 选 B（§2.1） | `Onboard.skipAll()`：`Teach.mark` S0–S2 全部（`move attack dash undo echo paradox fork scrub`）+ `hall.undo/echo/paradox`；`profile.prologueDone = true`（**不发** 15 碎片）；`settings.onboarding = 'lite'`；教练 `coach.lvl = 0` |
| 设置「引导」 | **完整**（默认）：自适应教练、清场课、闸门、掌握提示、重复便条抑制、HUD 隐藏规则。**精简**：教练只在前 2 次可撤销受击出 L2；不开清场课（改为便条 + 课程板"!"）；闸门全部放开；掌握提示只留局末复盘与工坊今日一练；便条全部照 GDD2 §9.2；HUD 只隐藏节拍/破绽。**关闭**：无教练、无课程、无闸门、无掌握提示；便条只保留 ★ 安全类（`fixed_hit` `anchor` `downed`） |
| 设置「教练提示 / 教练慢动作 / 死亡回放」 | §6.12 |
| 暂停菜单（局内、工坊）「我会玩了（跳过教学）」 | 二次确认「关闭教练和课程？可在设置里恢复」/「Turn off the coach and lessons? You can undo this in Settings.」→ 同 `skipAll()`（不改 `prologueDone`） |
| 暂停菜单（序章中）「跳过序章」 | 二次确认「之后可在排练厅重玩」→ 同 P0 选 B，并记 `onboard.skipped = 1` |
| 每节清场课 | 走进门 1.0 s = 稍后再学；暂停菜单「稍后再学」；尝试阶段第 6 次失败后「先跳过这一课」 |
| 设置「重置教学进度」 | 二次确认「重新从头教？进度和奖励不受影响」→ 清 `Teach` 中的动词与 `:soft`（保留 `hall.*` `star.*` 与已发奖励）、`Flags` 的 `onboard.* coach.* prompt.*`；`prologueDone` 不变（序章可在排练厅重玩） |
| 客人座位（槽 Ⅱ–Ⅳ 热加入） | 加入横幅后头顶 5 s「第一次玩？按住 {@interact} 学 25 秒」/「First time? Hold {@interact} for a 25 s lesson」（0.6 s）：按下 → 该座位本会话 `novice = true`：自己的教练（从 L3 起）、自己的擦带/分岔闸门、在落地钟旁弹出一个木人上一节 `undo` 速成课（不阻塞别人）。不按 → 视为老手：教练从 L2 起、无闸门 |

### 5.11 与伊妮丝便条的去重（交接给 P7 的 `hintsData.ts`）

- F4a 导出 `Onboard.covers(hintId: string): boolean`。P7 在 `Hints.define` 时包一层 `when` 守卫：完整模式下 `armed_echo`★ `fork_ready` `scrub` `sync` `culprit` `chain` `tick_dodge` 在对应 `Teach.has(verb)` 或该课在队列中时**不显示**；精简模式照常显示。
- 序章期间、Stage 有 tier S/A 在屏时 `hintsHooks.busy()` 为真（F4a 包装）。
- `fixed_hit`★ 照常（它是第一次紫色伤害的即时安全提示），之后的 `fixed` 清场课补"示范 + 练习"。

---

## 6. 即时教练 Adaptive coach（F4b `src/game/onboard/coach/*.ts`）

### 6.1 目标与红线

**目标**：玩家在战斗里第一次、第二次、第三次需要回溯/残响/悖论/分岔的时候，屏幕上恰好有"现在按这个键，会发生这个"——然后随他学会而消失。

**红线**（违反任何一条即不合格）：
1. 教学文字**永不**覆盖任何玩家精灵（+8 px）、残响、悖论预告圈、敌人前摇/预警图形、近身子弹（全部走 Stage，§4）。
2. 教练**永不**让玩家多挨打：慢动作只在受击后的无敌时间内；教练从不暂停游戏。
3. 每条提示都带**当前设备**的按键令牌；多人用该玩家自己的设备与绑定。
4. 不对机器人座位（`input.kind === 'bot'`）出任何提示；`?bot=1` 默认教练关，除非 `?coach=` 显式打开。
5. 不改模拟的确定性：不碰 `world.rng`；计时用 `world.after/every`（模拟）与 Stage `update(dtReal)`（界面）；不用 `setTimeout`。慢动作只在有真人座位、教练开启时发生。

### 6.2 结构

```
GameHooks.onRoomStart ─► w.add(new CoachDirector(ctx))   // 每个房间世界一个实体（coach/coach.ts）
                          │ 订阅 bus: damaged rewind fork hit paradox echoArmed echoEnd downed revived custom
                          │ 每 0.1 s 轮询（world.every）：D4、D12 与机会过期
                          ├── SeatCoach[slot]      // 等级与计数（槽 Ⅰ 存 Flags，客人存会话）
                          ├── Opportunity[slot]    // 当前"可撤销受击"机会（§6.4）
                          ├── detectors[]          // D1–D12（coach/detectors.ts）
                          └── 通过 Stage.say(...) 申请位置与显示（coach 自己不画字）
CoachDirector.renderUnlit（世界层）─► 游丝光点、走向残响的箭头 »（细线图形，不是文字）
DeathTape + DeathCard（coach/deathTape.ts, coach/deathCard.ts）─► §9
```

序章 L6 与排练厅用**脚本模式**：`Coach.scripted(p, 'hit')` 强制下一次 D1 为 L3。课程进行中 `Coach.quiet(slot, true)`（教练对该座位静默，课程自己说话）。

### 6.3 等级与自适应

| 等级 | 名称 | 形态（Stage `form`） | 慢动作 | 停留 |
|---|---|---|---|---|
| **L3** | 满教 | **大卡**（tier S，critical）：标题「刚挨打？按 {@rewind} 撤销」（2× 令牌，按下动画）+ 第 2 行「拿回 +{n} 生命 · 花 {c} 时砂」+ 前 2 次第 3 行「你会回到身后的淡影（旧影）」+ 倒计时条；世界里：游丝光点从玩家流向旧影；`RewindHudHooks.pulse(p)` 让旧影 `+N` 与青色斜纹同步脉冲 0.4 s | 单人 `world.slowmo(0.3, 0.9)` + `G.audio.duck(0.5, 0.9)`；多人 `world.bubbles.push({ x, y, r: 72, scale: 0.4, dur: 0.6, owner: p })` | 到按下 / 机会过期；2.4 s 后若仍有效 → 收成 L2「还来得及：{@rewind} 撤销 +{n}」直到过期 |
| **L2** | 轻提示 | 一行字幕（tier A，critical）「{@rewind} 撤销这一下 +{n}」+ 倒计时条 | 无 | 到按下 / 过期 / 最长 1.8 s |
| **L1** | 芯片 | 铭牌芯片「{@rewind} +{n}」闪 3 下（tier B） | 无 | 1.2 s |
| **L0** | 关 | 无（死亡卡照常） | — | — |

计数（每座位）：`self`（自己撤销）、`coached`（提示在屏时撤销）、`ignored`（提示出了但机会过期）、`missed`（没出提示、机会过期）、`slowmos`、`shown`、`rate10`（最近 10 次机会的撤销率）；房间级 `roomPrompts roomIgnored roomMissed roomSlow`。

- **自己撤销** = 该座位 `rewind` 事件 `restored ≥ 5`，且按下时该座位**没有** D1 提示在屏（宽限期内按下也算）；擦带、完美回溯同样算。
- **提示撤销** = 按下时 D1 提示在屏（任一等级）。

| 条件（设置 `coach = auto`） | 变化 |
|---|---|
| 新档（完成序章） | 从 L3 起（序章 L3/L6 已各出一次，`shown = 2`） |
| `self ≥ 2` 或 `coached ≥ 3` | L3 → L2 |
| `self ≥ 4` | L2 → L1 |
| `self ≥ 6` 且 `rate10 ≥ 0.5` | L1 → L0 |
| 同一房间 `roomMissed ≥ 2` | 下一次 D1 **临时**升一级（最多 L3），用完回原级 |
| 本局死于"本可回溯"（死亡卡 C1/C2，§9.2） | 下一局开局 `lvl = max(lvl, L2)`；原为 L0 → L1 |
| 连续 2 局"可撤销受击 ≥ 4 且 self = 0" | 回到 L2 |
| `slowmos ≥ 6` | L3 不再慢动作（卡片照常） |

| 设置 `coach` | 行为 |
|---|---|
| `auto`（默认） | 上表 |
| `always` | 等级下限 L2；慢动作仍受 6 次上限与 `coachSlowmo` |
| `off` | L0；除死亡卡原因行外所有检测器关闭；死亡卡不自动回放 |

槽 Ⅱ–Ⅳ（客人）：会话内 `SeatCoach`；自称新手从 L3 起，否则从 L2 起；降级阈值减半（1/2/3）。

### 6.4 机会窗口 `Opportunity`

一次可撤销的受击 = 一个机会，直接从 F3 的真实数据算：

```ts
interface Opp { slot: number; tHit: number /* world.time */; gain0: number; prompted: boolean; visibleSince: number; graceLeft: number }
const GAIN_MIN = (p: Player) => Math.max(5, Math.round(0.1 * p.maxHp));   // 秒针 50 HP → 5；1–4 点擦伤不打扰
// 每 tick：
const pv = p.rewindPreview();
const remaining = pv.seconds - (w.time - opp.tHit);    // 旧影还要多久走过那次受击
const valid = p.state === 'alive' && p.canRewind().ok && pv.hpGain >= GAIN_MIN(p) && remaining > 0;
const frac = clamp(remaining / p.mods.tapeLen, 0, 1);  // 卡片倒计时条
```

- 时砂 ≥ 100 时 `pv.seconds = 3`，寿命 3 s；时砂少时旧影更近、寿命更短——倒计时条如实变短，教会"时砂少时窗口也短"。（磁带按 tick 录制，慢动作期间窗口按真实时间流逝；0.9 s 慢动作远小于 3 s。）
- 连续受击：同座位只保留一个机会，`tHit` 更新为最新一击，卡上 `+N` 与代价每帧刷新（读 `pv.hpGain` `pv.cost`）。
- 结束：`rewind` 事件（→ 提示撤销 / 自己撤销）、`valid` 变假（→ 过期）、玩家停摆（→ 交给 D11）。

### 6.5 检测器总表

| id | 名称 | 触发 | 前提 | 形态 / tier | 文案（zh / en） | 限制 |
|---|---|---|---|---|---|---|
| **D1** | 刚挨打 | bus `damaged` 且 `undoable` | 等级 ≥ L1；房间已进行 ≥ 1.0 s；本座位距上次 D1 ≥ 4 s；本房间 D1 < 4 且 `roomIgnored < 2` | 按等级（§6.3） | 见 §6.3 与 §6.6 | §6.8 |
| D2 | 错过 | D1 机会过期且曾提示 | 终身前 2 次 | 字幕 C，1.8 s，无声 | 那一下已过 {s} 秒，撤销不了了 / That hit is {s}s old — too late to undo | — |
| D3 | 残响白打（正反馈，W2） | bus `hit`，`info.src === slot*2+1` | `Stats('coach.echoHits') < 3`；本房间未出 | 字幕 C，1.8 s | 残响替你打中了 · 伤害白赚 / Your Echo landed a hit · free damage | 每房间 1 |
| **D4** | 残响旁有敌人却不引爆（W3） | 轮询：本座位某残响已就绪且未冷却；其 48 px 内 ≥ 1 存活敌人；`dist(p,e) ∈ [20,160]`；`calm(p)` | `did.paradox < 3` 或等级 ≥ L2 | 字幕 A + 世界箭头 »（p→e，1 px C3，3 个 » 以 0.5 s 周期流向残响） | 残响旁有敌人：走进残响 → 爆炸 / Enemies by your Echo: walk into it → boom；驻留快碎时：残响快碎了，现在走进去！ / Your Echo is fading — walk in now! | 每房间 1；自动模式终身 ≤ 3 |
| D6 | 时砂不够 / 够不到 | `damaged` 可撤销且 `canRewind().reason === 'sand'`；或 `ok` 但 `hpGain < GAIN_MIN` 而磁带 3 s 内有红刻痕 | — | 字幕 A，2.2 s | 时砂不够（{n}/25）：打敌人就能攒 / Not enough Sand ({n}/25): hit enemies to earn it；变体：时砂只够退 {s} 秒，够不到那一下 / Sand only reaches {s}s back — not that far | 每房间 1；终身 ≤ 4 / ≤ 2 |
| D7 | 拒绝原因"怎么办" | `custom rewindRefused/forkRefused`（F4a 在 `player.ts` 的 `refuse()/refuseFork()` 发） | 每种原因终身前 2 次 | 字幕 B 第二行，2.0 s | `sand`：打敌人攒时砂，残响打中也算 / Hit enemies for Sand — Echo hits count；`tape`：刚进门或刚回溯，磁带还短 / Just entered or rewound: the Tape is short；`anchor`：离开锁链圈，或打掉锚铃 / Leave the chains, or break the anchor bell；`burnt`：自救烧了磁带：{s} 秒后恢复 / Self-rescue burnt the Tape: back in {s}s | — |
| D8 | 擦带退太近 | `rewind {scrub:true, restored:0}` 且按下时机会有效 | `Teach.has('scrub')` | 字幕 B，2.2 s | 退得不够远：再按久一点 → +{n} / Not far enough: hold longer → +{n} | 每房间 1；终身 ≤ 3 |
| D9 | 未教动词的第一次按键 | `Gates.forkAllow` 拒绝 / 按住回溯 > 0.6 s 且 `tapOnly` | 未教 | 字幕 A | 见 §5.3（**由 F4a 的 `gates.ts` 直接说**，教练只计入本房间提示额度） | 分岔每房间 1；按住终身 2 |
| D11 | 最后一秒（单人） | 停摆最后一秒开始 / `revived {source:'self'}` | — | 附注 S（面板下方 4 px，`small` K9）；成功卡 | 倒下了也能回溯：撤销刚才几秒 / Even down, you can rewind: undo the last seconds；成功：印章 自救！/ SAVED!，why 磁带烧毁 6 秒，先躲开 / Tape burnt for 6s — stay clear | 附注终身 2；成功卡终身 3 |
| D12 | 队友倒地（多人） | bus `downed {player:q}`；对每个存活真人 `p ≠ q`：`p.lo.sand ≥ 100`、`dist ∈ (48,200]`、`q` 在拉回窗口（前 3 s） | — | 座位字幕 A（critical）+ 世界箭头 »（p 的槽位色） | {r} 倒了：靠近，按住 {@rewind} 拉回 / {r} is down: get close, hold {@rewind}；成功：印章 拉回来了 / PULLED BACK，why 他回到 3 秒前 / They're 3s back in time | 每次倒地 1；槽 Ⅰ 终身 5 |
| D5 *(可砍)* | 时砂满 20 s 没用 | 轮询 | 前 5 局 | 字幕 C | 已教分岔：时砂满了：按 {@fork} 分岔，留个帮手；未教：时砂满了，再攒就浪费：大胆用 {@rewind} | 每房间 1，每局 2 |
| D10 *(可砍)* | 反复死于同一敌人 | 该类敌人前摇且 ≤ 140 px | 上局死于它或终身 ≥ 2 | 字幕 B | 上次栽在{name}手里：挨打就按 {@rewind} / {name} got you last time: if it hits, {@rewind} | 每局每类 1 |

### 6.6 D1 详述（核心）

- **宽限期**（给会的人一个先出手的机会，现实秒、从顿帧结束算起）：`shown < 2` → 0.05 s；之后 L3 0.30 s、L2 0.45 s、L1 0.60 s。宽限期内按下 = 自己撤销，不出提示。
- **宽限期结束且 `valid`**：L3 → 慢动作（若 `world.timeScale === 1`、无其他气泡、`slowmos < 6`、`roomSlow < 2`、距上次慢动作 ≥ 10 s、`settings.coachSlowmo`）+ 大卡 + 世界效果 + `sfx('coachTick')`（很轻的木质"嗒"，−12 dB）+ `p.input.rumble(0.15, 0.25, 80)`；L2 / L1 见表。
- **慢动作中按下回溯**：回溯者用真实 dt（F3 `World.dtFor`），倒行不被拖慢；CoachDirector 在 `p.rw` 变为非空的那一帧把 `world.timeScale` 恢复为 1（`slowT = 0`）。
- `valid` 为假且原因是时砂 → 改走 D6。
- **成功**（提示在屏时 `rewind`）：`coached++`；`Beat.success({ p, stamp: '撤销！/UNDONE!', why: '伤撤销了 · 刚才的你变成残响再打一遍 / Hit undone · the you from then is now an Echo' })`；终身第一次加小字「这就是回溯：撤销刚才几秒 / That's rewind: undo the last few seconds」。
- **自己撤销**：`self++`；终身前 3 次轻节拍（无印章，字幕 C 1.6 s）「自己撤销了 · 就是这样！/ You undid it yourself — that's it!」；之后静默。
- **过期**：`prompted` → `ignored++`、`roomIgnored++`，走 D2；未提示 → `missed++`、`roomMissed++`。

### 6.7 慢动作规则（汇总）

- 只在 L3、只在 D1、只在受击之后（玩家本来就被打断了）。玩家受击后有 0.75 s 无敌（按玩家时间计），在 0.3× 下约等于 2.5 s 真实时间，**完全覆盖** 0.9 s 的慢动作——教练不可能让玩家在慢动作里再挨打。
- 单人 = 全局 `world.slowmo(0.3, 0.9)`；多人 = 只在该玩家周围 r72 的时间气泡 0.4× 0.6 s，队友与气泡外不受影响。
- 间隔 ≥ 10 s；每房间 ≤ 2；终身 ≤ 6（自动模式）；`coachSlowmo` 关则永不。
- 序章的"冻结引导"是另一种更强的工具（§2.0），只在序章与课程中使用。

### 6.8 限流、淡出与抑制

| 规则 | 值 |
|---|---|
| D1 同座位两次提示最小间隔 | 4 s（现实） |
| 每房间每座位"教练提示"（D1 D4 D6 D9 D12） | ≤ 4；D2 D3 与成功/轻节拍不计 |
| 同房间被无视 2 次 | 本房间不再出 D1（交给死亡卡） |
| 排队寿命 | tier C 4 s、B 3 s、A 2 s，过期丢弃（不计已显示） |
| 房间开头 | 前 1.0 s 不出（楼层卡、入场） |

**抑制条件**（任一成立即不出新提示；已在屏的 B/C 0.2 s 淡出，A 保留到结束）：`hintsHooks.busy()`（首领开场/转阶段）、`Hints.hold`；首领房只允许 L1 芯片与 D11；有阻塞覆盖层（暂停、选卡、事件、对话）、`G.scenes.transitioning`、★ 便条在屏；该座位 `p.rw`、`p.state !== 'alive'`（交给 D11/D12）、`p.anchorT > 0` 或磁带烧毁（交给 D7）；课程进行中；机器人座位。

`calm(p)`（D4 用）：160 px 内无敌人前摇；96 px 内无敌方子弹；`p.hp > 30% maxHp`；距上次受击 ≥ 1.5 s。

### 6.9 多人

| 项 | 规则 |
|---|---|
| 座位状态 | 每座位一份 `SeatCoach`；槽 Ⅰ = 存档（`Flags`）；Ⅱ–Ⅳ = 会话 |
| 提示位置 | 该座位 `seat` 停靠位，左侧 3 px 槽位色条 + 行首徽记；令牌 = `p.input`（自己的设备与绑定，分体键盘看到自己的键） |
| 慢动作 | 不改全局时间；只在他周围 r72 开 0.6 s 时间气泡 |
| 互不阻挡 | 教练从不暂停；座位停靠只在各自的角；共享顶轨只放共享信息（S2 #9 白话行） |
| 同时提示 | 4 个座位可同时各 1 条；共享轨 1 条；术语框 ≤ 2 |
| D12 拉回 | §6.5；进入 48 px 后由 `downed.ts` 自己的「按住：拉回 Ⅱ」接管，教练字幕消失 |
| 新加入的客人 | 加入横幅后，该座位 30 s 内第一次可撤销受击 → 至少 L2（即使槽 Ⅰ 是 L0） |

### 6.10 掌握提示 Mastery prompts（F4b `coach/mastery.ts`；回应"难以刻意打出组合"；可砍项 C4）

**四个出口**：A 局内机会提示（检测器命中，字幕 C 2.4 s，带令牌）；B 事后提示（刚错过，下一个安静时刻或 1.0 s 后无危险时）；C 局末复盘（死亡卡/结算区块）；D 工坊"今日一练"（排练厅拱门名牌下一行 + 课程板图钉）。

**节流**：A+B 合计每间 ≤ 1、每局 ≤ 3（R2+；第 1 局只允许分岔/擦带两种）、全局冷却 45 s；首领房开场 10 s 与转阶段、HP < 25%、字幕轨被占、便条在屏时不出。**只提示已学会（`Teach.has`）且 `did.<verb> < 3` 的动词**；提示后 10 s 内没打出 → `Flags.inc('prompt.ignored.<verb>')`，满 3 次不再局内提示该动词（只留 C/D）。

| 动词 | 机会谓词（每 0.2 s，用现有 API） | 文案（两行，zh / en） |
|---|---|---|
| `fork` | `canFork().ok` ∧ 无自己的残响 ∧ 1.5 s 内砍中过敌人 ∧ 该敌人仍在 40 px 内 | 还没在战斗里用过分岔 / 刚砍完？按 {@fork} 再砍一遍 · Haven't Forked in a fight yet / Just swung? {@fork} to swing again |
| `paradox` | `Paradox.preview(p)` 非空 ∧ 预告圈内 ≥ 1 敌人 | 敌人在圈里 / 走进残响 → 爆炸 · Enemy in the ring / Walk into your Echo → boom |
| `sync` | 自己某残响下一个攻击珠在 0.4–1.2 s 后 ∧ 珠位 20 px 内有敌人 ∧ 玩家距该敌人 ≤ 60 px | 还没打出过同步 / 环缩完时和残响一起砍 · No Sync yet / Strike as the bead's ring closes |
| `culprit` | 有 `culpritOf.has(slot)` 的敌人 ∧ 自己残响路径 1.5 s 内经过它 24 px 内 | 元凶在这 / 让残响去打它：+50% · There's your Culprit / Let your Echo hit it: +50% |
| `chain` | ≥ 2 个自己已就绪/将就绪的残响彼此 ≤ 48 px | 两个残响挨着 / 碰一个，两个一起炸 · Two Echoes together / Touch one, both go off |
| `pierce` | 已就绪残响在玩家与某敌人连线上（夹角 ≤ 15°，敌人在残响后 ≤ 80 px）∧ 有冲刺次数 | 敌人在残响后面 / 冲刺穿过残响 → 直线爆炸 · Enemy behind your Echo / Dash through it → line blast |
| `recall` | `mods.recall` ∧ ≥ 2 个已就绪残响 ∧ ≥ 2 个敌人在残响与玩家之间（宽 24 px 走廊） | 残响在敌人另一边 / 按住 {@fork}：飞回来切穿 · Echoes behind the enemies / Hold {@fork}: they fly back through |
| `scrub` | 1 s 内连挨两下 ∧ 还在磁带窗口内 | 只想退一点？/ 按住 {@rewind}，过了红刻痕就松 · Only need a little? / Hold {@rewind}, let go past the red notch |
| `duet` | 多人 ∧ 队友已就绪残响在 56 px 内 ∧ 附近有敌人 | 碰队友的残响 / 更大的爆炸 · Touch a friend's Echo / Bigger blast |
| 事后 `tick` | 被近战命中时有冲刺次数 ∧ 前摇曾闪白且玩家在 40 px 内 | 刚才拳头闪白时冲刺 / 就是卡秒（下一击暴击）· Dash when the strike flashes white / that's a Tick-Dodge |
| 事后 `perfect` | 回溯 `restored > 0` 且受击到按下 ≤ 0.35 s | 回溯够快！再早一点 / 打中前按 = 时砂全退 · Quick rewind! A hair earlier / before the hit = Sand refunded |

**局末复盘**（死亡卡与胜利结算都有，§9.3 的右下区块）：「这局你做到了：撤销 ×7 · 残响命中 ×23 · 悖论 ×3」「★ 第一次：分岔、擦带」「下局试试：{verb 的一句}」（来自"今日一练"算法：候选 = 已学 ∪ 下一阶；分数 = `3 − min(3, did)` + 上局有机会没打出 +1 + 死亡相关 +2 − 被忽略 3 次 −2；取最高）。

### 6.11 第一局第 1 间逐秒示例（单人、键鼠、刚完成序章：`shown = 2, coached = 1, self = 1`）

| 时刻 | 发生 | 屏幕 |
|---|---|---|
| 0.0 s | 进房 | 楼层卡 1.8 s（上三分之一，§10）；顶部目标行「清空敌人 → 选择下一扇门」 |
| 1.0 s | — | 教练可工作 |
| 6.20 s | 齿轮仔撞中 −14（顿帧 0.09） | 红色伤害数字；磁带红刻痕 |
| 6.29 s | D1：宽限 0.30 s 过去仍未按；L3 | 慢动作 0.3×（0.9 s）；顶轨大卡「刚挨打？按 [Q] 撤销 / 拿回 +14 生命 · 花 100 时砂」+ 倒计时条；游丝光点流向旧影；旧影 `+14` 与斜纹脉冲 |
| 6.9 s（现实） | 玩家按 Q | 卡片令牌按下动画后消失；倒带涟漪；慢动作结束 |
| +0.25 s | 落地 | 成功卡「撤销！」+ 嘀嗒 + 「伤撤销了 · 刚才的你变成残响再打一遍」 |
| +1.1 s | 残响重演攻击打中齿轮仔 | D3 排队（tier C，等成功卡结束）→「残响替你打中了 · 伤害白赚」 |
| +1.6 s | 残响 ◆ 就绪，齿轮仔在它 48 px 内，玩家在 90 px 外 | D4：「残响旁有敌人：走进残响 → 爆炸」+ 箭头 » 流向残响；`armed` 术语框被取代 |
| +2.4 s | 玩家走进残响 | F3 印章「悖论！」+ 成功卡 why「炸到了 · 残响就是你的炸弹 / Got them · your Echo is your bomb」 |
| … | 第二次挨打，玩家 0.2 s 内自己按了 | `self = 2` → 降为 L2；轻节拍「自己撤销了 · 就是这样！」，无卡 |

### 6.12 设置（F4a 加字段，F4b 在 `pause.ts` 的设置面板加行）

| 设置 | 选项 | 默认 | 菜单提示 `hint`（zh / en） |
|---|---|---|---|
| 引导 / Guidance | 完整 / 精简 / 关闭 | 完整 | 完整：清场后教新技巧、挨打时提示按键。精简：只留便条与排练厅。/ Full: new moves after fights, button prompts when hit. Light: notes and the Hall only. |
| 教练提示 / Coach prompts | 自动 / 总是 / 关闭 | 自动 | 挨打时提示回溯按键。自动：学会后淡出，忘了再出现。/ Shows the rewind button when you get hit. Auto: fades once you've got it, returns if you forget. |
| 教练慢动作 / Coach slow-motion | 开 / 关 | 开 | 头几次提示时让时间稍慢。/ Time slows briefly the first few times a prompt appears. |
| 死亡回放 / Death replay | 开 / 关 | 开 | 倒下时回放最后 3 秒，看回溯本可以怎么救你。/ Replays your last 3 seconds to show how a rewind could have saved you. |
| 重置教学进度 / Reset tutorial progress | 动作 | — | §5.10 |

URL 覆盖（本次会话，不存档）：`?coach=auto|always|off|L3|L2|L1|L0`、`?coachslow=0`、`?deathreplay=0`、`?onboard=full|lite|off|skip|fresh`。

---

## 7. 暂停菜单「回溯怎么用 / How rewind works」页（F4b `src/game/ui/rewindGuide.ts`、`src/game/onboard/loops.ts`、`src/game/onboard/loopPlayer.ts`）

### 7.1 入口与面板

- `Panels.register('rewindGuide', (args?: { who?: PlayerInput; focus?: number }) => new RewindGuidePanel(args))`。
- 入口：暂停菜单**第 2 项**「回溯怎么用 / How rewind works」（局内、工坊、排练厅、序章 L3 之后；F4b 改 `pause.ts`）；P0 页脚提示；死亡卡按钮（§9.3）；伊妮丝便条 `[Tab]` 跳转（`glossary: 'rewind'`，P7）；钟典"回溯"条目顶部按钮（P7）；排练厅课程板右上。
- 面板：`blocks = true`、`hidesNotes = true`；动画走真实时间（暂停中也播放）；按键图标一律用打开者 `who` 的设备族（多人 = 打开暂停的人）。

### 7.2 版式（逻辑 640×360）

**网格视图**（默认）：

| 区域 | 内容 |
|---|---|
| 背景 | 全屏 92% K0；`drawPanel('dark', 8, 6, 624, 348)` |
| 页眉 | **回溯怎么用** / **How rewind works**（`title`，B5，居中，y 12）；其下 `model1`/`model2`（`body`，K9，`maxW` 560，居中，最多 2 行）；再下 4 px 模型条（全亮） |
| 卡片网格 | 3 列 × 2 行。卡宽 196、列距 8、x0 = 18；卡高 = `6 + 72 + 4 + max_i(Rich.measureWrapped(caption_i,'body',184).h) + 6`，所有卡同高；行距 8；若两行卡 + 页眉超出 y 340，网格视图省略模型条 |
| 卡内 | 舞台 184×72（K1 底，3 行地砖）+ 一行 caption（`body`，含令牌）；对应动词**未教**时整卡 60% 亮度，右上角缎带「还没学 · 清场后教你」/「Not yet · after a fight」（局内）或「排练厅可学」/「In the Hall」（工坊），循环照常播放（主动打开的参考页，好奇不扣分） |
| 选中 | 2 px B5 边框；方向键 / 鼠标悬停移动 |
| 页脚 | `{@confirm} 放大 · {@special} 去练 · {@cancel} 返回`（`small`，K8，居中，底 y 352）。`{@special}`（Y / 右键）：在工坊 = 传送进排练厅并开这一课；在局内 = 「清场后教我」（`Calm.request(id,'guide')`）；在序章 = 不显示 |

**放大视图**（`{@confirm}` 或点击）：

| 区域 | 内容 |
|---|---|
| 标题 | 循环名（`title`，C3），y 10 |
| 舞台 | 2× 绘制（368×144），x 136..504，y 36..180 |
| 文案 | caption（`body`，K10，`maxW` 400，居中）；sub（`small`，K8）；按键行：该循环用到的每个键一个令牌 + 词（`轻按` / `按住` / `分岔`） |
| 翻页 | 左右 ◀ ▶；`{@tabL}` `{@tabR}` 或左右方向键；底部 6 个小点 |
| 页脚 | `{@tabL}{@tabR} 翻页 · {@cancel} 返回` |

### 7.3 `LoopPlayer`（关键帧小舞台；暂停页、排练厅幕布与课程板、死亡回放共用）

```ts
// src/game/onboard/loopPlayer.ts
export interface LoopDef { id: string; period: number; caption: L10n; sub: L10n; keys: { a: Action; word: L10n }[];
  actors: { id: string; kind: 'tick' | 'echo' | 'shadow' | 'preview' | 'cog' | 'dummy' | 'jar' | 'gear' | 'marker';
            track: { t: number; x: number; y: number; face?: 'l' | 'r'; alpha?: number; pose?: string }[] }[];
  events: { t: number; fx: 'num' | 'ring' | 'blast' | 'stamp' | 'glyph' | 'hp' | 'sand' | 'tape' | 'notch' | 'diamond' | 'previewCircle' | 'kept' | 'break' | 'unspool'; [k: string]: any }[] }
export const LoopPlayer: { draw(ctx: CanvasRenderingContext2D, def: LoopDef, t: number, x: number, y: number, o: { scale: 1 | 2; who?: PromptDevice; miniHud?: boolean }): void };
```

- 位置线性插值；`tick`/`echo` 的帧按速度选 idle/run 与朝向。
- **真实精灵、真实画法**：表针帧 `tickFramesFor(slot, HANDS.tick)`；残响 = 同一帧经残响着色（F4b 从 `echo.ts` 导出纯函数 `drawEchoFrame(ctx, spr, x, y, alpha, slotColor)`）；旧影 = `outlineOf(spr)` C3 虚线（F4a 从 `rewindHud.ts` 导出 `drawShadowOutline`）；齿轮仔 = `buildCogling()`；数字用伤害数字样式；印章用 `drawStamp`；按键用 `bigPrompt`。保证页面与游戏长得一样（风险 5）。
- UI 层：`imageSmoothingEnabled = false`，坐标 `r.snap`；放大视图 `ctx.scale(2,2)`。舞台坐标 184×72，脚底线 y = 56；末尾 0.4 s 淡出、开头 0.2 s 淡入。
- 舞台内只有数字与 ◆ 等符号可用 `tiny`；舞台内中文（如 **保留 ✓**）用 `small`。
- 文案中的数字从 `mods` 读（`{cost}`、`{stand}`、`{fork}`），GDD2 §3.12 改动时同步。

### 7.4 六个循环（逐帧）

**循环 1 · 撤销 Undo**（周期 4.4 s）
- 舞台左上迷你 HUD：血条 40×4 @ (6,6)，时砂 `200` @ (50,4)（`tiny`）。
- 0.00：表针 (36,56) 朝右；齿轮仔 (150,56) 以 20 px/s 向左滚；旧影未出现。
- 0.00–1.20：表针跑到 (108,56)（60 px/s）。0.40 旧影淡入（0.2 s），位置 = 表针 1.0 s 前的位置（循环里把"3 秒"压缩为 1 秒，文字仍写"3 秒前"）；1 px C3 40% 游丝连接旧影与表针。
- 1.20：齿轮仔撞上：表针白闪 2 帧、后退 4 px；`−12` 红字上浮 0.6 s；迷你血条 38 红 + 12 青斜纹；旧影头顶 `+12`（C3）。
- 1.30–1.80：舞台降到 0.25×；1.30 表针头顶 `{@rewind}` 2× 淡入；1.70 按下（下沉 + 圆环 r6→r12）；1.78 松开。
- 1.80–2.05：表针沿游丝倒行回到旧影 (48,56)，身边 r20 青色涟漪（30%），路径上 3 个 30% 残影。
- 2.05：落地：缩小的钟面环（r12→r6，0.5 s）；`+12` 青字；斜纹 0.15 s 转为红色填满；时砂 `200→100` 与 `−100`（C3）。
- 2.05–3.60：60% 透明残响从 (48,56) 沿同一路径走到 (108,56)（不强调）。3.60–4.40 停留，4.0 起淡出。
- caption：**挨打后按 {@rewind}：回到旧影，伤也撤销** / **Got hit? {@rewind}: back to your Shadow, damage undone**
- sub：**旧影 = 3 秒前的你 · 轻按退满 3 秒（100 时砂）** / **Shadow = you 3s ago · a tap goes the full 3s (100 Sand)**

**循环 2 · 残响 Echo**（周期 4.8 s）
- 0.00：表针 (40,56)；木人 (128,56)，头顶 6 格血条（50）。0.00–0.70：表针跑到 (110,56)。
- 0.75 / 1.05 / 1.40：三刀（武器弧精灵）→ 白字 12、12、22；血条 50→38→26→4。
- 1.60：木人起手（红扇形 0.4 s）→ 2.00 出拳：表针 `−8`。
- 2.10：`{@rewind}` 按下；2.15–2.40 倒行回 (40,56)；`+8`。
- 2.45：木人血条仍是 4，右侧 **保留 ✓**（G4，`small`）1.2 s；同时残响（青）在 (40,56) 出现，2.45–3.15 跑到 (110,56)。
- 3.20：残响第一刀 → 青字 `7`（主人色描边）→ 木人碎裂（B3/K6 碎片）。3.50 / 3.85 残响挥空第 2、3 刀；4.20 残响碎成青色玻璃。4.40–4.80 淡出。
- caption：**刚才的你变成残响，把动作再做一遍** / **The past you becomes an Echo and does it all again**
- sub：**你打出的伤害保留 · 残响也帮你攒时砂** / **Damage you dealt stays · Echo hits earn Sand too**

**循环 3 · 悖论 Paradox**（周期 3.6 s）
- 0.00：残响站在 (96,56)，头顶 ◆ 旋转 (96,34)，描边实线，脚下光环脉冲；齿轮仔 A (82,48)、B (112,62)；表针 (24,56)。
- 0.00–0.90：表针向右走（80 px/s）。0.45：距离 < 56 → 中点处 r48 C2 虚线预告圈；A、B 头顶 ▾。
- 0.90：接触：白闪 1 帧；爆环 r6→r48（0.25 s，C4→C2）；舞台顶部小印章 **悖论！**；A、B 各吃 `50`（青描边）并碎裂；残响化为玻璃碎片；`+20` 飞向迷你时砂。
- 0.90–1.40：表针 0.5 s 钟面无敌环。1.40–3.20 烟尘落定；3.2–3.6 淡出。
- caption：**◆ 亮了，走进残响 → 爆炸（悖论）** / **◆ lit? Walk into your Echo → explosion (Paradox)**
- sub：**冲刺穿过 = 直线爆炸 · 每次 +20 时砂** / **Dash through = line blast · +20 Sand each**

**循环 4 · 按住：选多远 Scrub**（周期 5.2 s）
- 舞台底部迷你磁带 60×5 @ (62,66)（青色格 + 光标）。
- 0.00：表针 (24,56)；磁带随走动填满。0.00–1.60：表针跑到 (144,56)（75 px/s）。
- 0.70：齿轮砸在 (76,56)：`−8`；磁带红刻痕 ①。1.30：第二个齿轮砸在 (121,56)：`−8`；红刻痕 ②。
- 1.70：`{@rewind}` 按下并按住（气泡进度弧 + 小字 **按住**）。
- 1.70–2.90：明亮预览影从表针处沿路径往回滑，磁带光标同步左移；预览头顶：x≈130 时 `+0 −25`（`+0` 灰），2.10 越过刻痕 ② → `+8 −38`，2.60 越过刻痕 ① → `+16 −60`，2.90 到 (64,56) → `+16 −68`。
- 2.90：松开（回弹）；表针 0.25 s 倒行到 (64,56)。3.15：落地 `+16`；时砂 `200→132`（`−68`）。3.15–4.80 残响从 (64,56) 走到 (144,56)（淡）；4.8–5.2 淡出。
- caption：**按住 {@rewind}：选退多远，松开就落地** / **Hold {@rewind}: choose how far, release to land**
- sub：**退得近更便宜 · 越过红刻痕才撤销那下 · {@dash} 取消** / **Shorter is cheaper · pass a red notch to undo it · {@dash} cancels**

**循环 5 · 分岔 Fork**（周期 5.0 s）
- 0.00：表针 (30,60) 朝右；钟罩 (120,52)。0.00–1.20：表针走 L 形：右到 (90,60)，再右上到 (112,50)（钟罩旁）。
- 1.20：`{@fork}` 按下；脚下 8 px 钟面记号；迷你时砂 `200→150`（`−50`）；残响在路径起点 (30,60) 出现，沿路径一串青色"解卷"小环。
- 1.20–1.60：表针向左下走开到 (88,66)。1.20–2.40：残响沿 (30,60)→(90,60)→(112,50) 走到记号；2.40 停住；2.80 ◆ 亮。
- 2.90–3.30：表针走回残响；3.10 r48 虚线预告圈（罩住钟罩）。3.30：悖论爆环；钟罩碎裂（玻璃碎片 + 一枚硬币弹出）。3.30–4.60 落定；4.6–5.0 淡出。
- caption：**按 {@fork}：原地留下残响，不用挨打** / **{@fork}: leave an Echo here — no hit needed**
- sub：**50 时砂 · 2 秒前的你走到记号处等你** / **50 Sand · you-from-2s-ago walks to the mark and waits**

**循环 6 · 时砂与磁带 Sand & Tape**（周期 4.6 s）
- 舞台上半部 1.5× HUD 铭牌：血条 80×6 @ (8,8)、磁带 90×5 @ (8,20)、`⌛⌛ 200/200` @ (104,18)；下半部 (40,60) 小表针、(120,60) 齿轮仔（1×）。
- 0.00–0.60：磁带从左到右填满（录制）；磁带上方 **磁带** 小字（`small`，K8）。
- 0.80：齿轮仔撞表针：血条青斜纹 10；磁带右端红刻痕，随后匀速向左滑（压缩为 1.5 s 滑完）。
- 1.30：`{@rewind}` 轻按：时砂 0.3 s 滚动 `200→100`、`−100`；一个 ⌛ 变空；血条回满；磁带右侧被切下的一段化成小青人飞向表针。
- 1.90–3.40：表针打齿轮仔三下（`12 12 22`）、残响打两下（`7 7`）；每次命中青色小点飞进时砂：`100→146→156`。3.40–4.20 停留；4.2–4.6 淡出。
- caption：**回溯花时砂，打中敌人就攒回来** / **Rewinding spends Sand; hitting enemies earns it back**
- sub：**磁带 = 最近 3 秒 · 红刻痕滑出前按回溯** / **Tape = your last 3s · rewind before a red notch slides off**

### 7.5 调试与测试

- `?scene=rewindGuide[&focus=1..6][&lang=en][&glyph=pad]`（在一个暂停的种子房上打开）。
- `__tut.guide = { open, view: 'grid' | 'focus', loop, seek(loop, t) /* 仅 CI */ }`。
- 截图：`guide_grid`；每个循环放大后 t = 0.6 / 1.8 / 3.2 三张（共 18 张）。

---

## 8. 排练厅 Rehearsal Hall（F4b `src/game/rooms/rehearsal.ts`、`src/game/ui/rehearsalBoard.ts`、`src/art/sprites/onboard.ts`）

### 8.1 入口（第一次进工坊就开放）

| 入口 | 实现 |
|---|---|
| 工坊西墙帷幕拱门（主要） | `GameHooks.onHub(scene => scene.world.add(new HallArch(x, y)))`（**不改 `hub.ts`**；位置由 F4b 在工坊截图中选西墙空位，避开工作站与落地钟）。拱门精灵 24×36（深红帷幕 + 黄铜门楣），`Interactable.range = 26`；名牌 `drawTermLabel('hall')`「排练厅 — 练习技巧 · 不会停摆」。有新课 / ★ 可领 / 死亡卡推荐时头顶黄铜"!"脉冲 |
| 工坊首访目标行 | F4b 经 `GameHooks.onHub` 注册：**去找伊妮丝** → **用碎片给主发条上弦** → **（可选）排练厅：随时回来练** → **走进大门：开始第一局**（en: Talk to Ines → Wind the Mainspring with your shards → (Optional) Rehearsal Hall: practise any time → Walk through the big door to start a run）；第 3 步时拱门发光 3 s |
| 死亡卡「去排练厅练：{课}」 | 结算后回工坊时直接传送进厅并打开该课 |
| 暂停页 `{@special} 去练` | 只在工坊 / 排练厅可用 |
| 调试 | `?scene=rehearsal[&lesson=<id>][&players=N]` |

进入 = `G.scenes.go(() => new GameScene(practiceRun, { kind: 'rehearsal' }), 'clock', 0.5)`；`practiceRun` 为 `mode: 'practice'` 的 `Run`（座位与武器取自工坊）；`RoomTypes.register('rehearsal', { combat: false, advancesRoom: false, weight: () => 0, build })`；`roomgen.ts` 分支 `kind === 'rehearsal'` → 内部 36×17、`plain`（F4a 在同一处改）。`scene.onDeath` 覆盖为"满血复活 + 字幕「排练厅里不会真的停摆」/「Nobody really stops in the Hall」"。退出拱门 → `Flow.hub('rehearsal')`（F4a 加的 context：不扣碎片、不计局数、出生在拱门前、不重播伊妮丝首访台词）。

### 8.2 布局（以地面中心为原点；内部 576×272 = x −288..288、y −136..136）

```
y −148 ┌────────────────── 北墙立面：课程板 Lesson Board (0,−148) 112×36 ─────────────────────┐
y −136 │ [灯]                                                                          [灯] │
       │  假人区               ┌──── 排练幕布 Curtain（LoopPlayer 投影）────┐      机关区        │
       │  ◯ 木偶A (−224,−80)   │  x −112..112  y −132..−20                  │  炮台 (224,−80)    │
       │                       └────────────────────────────────────────────┘   白芯弹           │
       │  ◯ 木偶B (−224,0)     ┌──── 排练台 Stage  x −112..112  y −12..100 ──┐  锚铃 (224,0)      │
       │  拉杆 回血/不回血 (−256,36) │  中心 S = (0,44)；黄铜钟环 r48            │                   │
       │  ◯ 木偶C (−224,80)    │  上课时玩家站在 S+(0,40) = (0,84)            │  摆刀轨 (192..256,80)│
       │                       └────────────────────────────────────────────┘                    │
       │[拱门 回工坊] (−280,32)        出生点 (0,116)          伊妮丝提词板 (128,116)             │
y  136 └──────────────────────────────────────────────────────────────────────────────────────┘
```

- **排练幕布**是世界道具（米色亚麻 + 黄铜卷轴）；平时循环播放课程板选中课的 `LoopPlayer`（UI 层，绘制在幕布矩形内，1×，184×72 居中）；上课时播放该课的循环作为背景提示（真正的演示由玩家本人的木偶在排练台上做，§3）。
- **排练台**：一节课开始时玩家被平滑移到 (0,84)，道具相对 S 放置；台外的自由练习道具在课程期间暂停（假人不攻击、炮台停火）。
- 镜头：房间大于视口时跟随玩家；主要元素都在中心 576×272 内。光照：工坊主题暖色，排练台上方一盏追光（`r.lightAt(S, 96, 'O2', 0.6)`）。
- 多人：排练台分左右两个半台（中心 (−56,44) 与 (56,44)），最多两人同时上课；第三、四人用假人区/机关区或等待（课程板显示「台上：Ⅰ 分岔 · Ⅱ 同步」）。

### 8.3 课程板 Lesson Board（`Panels.register('rehearsal')`，`ui/rehearsalBoard.ts`）

- 打开：在课程板前按 `{@interact}`；第一次进厅自动打开。面板 480×280，位于 (80,40)，`drawPanel('paper')`。
- 页眉：「排练厅 · 在这里不会停摆」/「Rehearsal Hall · nobody stops here」+ `model1`/`model2`（`small`，K7）+ 右上「回溯怎么用」按钮（打开 `rewindGuide`）。
- **左栏 220 宽：课程列表**，分组标题 + 行（行高 `max(18, Text.lineH('body') + 3)`，可滚动）：

| 分组 | 行（显示顺序） |
|---|---|
| 序章 Prologue | 序章《最后一分钟》（重玩，不发奖励） |
| 基础 Basics | 回溯（撤销）· 残响 · 悖论 · 分岔 · 擦带 |
| 连段 Combos | 同步 · 元凶 · 连锁 · 穿越悖论 · 召回 · 祖父悖论 |
| 时机 Timing | 卡秒 · 完美回溯 · 最后一秒 |
| 认识 Know | 定格伤害 · 时间锚（P2 道具就绪后） |
| 双人 Co-op | 二重奏 · 拉回 · 合拍回溯 |
| 战斗 Combat（P1 定义） | 重击 · 打断 · 破绽 · 逆弹 |

  每行：16×16 图标 · 名字（`body`）· 右侧两个 9×9 框 **✓**（学会）**★**（掌握）；锁住的行 60% 亮度 + `small` 原因：「第 {n} 局后」「先学：{x}」「主发条 IV·中环」「需要 2 名玩家」；"今日一练"行左侧黄铜图钉（§6.10）；死亡卡推荐的行左侧"!"。
- **右栏 236 宽：选中课详情**：`LoopPlayer` 184×72 · 名字 + 白话 · 「何时」「为什么」两行 · ★ 目标与奖励 · 页脚 `{@confirm} 开始 · {@special} 只看示范 · {@cancel} 返回`（多人取打开者的设备）。
- 导航：`G.input.nav`；多人时只读打开者的 `PlayerInput`。

### 8.4 一节课的流程（`LessonRunner` + `SoftHost`）

1. `{@confirm}` 开始 → 面板关闭 → 玩家移到 (0,84)，道具在排练台弹出（0.3 s），追光亮起。
2. INTRO 介绍卡（顶轨）→ DEMO（玩家本人的木偶在排练台上演，§3）→ 胶片擦除。
3. TRY：**时砂无限**（每 tick 补满；时砂数字旁 `∞ 练习` / `∞ practice`，HUD 的代价预览照常显示）；受伤照常（为了能练"撤销"），但 HP 低于 10% 时下一 tick 自动回满（`lastSecond` 课除外）。
4. SUCCESS：成功卡 + ✓ 打勾动画 + 奖励（§8.7）；随后字幕给 ★ 入口「再来：{★ 目标} · {@confirm} 试炼 · {@cancel} 回课程板」。
5. ★ 试炼：同布置，计数在字幕轨右侧「2 / 3」；失败不清零，只有 GDD 原有要求连续（如"3 个残响连锁"）。
6. 辅助：提词板可切「时间：100% / 50%」，50% 下 ★ 不计（✓ 照计）。

### 8.5 逐课规格（坐标为相对 S = (0,44) 的偏移）

| 课 | 解锁 | 道具布置 | ✓ 成功 | ★ 试炼（**G** = GDD2 §9.5 原 8 项） | ✓ 奖 | ★ 奖 |
|---|---|---|---|---|---|---|
| `undo` | 始终 | 木偶 punch @ (0,−24) | §2.4 尝试 A | 连续 3 次撤销且每次 `restored ≥ 8` | 序章已发 | 5 碎片 |
| `echo` | 始终 | 木桩 idle @ (0,−24) | §2.5 | 一次回溯让残响打出 ≥ 30 伤害 | 序章已发 | 5 |
| `paradox` | 始终 | 钟罩 @ (32,−16) | §2.6 | 一次悖论同时打中 2 个木偶 @ (±20,−24) | 序章已发 | 5 |
| `fork` | 始终（第一次进厅就能学，可先于第 1 局） | 钟罩 @ (0,−24) | §5.6.1 | 两次分岔悖论间隔 ≤ 6 s | 3 | 5 |
| `scrub` | `fork` 已学 | 两枚齿轮 | §5.6.2 | 3 次擦带，每次 `seconds ≤ 1.2` 且 `restored > 0` | 3 | 5 |
| `sync` | `scrub` ∧ R ≥ 1（厅里比局内早一局） | 双铃 @ (0,−24) | §5.7 | **G** 同步 ×3 | 3 | 10 + 外观「同步围巾流苏」 |
| `culprit` | `sync` | 木偶 punch @ (0,−24) | §5.7 | — | 3 | — |
| `grandfather` | `culprit` ∧ `fork` | 木偶 punch（HP 40，可击杀） | 悖论击杀元凶（`custom grandfatherParadox`） | **G** 元凶击杀 | 3 | 10 + 外观「祖父怀表挂件」 |
| `tick` | `culprit` ∧ R ≥ 2 | 木偶 slowPunch @ (0,−24)；或摆刀轨 | §5.7 | 卡秒 ×3 且其中 1 次接反击命中 | 3 | 5 |
| `chain` | `tick` | 木偶 ×2 @ (±28,−28)；落脚圈 @ (±16,0) | §5.7 | **G** 3 个残响连锁（`chain ≥ 3`）×2 | 3 | 10 + 外观「连锁钟摆尾迹」 |
| `perfect` | `chain` ∧ R ≥ 3 | slowPunch | §5.7 | **G** 完美回溯 ×3 | 3 | 10 + 外观「镀金残响面具」 |
| `pierce` | `perfect` | 分岔残响 @ (−32,0)，木偶 @ (48,0) | §5.7 | **G** 穿越悖论 ×2 且都命中木偶 | 3 | 10 + 外观「穿针剑穗」 |
| `recall` | `mods.recall`（否则锁："主发条 IV·中环"） | `LineDummies` @ (0,−8)…；落脚圈 @ (−64,−8)、(−64,24) | §5.7 | **G** 召回穿过 3 个敌人 | 3 | 10 + 外观「回旋发条」 |
| `fixed` | 第一次受到紫色伤害后（或 R ≥ 3） | 紫弹木偶 @ (0,−32) | §5.7 | — | 3 | — |
| `lastSecond` | 第一次停摆后（或 R ≥ 2） | HP 设 5；木偶一拳 10 | §5.7 | 两次最后一秒都成功 | 3 | 5 |
| `break` / `reverse` / `heavy` / `interrupt` | P1 定义 | 白芯弹炮台、精英假人 | P1 | **G** 破绽一个精英；**G** 逆弹 5 发 | 3 | 10 + 外观 |
| `duet` / `pullBack` / `tandem` | ≥ 2 名真人在厅里 | §8.8 | §8.8 | — | 3（每人） | — |

> 8 个 **G** 试炼与 GDD2 §9.5 一一对应，奖励沿用（10 碎片 + 外观）。✓ 奖励无论在哪里学会都只发一次（局内学会时在局末结算"学会奖励"里入账）。总量：✓ ≈ 17 × 3 = 51，★ ≈ 8 × 10 + 7 × 5 = 115 碎片（交 P6 经济复核，§10.2 改动 9）。

### 8.6 自由练习与伊妮丝提词板

- **假人区**：三个木偶，西侧拉杆切换「回血 / 不回血」（交互拉一下，名牌显示当前状态）。A 普通、B 会出拳（每 2.5 s）、C 慢拳。
- **机关区**：白芯弹炮台（P1 `?drill=reverse` 同款，交互开关）、锚铃（P2 时间锚，交互开关；P2 就绪后）、摆刀轨（卡秒练习）。
- **提词板**（交互打开 200×120 小面板）：「受伤：开 / 关」「时间：100% / 50%」「时砂：∞ / 真实」「敌人：无 / 齿轮仔 ×2 / 锡兵哨卫」（生成真实敌人做实战练习）、「重置教学进度…」（二次确认）。
- 装备已发现的回忆/武器/擒纵器（GDD2 §9.5）：留给 P7（从武器架/出发台读取已发现列表）。

### 8.7 奖励与反馈

- ✓：成功卡印章「学会了！」/「Learned!」+ `+3` 碎片飞向右上角（`profile.shards += 3; saveProfile()`；`Notices.push`）。
- ★：「掌握！」/「Mastered!」+ 外观解锁提示（`unlock('cos_<id>')`）；课程板该行 ★ 变金色。
- 局内学会的 ✓ 奖励在结算第一页"学会奖励"行汇总（P6 接手，F4 先记在 `Flags('onboard.pendingShards')`，回工坊时入账）。

### 8.8 多人课（`duet` `pullBack` `tandem`）

- 两名真人站在两个半台；任一人在课程板选课 → 另一人座位停靠位「按住 {@interact} 加入：二重奏练习」。
- `duet`：示范两个木偶各留一个残响，Ⅰ 碰 Ⅱ 的残响 → 双色大爆炸；成功 = `paradox` 且 `duet === true`。why「碰队友的残响 · 更大的爆炸」/「Touch a friend's Echo · bigger blast」。
- `pullBack`：把 Ⅱ 的 HP 设为 1 并让木偶击倒他（停摆），Ⅰ 在 3 s 内到他身边按住回溯 0.4 s；成功 = `revived` 且 `source === 'pullback'`。why「按住回溯：把队友拉回 3 秒前」/「Hold rewind: pull a friend back 3s」。
- `tandem`：两人 0.3 s 内先后确认回溯；成功 = 两个 `rewind` 事件时间差 ≤ 0.3 s。why「一起回溯 · 合唱残响 +30%」/「Rewind together · chorus Echoes +30%」。
- 单人时这三行显示「需要 2 名玩家」，`{@special}` 只看示范（LoopPlayer）。

---

## 9. 死亡卡与回放（F4b `src/game/onboard/coach/deathTape.ts`、`deathCard.ts`）

### 9.1 采样 `DeathTape`（渲染无关、只记数据，不影响模拟）

- **10 Hz 元数据环**（36 格 = 3.6 s，预分配，不每帧分配）：

```ts
interface TapeMeta {
  t: number;                                  // world.time
  cam: { x: number; y: number };
  hands: { slot: number; x: number; y: number; spr: Sprite | null /* 当帧精灵引用，不拷贝 */; flip: boolean;
           hp: number; maxHp: number; sand: number; state: string;
           shadow: { x: number; y: number; ok: boolean; gain: number; cost: number; seconds: number; spr: Sprite | null };
           reason: RewindRefusal | null; anchored: boolean; burnt: number }[];
  foes: { kind: string; x: number; y: number; spr: Sprite | null; flip: boolean; wind: boolean }[];   // 每只手 160 px 内，最多 6 个
  hits: { slot: number; amount: number; fixed: boolean; killer: string /* codexId */ }[];        // 本 0.1 s 内的 damaged
  rewinds: { slot: number; scrub: boolean; restored: number }[];
}
```

- **背景**：冻结时把世界层画布拷贝**一次**作为静态底图（F4b 第 1 天探针：在 `r.worldUi` 回调里 `drawImage(r.w.canvas)` 是否可用）；不可用则用 K1 底 + 地砖纹样。角色与敌人按录下的位置与精灵引用**重画**——不做 10 Hz 像素拷贝（C 稿原方案），所以没有 8 MB 内存与掉帧风险，回放始终锐利。
- **冻结**：单人致命一击（`damaged` 后 `hp ≤ 0`）再录 0.3 s 后冻结环；最后一秒自救成功 → 解冻继续录。多人：最后一个人停摆/出局时冻结。新房间、新局清空。
- `settings.deathReplay === false` 时不录（死亡卡仍出原因行）。

### 9.2 判定 `DeathSnap` 与用例（只说真话）

在冻结时对槽 Ⅰ（单人）或每个座位（多人）计算：

```ts
interface DeathSnap {
  slot: number; killer: string; killerName: L10n | null;
  best: { t: number; ago: number; gain: number; cost: number; shadowAgo: number } | null;   // 死前 0.3–3.5 s 内 ok 为真且 gain 最大的一帧
  lastSecond: { offered: boolean; pressed: boolean; sand: number; gain: number } | null;
  reason: RewindRefusal | null;      // 致命时 canRewind 的拒绝原因
  lethalFixed: boolean;              // 致命一击为定格伤害
  scrubShort: boolean;               // 死前 3.5 s 内有 scrub 且 restored == 0，而当时 gain ≥ 5
  mateCould: number | null;          // 多人：死前 3 s 内某队友在 200 px 内且时砂 ≥ 100（该队友槽位）
  repeat: number;                    // Flags('death.by.' + killer)（含本次）
}
```

取第一个成立的作标题行（C2 与 C1 同时成立时见"第二行"）：

| # | 条件 | 标题行（`body`，C4，富文本） | 第二行（`small`，K8） | 去练 |
|---|---|---|---|---|
| **C2** 早该撤销 | `best && best.gain ≥ 5 && 之后没有回溯` | **你死前 {s} 秒有 +{n} 可以拿回：按 {@rewind}** / **{s}s before the end, +{n} was yours to take back: {@rewind}** | C1 也成立：「倒下后那 1.5 秒按也来得及」/「Pressing in that last 1.5s would have worked too」；否则 `model1` | 撤销 |
| **C1** 最后一秒没按 | `lastSecond.offered && !pressed` | **倒下后那 1.5 秒，按 {@rewind} 就能撤销** / **In that last 1.5s, {@rewind} would have undone it** | 你还有 {sand} 时砂，回到 3 秒前能拿回 +{n} / You had {sand} Sand: going back 3s gave +{n} | 最后一秒 |
| C3 时砂不够 | `reason === 'sand'` | 时砂只剩 {sand}（回溯至少要 25） / Only {sand} Sand left (a rewind needs 25) | 打敌人攒时砂；残响打中也算 / Hit enemies to earn Sand — Echo hits count | 残响 |
| C4 磁带烧毁 | `reason === 'burnt'` | 磁带烧毁时不能回溯（自救后 6 秒） / A burnt Tape can't rewind (6s after a self-rescue) | 自救后先躲开，等磁带冷却 / After a self-rescue, keep clear until it cools | 最后一秒 |
| C5 时间锚 | `anchored` | 你在时间锚里：锁链圈内不能回溯 / You were in a time anchor: no rewinds in the chains | 先离开圈子，或打掉锚铃 / Step out, or break its bell first | — |
| C6 紫色 | `lethalFixed` | 紫色伤害撤销不了 / Violet damage can't be undone | 看到紫光就冲刺躲开 / See violet? Dash out of it | 定格伤害 |
| C7 擦带太近 | `scrubShort` | 退得太近了：按住久一点能退更远 / Not far enough back: hold longer to go further | 磁带上的红刻痕要退过去才算撤销 / Rewind past the red notch to undo that hit | 擦带 |
| C8 其他 | 以上都不成立 | 按敌人给针对性提示（GDD2 §9.6 的表由 P2/P7 提供；如齿轮仔「齿轮仔蓄力后会直冲：侧向冲刺躲开」） | 这次来不及回溯：先拉开距离，攒点时砂 / No time to rewind: make space, build Sand | 撤销 |

- 所有"本可以"都来自当时采样的 `canRewind().ok` 与 `rewindPreview().hpGain`（F3 真实接口，已考虑坑、锚、烧毁、定格），**不推测**；数据不全（录像关、刚进房）→ C8。`{s}` = `best.ago` 取 0.5 s 步进（「2 秒」「1.5 秒」）。
- **反复死亡**：`repeat ≥ 2` → 加一行（`small`，R4）「第 {k} 次栽在{name}手里」/「{name} has stopped you {k} times」+（`small`，B5）「去排练厅练「{lesson}」」/「Practise "{lesson}" in the Rehearsal Hall」。写 `Flags.inc('death.by.' + killer)`、`Flags.set('death.lastRun.' + killer, profile.runs)`。
- **多人** `mateCould`：在**那名队友**的那一行第二行写「{r} 倒下时，你靠近按住 {@rewind} 能拉回」/「When {r} fell, getting close and holding {@rewind} would pull them back」（教的是队友）。
- 等级联动：C1/C2 → §6.3"死于本可回溯"规则。

### 9.3 版式（游戏场景内；所有人出局后 0.8 s 出现，覆盖在冻结的世界上）

> 实现为 HUD 组件 `Hud.register({ id: 'deathCard', area: 'top', order: 99 })`，在 `w.players.every(Down.isOut)` 后绘制全屏卡；`game.ts` 现有逻辑（`deathT > 2.4` 后按确认/攻击进入结算）不变。`game.ts` 自己的停摆暗幕保留，若它在同一区域画文字，F4a 在 `game.ts` 里加 `if (Onboard.deathCard.active()) 跳过该文字`（F4a 拥有本包对 `game.ts` 的改动，F4b 填 `Onboard.deathCard`）。

```
y 0–360 全屏 70% K0 底
y 34   「是什么让你停下」/ "What stopped you"（body，R3，居中）
┌──── 回放面板 x36..360 / y56..240（320×180 + 4 px 'dark' 边框）────┐   右栏 x376..612
│ 磁带回放 / Tape replay（small K8，左上内侧）                     │   y62  敌人精灵 2×（drawPixelArt）+ 名字（body）
│   （冻结在"该按的那一帧"：旧影虚线轮廓 + "+22"）                  │   y100 标题行（body C4，富文本，maxW 236，≤ 2 行）
│                                              −2.0s（5×7 数字）  │   y136 第二行（small K8，maxW 236）
└────────────────────────────────────────────────────────────┘   y162 反复死亡行（small R4，可选）
                                                                    y178 去排练厅（small B5，可选）
y 248  模型条（全亮；C1/C2 时点亮的第 ①② 格脉冲）                     y196–240 局末复盘（§6.10，small K8，3 行）
y 268  {@rewind} 看回溯怎么救你 / {@rewind} See how rewind could save you      {@confirm} 继续 / Continue（deathT < 2.4 时灰显并有进度细条）
y 286  {@special} 回溯怎么用 / How rewind works（打开 rewindGuide，focus 1）
```

- 全部在 UI 层；标题 12 px、附注 10 px；无 `tiny` 中文。键盘玩家看到 `[Q]`（纯键盘玩家按过 L 则 `[L]`），手柄 `[LB]`。
- `deathReplay` 关：面板换成冻结帧静态图 + 注解，没有"看回溯"按钮。

### 9.4 回放时间线（3.6 s，现实时间；面板内用 `LoopPlayer` 同款画法重画）

设 `f*` = `best` 那一帧（C1 无 C2 时用致命前 0.2 s 那帧），`fa` = `f*` 前 1.2 s，`fs` = 旧影所在帧（`f*` 前 `best.shadowAgo` 秒，夹在环内）。

| 时间 | 画面 | 注解（UI 层，坐标经 `cam` 换算到面板） | 声音 |
|---|---|---|---|
| 0.0–0.3 | 从静态 `f*` 淡到 `fa` | — | — |
| 0.3–1.5 | `fa → f*` 正放（10 Hz 帧，位置插值） | 玩家脚下槽位色环；受击帧红框闪 0.1 s + 伤害数字；旧影：`drawShadowOutline(shadow.spr)` + `+N`（C3，随帧更新） | 受击帧 `hurt` 低音量 |
| 1.5–2.0 | 冻结 `f*` | 面板中央 2× `{@rewind}` 按下两次；面板底部字幕「这时按 {@rewind}」/「Press {@rewind} here」 | `rewindHold` |
| 2.0–2.6 | `f* → fs` **倒放**（3 倍速） | 以玩家为圆心的 C3 涟漪圈（扫描线、圈外降饱和 30%，面板内实现）；玩家沿录像退回 | 每帧 `tapeClick` |
| 2.6–3.6 | 冻结 `fs` | 缩小的 12 刻度落地环；大号 `+N`（`title`，C3）；印章「撤销！」；底部「回到 {s} 秒前 · 生命 {a}→{b}」/「Back {s}s · health {a}→{b}」 | `rewindLand` + `lessonPass` |
| 之后 | 保持 | 再按 `{@rewind}` 重播 | — |

- **第一次死亡**（终身）自动播放一次；之后需按 `{@rewind}`——死后第一件事就是亲手按一次那个键。
- 诚实性：回放只展示**发生过的位置**和"倒回旧影"——这正是回溯做的事；不伪造"撤销之后"的未来。
- 多人：面板缩放到能装下所有手（最多 0.5×）；每个座位的旧影与 `+N` 用槽位色；`{@tabL}`/`{@tabR}` 切换讲解的座位。

### 9.5 与最后一秒、拉回的衔接

- 单人：最后一秒 1.5 s 是"死前的最后机会"；死亡卡 C1 明确提到它，让玩家下次知道"倒下了还能按"。教练 D11 在面板下附注「倒下了也能回溯：撤销刚才几秒」。
- 自救成功后 6 s 内再死 → C4（D11 成功卡已预告"先躲开"）。
- 多人：见 §9.2 `mateCould`；教练 D12 在倒地当场提示。

### 9.6 交接给 P6

结算第一页（`summary.ts`，P6）沿用同一 `DeathSnap` 标题行与局末复盘区块（`DeathCard.lastSnap()` 只读），并显示"学会奖励"行；F4 不改 `summary.ts`。

---

## 10. F3 遗留的清晰度修复清单（清晰度报告逐条裁决）

> "F3 修复轮"= 正在进行的任务 #65/#66（代码在工作树、未提交）。F4 开工时以 v2-F3 为准逐条复核；标 **GDD** 的条目改变了 GDD2 的数值或行为，裁决见 §10.2。

### 10.1 逐条

| 条目 | 问题 | F3 修复轮状态 | F4 裁决 / 动作 | 负责 | GDD |
|---|---|---|---|---|---|
| S1 #1 | 术语框盖住玩家/敌人/预警/预告 | 已做：`callouts.ts` 障碍、一次 1–2 个、背离侧、引线、等待；预警与预告调用 `Callouts.avoid` | 补：前摇敌人 +48 px、近身子弹、木偶气泡入表；tier S 不开新框；课程期间静音；`Stage.audit` 进验收（§4） | F4a | — |
| S1 #2 | 教学房文字互相压 | 任务 #66：字幕轨、地刻靠近淡化、第二只敌人等第一次回溯 | 教学房退役：删除地刻与 `RewindCoach`；`'tutorial'` 房型保留（权重 0）供回归；`?room=tutorial` 重定向 `?scene=prologue&lesson=undo`；新手走序章（§2） | F4a | — |
| S1 #3 | 短擦带静默回 0 还扣砂 | 已做：预览 `+0`（灰）、「再往回 → +N」、刻痕闪烁、斜纹点线框 | 未教擦带前按住 = 轻按；教后教练 D8 | F4a / F4b | **GDD**（改动 5） |
| S1 #4 | 普通按键被当成擦带 | 已做：`TAP_GRACE_BACK = 0.35`（光标走过 0.35 s 前松开仍算轻按） | **批准**：轻按判定写入 GDD2 §3.2/§3.12 | — | **GDD**（改动 1） |
| S1 #5 | 轻按代价没提前显示 | 已做：「200 (−100)」+ 沙漏闪烁 + 旧影下 `−100⌛`（前几次） | 序章 L3 演示「代价：100 时砂（退了 3 秒）」+ 聚光 `sand`；教练卡第 2 行实时「花 {c} 时砂」；暂停页循环 1/6 | F4a / F4b | — |
| S2 #6 | 印章挡住爆炸、堆叠 | 已做：印章在爆炸上方、0.4 s 同组合并、连锁时安静 | 课程/教练成功只进字幕轨成功卡，不新增世界印章；印章是 Stage 硬障碍 | F4a | — |
| S2 #7 | 青色斜纹无标签 | 已做：`hpPromise` 白话牌 + 与 `+N` 首几次同步脉冲 | 序章 L3 字幕「血条上的青色 = 能拿回的血」+ 聚光 `hpStripe`；教练卡「拿回 +{n} 生命」；暴露 `RewindHudHooks.pulse` | F4a | — |
| S2 #8 | "−N" 两种意思、紫色无白话 | 已做：锁定段「🔒6」无负号、`drawTermLabel('fixed')` | 第一次紫色命中后的 `fixed` 清场课 + 排练厅 | F4b | **GDD**（改动 3） |
| S2 #9 | 多人没有白话 | 已做：共享 Caption 白话行 | Stage 共享顶轨 tier C（前 3 间每间每词 1 次）；教练与课程进座位停靠位 | F4a | — |
| S2 #10 | 完美回溯无白话、回报看不见 | 已做：术语 `perfect`、`+100` 飞向时砂 | 第 4 局 `perfect` 清场课 + 排练厅 ★ | F4b | — |
| S2 #11 | 行动珠倒数数字像伤害数字 | 已做：缩小的 1 px 青环 | `sync` 课用"环缩完时一起砍"教它 | F4b | — |
| S3 | 按下瞬间旧影变淡 | 已做（按住阶段旧影保持明亮直到开始擦带） | — | — | — |
| S3 | 旧影白话永远写"3 秒" | 已做：`shadowLive`「{s} 秒前的你 · 回溯会回到这里」 | — | — | — |
| S3 | 白话措辞：就绪 / 元凶 / 英文时砂 / `tutFork` 代价 | 已做（`armed`「◆ 出现后碰它 → 爆炸」、`culprit`「打伤你的敌人 · 残响打它 +50%」、Sand「Energy for rewind & Fork」、`tutFork` 带 50） | `tutFork` 随教学房退役不再使用 | — | — |
| S3 | 元凶标记像急救标志 | 已做：深色标签 + 红钟针 | 第 2 局元凶课之前**不画**（+50% 照常） | F4a | **GDD**（改动 6） |
| S3 | 旧影白话框计时（每房间前 12 s、前 3 房间） | 未改 | **裁决**：首见 4 s，之后只在受击（出现 `+N`）时再出，共 3 次；课程期间静音 | F4a（`rewindHud.ts`） | **GDD**（改动 7） |
| S3 | 多人游丝全青且横穿房间 | 已做：槽位色 30%，远时只画最后 1 s | — | — | — |
| S3 | 未解释的小记号（"?" 嘲讽气泡、刻痕/白菱形含义、沙漏不反映部分花费） | — | 暂停页循环 6（磁带/刻痕/时砂）；"?" 与白菱形进钟典（P7） | F4b / P7 | — |
| F3 外 | 楼层卡太长太大，刷怪时遮住上半屏（`z6_b`） | — | 按 GDD2 §9.4 实现：总时长 1.8 s（淡入 0.2 / 淡出 0.3），只占屏幕上三分之一（y 46..110）；tier S 在屏时立刻 0.2 s 收起 | F4a（`game.ts` 只改 `renderTitleCard` 与常量） | （GDD 已定） |
| F3 外 | 左下动作槽暗、没按键图标 | — | 第一局空槽不画（`Gates.hud('slots')`）；按键图标交 P1/P4 | F4a / P1 | — |
| F3 外 | "• • ▬"（冲刺/特技）没有 HUD 标签 | — | 交 P1（GDD2 §9.4 HUD 标注） | P1 | — |
| F3 外 | 没有房间目标行 | — | P2 的 `objective` 组件落地前，F4a 注册同 id 最小版：第一局每个战斗房「清空敌人 → 选择下一扇门」/「Clear the enemies → pick a door」；工坊首访序列由 F4b（§8.1） | F4a / F4b → P2 | （GDD 已定） |

### 10.2 改变 GDD2 数值或行为的裁决（主程据此改 GDD2；本文为准）

| # | GDD2 位置 | 原规定 | 新规定 | 理由 |
|---|---|---|---|---|
| 1 | §3.2、§3.12 轻按阈值 | 按下后 0.18 s 内松开 = 轻按 | 按下 0.18 s 后擦带光标开始走；**光标退过 0.35 s 之前松开仍算轻按**（≈ 按住 0.25 s 内）。`mods.rewindTapThreshold` 仍为 0.18，新常量 `TAP_GRACE_BACK = 0.35` | 清晰度报告 S1 #4：0.18–0.3 s 的普通按键变成花 25、回血 0 的微擦带 |
| 2 | §9.1 序章 | 8 步约 4 分钟（含卡秒、同步、分岔、擦带、紫色） | **6 课约 4 分 40 秒**：走 / 打+冲 / 撤销 / 残响 / 悖论 / 小考（§2）；每课先看再做 | 非协商项 2、4；§9.8 规则 2 |
| 3 | §9.1 第 8 步、§9.2 `fixed_hit` | 序章第 8 步教紫色 | 第一次受到紫色伤害时：★便条 + 下一个安静时刻 15 s `fixed` 课 + 排练厅 | 不在同一分钟里动摇"伤能撤销" |
| 4 | §9.8 规则 2 | 分岔、擦带、同步在第一局用便条在合适时机教 | 分岔 = 第一局第 1 间清场课；擦带 = 第 2 间清场课；同步及以后按阶梯（§5.2）；`fork_ready`/`scrub` 便条在已教后抑制 | 非协商项 3、4、10；示范比便条有效 |
| 5 | §3.2、§3.4（新档行为） | 擦带与分岔从第一刻起可用 | 未教之前：**按住 = 轻按**；分岔**每房间第一次按只解释、不扣砂，3 s 内再按才分岔**；教过、跳过、精简/关闭引导、非标准模式、机器人不受影响 | §5.3 |
| 6 | §3.8 元凶 | 回溯后元凶标记与磁带白菱形总是显示 | 第 2 局元凶课之前不画标记、白菱形与元凶术语框；+50% 与祖父悖论照常 | 清晰度报告"急救标志""所以呢" |
| 7 | §9.8（F3 实现细节） | 旧影白话框每房间前 12 s、前 3 个房间 | 首见 4 s，之后只在受击时再出，共 3 次 | 清晰度报告 S3 |
| 8 | §9.6 死亡卡 | 结算第一页 | **倒下那一刻在游戏场景内**出现，带"磁带回放"（按 `{@rewind}` 播放）；结算第一页沿用同一行 | 玩家此刻正看着那一幕；回放本身就是心智模型的演示 |
| 9 | §9.5 排练厅奖励 | 8 个训练各 10 碎片 + 外观 | 另加：17 课 ✓ 各 3 碎片（一次）；非 G 的 ★ 各 5 碎片（终身合计约 +166 碎片，交 P6 复核） | 让"学会"有回报，回应"难打组合" |
| 10 | §9.1 首启询问 | 只问 1.0 存档玩家"体验新的序章？" | 所有新档首次"开始"都弹「第一次玩？」二选一 | 老玩家要能跳过（非协商项 4） |
| 11 | 新增：教练慢动作 | — | L3 时单人 `world.slowmo(0.3, 0.9)`、多人 r72 0.4× 0.6 s；终身 ≤ 6 次；可关 | 非协商项 5 |
| 12 | 新增：序章 L5 训练轮 | — | 只在序章 L5 与帮助等级 3 时残响驻留 2.0 s / 1.5 s；L6 明说实战 0.6 s | 让第一次悖论能成功；只此一项 |

---

## 11. 实施拆分：F4 工作包

### 11.1 定位与节奏

- **F4 = 基础阶段第 4 个包**：依赖 F1–F3，从 tag `v2-F3` 开始；完成后打 `v2-F4`，生产包 P1–P7 的 worktree 改为从 `v2-F4` 派生。F3 修复轮未合并前 F4 不开工（风险 8）。
- **两名实现者并行**：`git worktree add ../wdc-F4a -b v2/F4a-core v2-F3`、`git worktree add ../wdc-F4b -b v2/F4b-coach v2-F3`。文件归属**互不相交**（§11.2–11.3）。合并顺序 F4a → F4b → 修复轮 → `v2-F4`。
- **接口日**：F4a 第 1 天把全部"带空默认实现的钩子"（§11.5）与共享文件里的钩子改动推到 `v2/F4-iface`（从 `v2-F3` 派生）；F4b 第 2 天 rebase 到它上面。之后两边只在自己的文件里工作。

| 天 | F4a（核心） | F4b（教练、死亡卡、暂停页、排练厅、阶梯后段） |
|---|---|---|
| 1 | 接口日：`gates.ts`、`onboard/index.ts`（`Onboard`、`Tut.register`）、Stage 骨架、`Rich`/`bigPrompt`、全部共享文件钩子、`settings.ts` 字段、`strings/onboard.ts` 骨架、`sfx_onboard.ts` | `shot.cjs` 扩展（pad/axes/waitFor）、`LoopPlayer` + 6 个循环、死亡底图探针、`bot.ts` `noRewind` |
| 2–4 | Stage 完整（停靠、障碍、预算、聚光、审计）、`DemoDirector`、`LessonRunner`、两种宿主、道具与精灵 | 教练：等级、机会、D1–D12、慢动作、座位、Beat 调用 |
| 5–7 | 序章 P0、L1–L6、成绩单、尾声；`flow.ts`；教学房退役；`input.ts`/`widgets.ts` 纯键盘图标 | 死亡卡与回放；暂停页 `rewindGuide`；`pause.ts` 菜单与设置行 |
| 8 | `calm.ts` + 分岔/擦带清场课；HUD 显隐；楼层卡；目标行最小版 | 排练厅（拱门、房间、课程板、课程、★）、`ladder.ts` R2+、进阶课、认出、掌握提示 |
| 9 | 自己的脚本、`stageaudit.cjs`、回归 | 自己的脚本、多人、回归 |
| 10–12 | 修复轮（两人）：盲测循环（§12.4）、截图矩阵、文字规则 | 同左 |

### 11.2 F4a 拥有 / 新建

**新建**：
`src/game/onboard/index.ts`（入口：注册路由、`GameHooks` 订阅、`hintsHooks.busy` 包装、`Onboard`、`Tut.register` 与 `window.__tut` 基础）· `onboard/gates.ts`（**F4 后冻结**）· `onboard/stage.ts`（Stage：停靠、障碍、预算、聚光、审计；同 id 替换 HUD 组件 `'caption'`）· `onboard/rich.ts`（`{@action}` 富文本、`bigPrompt`）· `onboard/modelStrip.ts` · `onboard/beat.ts` · `onboard/demo.ts`（`DemoClip`、`DemoDirector`、按键气泡、演示画框）· `onboard/lesson.ts`（`Lessons`、`LessonRunner`、帮助等级、失败节拍）· `onboard/host.ts`（`RebuildHost`、`SoftHost`、胶片擦除）· `onboard/props.ts`（`FallingGear` `PracticeDummy` `GlassJar` `AlarmTurret` `PendulumBlade` `MarkerRing` `InesStand`）· `onboard/calm.ts`（安静时刻调度、推迟、R1 规则）· `onboard/firstLaunch.ts`（P0 卡）· `onboard/lessons/core.ts`（move/strike/undo/echo/paradox/final）· `onboard/lessons/inrun.ts`（fork/scrub）· `onboard/debug.ts`（F4a 的路由与 `__tut` 字段）· `src/game/scenes/prologue.ts`（`PrologueDirector`、`RoomTypes.register('prologue')`、时钟、成绩单、尾声）· `src/game/strings/onboard.ts`（§1–§5 的全部文案 + `defineTerm('rewind'|'scrub'|'hall')`）· `src/audio/sfx_onboard.ts`（`lessonPass lessonRetry demoStart filmWipe clockJump glyphPress spotPing windUp coachTick`，供两边使用）· `src/art/sprites/onboard.ts`（课程道具、粉笔描边参数、模型条图标）· `tools/stageaudit.cjs` · `tools/scripts/onboard/{prologue_ref,prologue_ref_en,prologue_pad,prologue_fail,prologue_kbonly,prologue_skip,run1_lessons,gates,stage_dock}.json`。

**修改（共享触点，本包内 F4a 独占修改）**：

| 文件（生产阶段归属） | 改动 | 默认行为 |
|---|---|---|
| `src/game/entities/player.ts`（P1） | `beginRewind` 末尾与 `updateRewind` 进入擦带处各加 `\|\| Gates.tapOnly(this)`；`fork()` 开头 `if (!Gates.forkAllow(this)) return false;`；`refuse()/refuseFork()` 发 `custom {id:'rewindRefused'\|'forkRefused', player, data:{reason, need}}`；`renderTint` 字段与 `render()` 套用 | 钩子默认放行 → 行为与 v2-F3 完全一致 |
| `src/game/ui/rewindHud.ts`（P1） | `RewindHudHooks = { pulse(p), rect(id, slot), muted(), hidePlates }`；元凶钟针/白菱形/元凶框加 `Gates.shows(p,'culprit')`；导出 `drawShadowOutline(ctx, spr, x, y, color)`；旧影白话框计时（§10.2 改动 7） | 同上 |
| `src/game/ui/callouts.ts`（F3 新文件，随 `ui/*` 冻结） | `Caption.say` 转给 `Stage.say`；`Callouts.mute` 钩子；导出 `Callouts.obstacles(w)` | 同上 |
| `src/game/ui/hud.ts`（P1） | 渲染循环里 `if (!Gates.hud(w.id, p)) continue;` | 同上 |
| `src/engine/input.ts`（冻结） | `raw` 记录每个动作最近一次触发它的 code；`PlayerInput.lastCodeFor(a)`；`raw.kbColumn` | 新增只读字段 |
| `src/game/ui/widgets.ts`（冻结） | `keyFor` 优先 `who?.lastCodeFor?.(a)` | 键鼠玩家仍显示 Q/R |
| `src/game/scenes/game.ts`（P2） | 楼层卡 1.8 s、上三分之一（§10.1）；`Onboard.deathCard.active()` 时跳过自己的停摆文字 | — |
| `src/game/world/roomgen.ts`（P2） | `kind === 'prologue'` → 22×11 plain 无障碍；`kind === 'rehearsal'` → 36×17 plain 无障碍 | 其他房型不变 |
| `src/game/settings.ts`（P7） | `onboarding coach coachSlowmo deathReplay` + `sanitize` | — |
| `src/game/flow.ts`（P6） | 标题"开始"→ P0 → 序章；`startRun` 首间一律 `'combat'`，第一局首间 `scene.waveDelay ≥ 2`；`Flow.hub('rehearsal')` | — |
| `src/game/rooms/tutorial.ts`（P7） | 删除地刻与 `RewindCoach`；保留 `'tutorial'` 类型（权重 0）；`?room=tutorial` 重定向 | — |
| `src/game/boot.ts`（冻结） | `import './onboard'`；`setupAudio()` 加 `registerOnboardSfx(a)` | — |
| `src/game/strings/f2.ts`（冻结） | `lastSecondHint` 文案（§1.6） | — |

### 11.3 F4b 拥有 / 新建

**新建**：
`src/game/onboard/coach/coach.ts`（`CoachDirector`、`SeatCoach`、`Opportunity`、等级规则；实现 `Onboard.coach`）· `coach/detectors.ts`（D1–D12）· `coach/mastery.ts`（掌握提示、今日一练、局末复盘数据）· `coach/deathTape.ts` · `coach/deathCard.ts`（`DeathSnap`、HUD 组件 `'deathCard'`、回放；实现 `Onboard.deathCard`）· `coach/debug.ts`（F4b 的路由与 `__tut.coach/death/guide/hall` 字段）· `src/game/onboard/ladder.ts`（R2+ 阶梯规则、事件课触发、认出；`Calm.addRule`）· `onboard/lessons/advanced.ts`（§5.7 全部）· `onboard/lessons/hall.ts`（★ 试炼与多人课）· `onboard/loopPlayer.ts` · `onboard/loops.ts`（6 个循环 + 排练厅各课的预览循环）· `src/game/ui/rewindGuide.ts`（`Panels.register('rewindGuide')`）· `src/game/rooms/rehearsal.ts`（`RoomTypes.register('rehearsal')`、布局、自由练习、不死规则、拱门经 `GameHooks.onHub` 放置、工坊首访目标行）· `src/game/ui/rehearsalBoard.ts`（`Panels.register('rehearsal')`）· `src/art/sprites/hall.ts`（拱门、课程板、幕布、提词板、拉杆、双铃、一线木偶、✓/★ 框）· `src/game/strings/coach.ts`（§6–§9 全部文案）· `tools/scripts/onboard/{coach_hit,coach_fade,coach_miss,coach_echo,coach_coop2,death_cases,guide,hall,hall_coop,ladder,seat_novice,blind_template}.json`。

**修改（共享触点，本包内 F4b 独占修改）**：

| 文件（生产阶段归属） | 改动 |
|---|---|
| `src/game/ui/pause.ts`（P4） | 暂停菜单第 2 项「回溯怎么用」；「我会玩了（跳过教学）」；局内课程进行中「稍后再学」；序章中「再看演示 / 跳过这一课 / 跳过序章」；`SettingsPanel` 加「引导 / 教练提示 / 教练慢动作 / 死亡回放 / 重置教学进度」五行 |
| `src/game/entities/echo.ts`（P4） | 导出纯函数 `drawEchoFrame(ctx, spr, x, y, alpha, slotColor)`（从现有绘制代码抽出，不改行为） |
| `src/game/qa/bot.ts`（P1） | `BotOpts.noRewind / noFork`（自动驾驶时战斗交给机器人，回溯由驾驶员按提示决定） |
| `tools/shot.cjs`（共享工具） | 向后兼容地加步骤 `{"pad":[index,button,down]}`、`{"axes":[index,[lx,ly,rx,ry]]}`（脚本含 pad 步骤时用 `padtest4.cjs` 同款 `addInitScript` 虚拟手柄）、`{"waitFor":"<js 表达式>","ms":N}`；`eval` 结果写入日志（已有） |

### 11.4 共享触点与落地顺序

1. F4a 接口日提交（`v2/F4-iface`）：`gates.ts`（全部默认放行）、`Onboard`/`Tut` 骨架、`Stage.say`（先画成 F3 的单行轨）、`Rich`、`RewindHudHooks`、`Callouts.mute/obstacles`、`Gates.hud` 钩子、`renderTint`、拒绝事件、`settings.ts` 字段、`roomgen.ts` 两个分支、`lastCodeFor`。**这一刻游戏行为与 v2-F3 完全相同**（跑一次 solo 600 s 回归确认）。
2. F4b 基于它开发；F4b 只调用 F4a 的导出，不改 F4a 的文件；需要 F4a 加东西时在 `v2/F4-iface` 上提请求，F4a 当天合入。
3. 合并：F4a 完成 → 合入主分支 → F4b rebase → 合入 → 修复轮 → 验收 → `v2-F4`。

### 11.5 F4a ↔ F4b 接口（签名在接口日冻结）

```ts
// src/game/onboard/index.ts（F4a）
export const Onboard: {
  mode(): 'full' | 'lite' | 'off';                 // settings.onboarding + URL 覆盖 + bot/非标准模式 → 视为已学
  isNovice(p: Player): boolean;                    // 闸门与教练是否作用于这个座位
  taught(p: Player | null, id: string): boolean;   // Teach（槽Ⅰ）或 SeatTeach（客人）
  mark(p: Player, id: string, how?: 'lesson' | 'recognised' | 'soft' | 'skip'): void;
  skipAll(): void; reset(): void;
  covers(hintId: string): boolean;                 // P7 便条去重
  coach: CoachApi;                                 // F4b 赋值；默认空实现
  deathCard: { active(): boolean; lastSnap(): unknown };   // F4b 赋值
};
export interface CoachApi { quiet(slot: number, on: boolean): void; scripted(p: Player, det: 'hit'): void; level(slot: number): 0 | 1 | 2 | 3; busy(): boolean }
export const Tut: { register(key: string, obj: object): void; log(ev: string, data?: unknown): void };   // → window.__tut[key]

// src/game/onboard/gates.ts（F4a；F4 之后冻结，默认放行）
export const Gates: {
  tapOnly(p: Player): boolean;                     // 未教擦带：按住 = 轻按
  forkAllow(p: Player): boolean;                   // false = 本次按键被解释、不扣砂
  shows(p: Player | null, what: 'culprit'): boolean;
  hud(id: string, p: Player | null): boolean;      // HUD 组件显隐（§5.4）
};

// 其余 F4a 导出：Stage / SayOpts / SpotRef（§4.8）· Rich、bigPrompt（§1.7）· Beat.success（§2.9）· ModelStrip（§1.3）
// · Lessons、LessonDef、LessonStep（§3.6）· DemoClip、DemoDirector（§3.2–3.3）· SoftHost、RebuildHost（§3.7）
// · Calm.{ addRule(r: { id: LessonId; eligible(ctx: { run: Run; p: Player; scene: GameScene }): boolean; prio: number }), request(id, why), isCalm(scene, p) }（§5.5）
// · 道具类（§11.2）· RewindHudHooks.{ pulse, rect, muted, hidePlates } 与 drawShadowOutline（§11.2）
```

### 11.6 调试路由（`registerDebugRoute`）

| 路由 | 作用 | 归属 |
|---|---|---|
| `?onboard=fresh\|skip\|lite\|off\|prologueDone\|taught:<id,id>` | 启动前在内存套用档案预设（`fresh` = 清空 `taught`、`onboard.*`、`coach.*`、`did.*`、`prologueDone = false`）后走正常启动 | F4a |
| `?scene=p0` | 首启选择卡 | F4a |
| `?scene=prologue[&lesson=move\|strike\|undo\|echo\|paradox\|final\|report\|outro][&phase=demo\|try][&step=<key>][&help=0..3]` | 序章，或从某课/某阶段开始 | F4a |
| `?lesson=<id>[&where=calm\|sandbox][&seed=..&floor=..]` | 单独跑任一课（`calm` = 种子房清场后开；缺省 = 空沙盒房） | F4a |
| `?inrun=fork\|scrub[&seed=2&floor=0]` | `= ?lesson=<id>&where=calm` | F4a |
| `?glyph=kbm\|kb\|pad` | 强制按键图标族 | F4a |
| `?autoplay=onboard[&fumble=1]` | 自动驾驶（§3.9） | F4a（战斗部分用 F4b 的 `noRewind`） |
| `?stagedebug=1` / `?tutlog=1` | 画障碍与停靠候选 / 控制台打印 `__tut.log` | F4a |
| `?room=tutorial` | 重定向到 `?scene=prologue&lesson=undo` | F4a |
| `?coach=auto\|always\|off\|L3\|L2\|L1\|L0`、`?coachslow=0`、`?coachdet=<id>`、`?coachbots=1` | 教练覆盖；强制触发检测器；把机器人座位当真人（多人截图） | F4b |
| `?drill=death&case=c1..c8[&seed=2]`、`?deathreplay=0` | 真实局 + 脚本伤害制造对应死法，走到死亡卡 | F4b |
| `?scene=rewindGuide[&focus=1..6]` | 暂停页 | F4b |
| `?scene=rehearsal[&lesson=<id>][&players=N]` | 排练厅 | F4b |
| `?onboard=stage&stage=N`、`?runs=N` | 阶梯预设到第 N 阶（含 `Teach`、`profile.runs`、`did` 最低值） | F4b |

`?bot=1` 时自动等同 `onboard=skip` 且教练关（除非同时给 `coach=` 或 `autoplay=`），QA 回归不受影响。

### 11.7 `window.__tut`（开发构建与 `?qa=1` 时挂载）

```ts
interface TutDebug {
  // —— 状态（盲测可读：只用于同步，不含教学内容）——
  where: 'title' | 'p0' | 'prologue' | 'hub' | 'run' | 'hall' | 'guide';
  lesson: string | null; phase: 'intro' | 'demo' | 'wipe' | 'try' | 'fail' | 'success' | 'report' | 'outro' | null; step: string | null;
  // —— 输入与等待（盲测可用；全部按模拟时间）——
  wait(ev: 'caption' | 'idle' | 'phase:try' | 'phase:demo' | 'success' | 'hit' | 'rewind' | 'paradox' | 'fork' | 'demoEnd' | 'room:clear' | 'death'
           | `lesson:${string}` | `where:${string}`, timeoutSec?: number): Promise<'ok' | 'timeout'>;
  freeze(): void; thaw(): void;                       // world.stop，截图稳定（同 F3 __rw.freeze）
  hold(code: string, simSec: number): Promise<void>;  // 派发 keydown / keyup
  tap(code: string): Promise<void>;
  walkToward(target: 'objective' | 'marker' | 'door', simSec?: number): Promise<void>;   // 朝屏幕上的目标标记走（等价于人类看着标记走）
  autopilot(on: boolean): void;                       // 只在第一局两节清场课都已完成或跳过之后允许：QA 机器人接管移动/攻击，课程、教练、便条照常
  // —— 仅 CI（盲测运行中禁止调用/读取）——
  caption: ReturnType<typeof Stage.current>; audit(): ReturnType<typeof Stage.audit>;
  attempts: Record<string, number>; fails: Record<string, string[]>; help: number; demoPlays: Record<string, number>;
  gates: { tapOnly: boolean; forkAllow: boolean }; taught: string[]; clock: string;
  log: { t: number; real: number; ev: string; data?: unknown }[];   // lessonStart/demoStart/demoEnd/demo-desync/fail/success/caption/coach/gated/postpone
  next(): void; skipLesson(): void; setHelp(n: number): void;
  // —— F4b 经 Tut.register 挂上 ——
  coach: { level(slot?: number): 'L3' | 'L2' | 'L1' | 'L0'; state(slot?: number): object; visible(slot?: number): object | null; log: object[]; force(det: string, slot?: number): void };
  death: { snap(): object[] | null; replay(): { playing: boolean; t: number } | null };
  guide: { open: boolean; view: 'grid' | 'focus'; loop: number; seek(loop: number, t: number): void };
  hall: { board(): object; active(): object | null };
}
```

### 11.8 交接

- **生产阶段归属**：`src/game/onboard/**`、`src/game/scenes/prologue.ts`、`src/game/rooms/rehearsal.ts`、`src/game/ui/{rewindGuide,rehearsalBoard}.ts`、`src/game/strings/{onboard,coach}.ts`、`src/art/sprites/{onboard,hall}.ts`、`src/audio/sfx_onboard.ts`、`tools/stageaudit.cjs`、`tools/scripts/onboard/*` → **P7**。`src/game/onboard/gates.ts` → **冻结**。F4 改过的他人文件（§11.2–11.3 表）归属不变，钩子成为该文件的一部分。
- **P7 保留并在 F4 之上做**：便条 30 条的文字与触发（按 §5.11 去重）、钟典 Horologium（复用 `LoopPlayer` 做 48×32 小循环）、楼层卡技巧轮换（第 1 条为 `MODEL`）、多人"两根针"卡（GDD2 §9.7，复用排练厅多人课的循环）、事件、故事与过场、秘密与成就、标题 2.0（钟面菜单、8 点"排练厅"入口）、音乐、设置/操作页其余项、排练厅装备已发现物品。
- **P1**：HUD 冲刺/特技标签与动作槽按键图标；新武器的重击/冲刺攻击若改变连段伤害，序章道具 HP 自动按真实数值算，无需改。P1 定义"战斗"分组 4 课（`heavy interrupt break reverse`）接入 `Lessons.define`。
- **P2**：`objective` 组件替换 F4a 的最小版；时间锚接入排练厅机关区；GDD2 §9.6 敌人针对性死亡提示表（死亡卡 C8）。
- **P4**：奖励池在 `!Onboard.taught(p,'fork')` 时不提供带 `fork` 标签的回忆/沙漏（接口请求）；`pause.ts` 里 F4b 的菜单项保留。
- **P6**：结算第一页复用 `DeathCard.lastSnap()` 与"学会奖励"行；经济复核 §10.2 改动 9；`story.ts` 伊妮丝首访台词加「想先练练手？左边帷幕后是排练厅。」/「Want to practise first? The Rehearsal Hall is behind the curtain on the left.」。

---

## 12. 验收

### 12.1 自动闸门（全部必须通过）

```bash
npm run typecheck
npm run build:single                                            # dist-single/index.html ≤ 1.6 MB
node tools/qarun.cjs "seed=21&bot=1&speed=8&god=1" 600 tools/out/F4/solo                 # 打到第 4 层首领并通关，0 运行时错误
node tools/qarun.cjs "seed=3&floor=0&god=1&bot=1&players=4&speed=8" 180 tools/out/F4/coop4 # 推进 ≥ 6 个房间，0 错误
node tools/padtest4.cjs "scene=hub"                                                       # 4 个虚拟手柄各自入座、移动、震动计数
node tools/jointest.cjs                                                                   # 按住加入
node tools/qarun.cjs "onboard=fresh&scene=prologue&autoplay=onboard&speed=4" 300 tools/out/F4/prologue_auto   # 结束时 __tut.where==='hub' 且 prologueDone
node tools/qarun.cjs "onboard=prologueDone&autoplay=onboard&seed=2&speed=4" 360 tools/out/F4/run1_auto        # 第一层结束（或死亡）时 taught ⊇ {fork, scrub}，lessonsThisRun ≤ 2
node tools/stageaudit.cjs tools/out/F4/onboard/*.log                                      # 所有脚本 overlapFrames === 0
```

另：所有运行的控制台 `[text] CJK in tiny` = 0；`__tut.log` 中 `demo-desync` = 0；`prologue_ref` 断言序章总模拟时间 ≤ 360 s。

### 12.2 截图脚本（`tools/scripts/onboard/`；运行：`node tools/shot.cjs "<URL>" tools/out/F4/onboard/<名>.png 2500 1280 720 tools/scripts/onboard/<名>.json`）

每个脚本：按键用真实键盘事件（手柄脚本用 F4b 扩展的 pad 步骤）；每次 `{"eval":"__tut.wait('caption')"}` 返回后 `freeze → shot → thaw`；最后一步 `{"eval":"__tut.audit()"}` 与 `{"eval":"__tut.log.filter(e=>e.ev==='demo-desync').length"}`。

| 脚本 | URL | 内容 | eval 断言 | 归属 |
|---|---|---|---|---|
| `prologue_ref.json` | `onboard=fresh&lang=zh` | 标题 → P0 选 A → L1…L6 → 成绩单 → 尾声 → 工坊；每条字幕一张 | 总模拟时间 ≤ 360 s；各课一次通过；`audit().overlapFrames === 0`；desync 0；`__save.profile.prologueDone && taught ⊇ {undo,echo,paradox}` | F4a |
| `prologue_ref_en.json` | 同上 `&lang=en` | 同上 | 同上；英文卡宽 ≤ 360、≤ 3 行 | F4a |
| `prologue_pad.json` | 同上 `&glyph=pad`（另一版用 pad 步骤真按） | 同上前 3 课 | `__tut.caption` 中令牌为 LB/RB/X/A | F4a |
| `prologue_kbonly.json` | `onboard=fresh&lang=zh` | 只用 J/K/L/I/空格/方向键 | L3 卡的令牌为 `L`；L2 为 `J` | F4a |
| `prologue_fail.json` | `scene=prologue&lesson=undo` 起 | 每个尝试故意失败一次（不按回溯、自己打碎木人、在钟罩远处回溯、驻留过期）；第 3 次失败出现"再看一遍"询问；`Tab` 重放 | 每课 `fails ≥ 1` 且出现该课 fail 文案；`demoPlays ≥ 2` | F4a |
| `prologue_skip.json` | `onboard=fresh` | P0 选 B → 工坊 → 开局 → 按 R 能分岔、按住 Q 1 s 能擦带 | `gates.tapOnly === false`、`forkAllow === true`；擦带 `rewind.scrub === true` | F4a |
| `run1_lessons.json` | `onboard=prologueDone&seed=2&floor=0` | 第 1 间：受击 → 教练 L3 卡；按 R → 解释字幕、时砂不变；清场 → 分岔课（演示/尝试/成功）；第 2 间清场 → 擦带课 | 第一次按 R 后 `sand` 不变；两课 `success`；`taught ⊇ {fork, scrub}` | F4a |
| `gates.json` | `onboard=prologueDone&seed=2&floor=0&spawn=cogling` | 未学擦带时按住 Q 1.0 s；未学分岔时按 R 两次（间隔 1 s / 4 s 两组） | 按住 → `rewind.scrub === false` 且落点 = 旧影；1 s 间隔第二下分岔发生、4 s 间隔不发生 | F4a |
| `stage_dock.json` | `seed=2&floor=0&spawn=cogling&coach=L3` | 把玩家放到屏幕 y≈70 → 受击 → 卡在底轨；再在底部放一个前摇敌人 → 卡退成芯片 | `dock` 依次 `bottom`、`pod`；全程 `overlapFrames === 0` | F4a |
| `coach_hit.json` | `seed=2&floor=0&spawn=cogling&lang=zh&coach=L3`（另跑 `&glyph=pad`、`&glyph=kb`、`&lang=en`） | 受击 → L3 卡（冻结截图）→ 按 Q → 成功卡 → D3 | `coach.visible().form==='card'`、`dock==='top'`、令牌与设备一致；`log` 末项 `success` | F4b |
| `coach_fade.json` | 同上 | 连续 6 次"受击后 0.1 s 内按 Q" | `coach.level()` 依次 L2（第 2 次后）/ L1（第 4 次后）/ L0（第 6 次后） | F4b |
| `coach_miss.json` | `…&coach=L2` | 受击不按 → 倒计时 → D2 → 同房间再错过 → 下一次受击出 L3 卡 | `state().ignored === 2`；第三次 `form === 'card'` | F4b |
| `coach_echo.json` | `…&coach=L3` | 定住敌人（`__rw.pin`）→ 受击 → 回溯 → 残响就绪 → D4 字幕 + 箭头 → 走进 → 悖论 + 成功卡 | `log` 含 `echoIgnored` 与 `success` | F4b |
| `coach_coop2.json` | `players=2&seed=2&floor=0&spawn=cogling&coach=L3&coachbots=1` | Ⅰ 受击 → 左上座位卡；Ⅱ 受击 → 右上座位卡；Ⅱ 停摆 → Ⅰ 出 D12 | 两个 `visible(slot)` 同时非空且矩形不相交；全程 audit 0 | F4b |
| `death_cases.json` | `drill=death&case=c2&lang=zh`（另跑 c1、c3–c8） | 死亡卡静态 → 按 Q → 回放 0.5 / 1.6 / 2.3 / 3.1 s 四张 | `death.snap()[0]` 用例匹配；`replay().playing` | F4b |
| `guide.json` | `scene=rewindGuide` | 网格 + 6 循环 × 3 帧（`guide.seek`）；另跑 `&glyph=pad` | 截图存在；令牌族正确 | F4b |
| `hall.json` | `onboard=prologueDone&scene=hub` | 拱门 → 课程板 → fork、scrub 两课 + 一个 ★ → 回工坊 | `hall.board()` 中 fork/scrub 为 ✓；碎片 +6 | F4b |
| `hall_coop.json` | `scene=rehearsal&players=2&coachbots=1` | 两人同时上两节不同的课，互不阻塞；二重奏课 | 两个 `LessonRun` 同时 active；`duet` 成功 | F4b |
| `ladder.json` | `onboard=stage&stage=3&seed=2&floor=0` | R2 第 1 间清场 → 同步课；自然打出 2 次连锁 → 认出 | `taught` 含 `sync`；认出字幕出现 | F4b |
| `seat_novice.json` | `scene=hub&players=2&coachbots=1` | 槽 Ⅱ 热加入 → 头顶「第一次玩？」→ 按住交互 → 落地钟旁 `undo` 速成课；槽 Ⅰ 照常走动不受阻 | 槽 Ⅱ `Onboard.isNovice === true`、闸门只作用于槽 Ⅱ；槽 Ⅰ 无提示 | F4b |
| `blind_template.json` | `onboard=fresh&lang=zh` | 只含等待/截图骨架与允许的 `__tut` 调用，按键处留空 | — | F4b（交给盲测代理） |

分辨率矩阵：1280×720（主）、1366×768、1920×1080；文字 125% 一次（`setStorage` 写设置）——`prologue_ref` 与 `coach_hit` 两个脚本各跑一遍矩阵，audit 仍为 0。

### 12.3 关键 eval（写在上表脚本里，列出供审查）

1. 闸门：未学擦带时按住回溯 1.0 s → `rewind.scrub === false` 且落点 = 旧影帧；未学分岔时按 R 一次 → `lo.sand` 不变、`Calm` 队列含 `fork`。
2. 冻结引导：L3 尝试 A 受击后 4 s（真实时间）按 Q → `restored === 12`（磁带在冻结期间没有走）。
3. 教练红线：L3 慢动作期间 `p.invuln > 0` 恒成立（每帧采样）；`world.timeScale` 在 `p.rw` 出现的那一帧恢复 1。
4. 机器人：`?bot=1` 时 `Onboard.mode()` 为跳过、`__tut.coach.level() === 'L0'`、序章不出现。
5. 序章确定性：`prologue_ref.json` 连跑 2 次，每课 `attempts` 与关键事件时刻一致（±1 tick）。
6. 安全：序章 L1–L5 `damaged` 累计每次尝试 ≤ 30。

### 12.4 盲测协议（非协商项 10）

1. **代理**：每轮一个**新的**代理；未读过本文档、GDD、源码；全新 Chromium 档案（`tools/shot.cjs` 每次启动 `localStorage` 为空）。
2. **给它的东西**：开发服务器地址；`blind_template.json`；本节第 3 条的工具规则；第 5 条的 10 个问题（**不给**评分要点）；一句任务：「你在玩一个游戏。请从标题开始，自己写 `tools/shot.cjs` 脚本边玩边截图，玩完序章和第一局第一层，然后回答问题。」
3. **允许**：路由只能是 `?onboard=fresh&lang=zh`（从标题开始）；`__tut.wait/freeze/thaw/hold/tap/walkToward`，读 `__tut.where/lesson/phase/step`（只用于同步）；`__tut.autopilot(true)` 只在两节清场课之后；因为序章是确定性的，可以反复从头重跑更长的脚本。**禁止**：读 `__tut.caption/log/attempts/coach/death`、调用 `next/skipLesson/setHelp/guide.seek`、改 URL 参数、读文档与源码。
4. **提交**：10 个答案 + "哪里没看懂"自由反馈 + 截图目录 + 所用脚本。
5. **问卷**（括号内为评分要点，评分代理持有）：
   1. 回溯怎么用、什么时候用、按哪个键？（刚挨打后约 3 秒内；Q / 手柄 LB；回到身后的淡影/几秒前的位置；受的伤撤销；花时砂）
   2. 旧影是什么？（3 秒前的你的淡色轮廓；轻按回溯就回到那里）
   3. 磁带是什么？红刻痕是什么？（血条下记录最近 3 秒的条；红刻痕 = 挨打的那一刻，退过它就撤销）
   4. 时砂是什么？从哪来？（回溯/分岔消耗的能量；打中敌人攒回来；轻按退满 3 秒花 100 或"退得越远越贵"）
   5. 残响是什么？有什么用？（回溯/分岔后留下的"刚才的你"，把刚才的动作再做一遍；伤害算数/白赚）
   6. 悖论怎么触发？什么时候用？（◆ 亮了后走进/碰自己的残响 → 爆炸；敌人在残响旁、或要打碎普通攻击打不动的东西）
   7. 分岔是什么、怎么用？（按 R / RB；不回溯、不挨打就留下残响，它从约 2 秒前的位置走到你按键处；50 时砂；常用来做悖论）
   8. 按住回溯（擦带）是什么，为什么用？（按住，预览影往回走，选好位置松开；退得近更便宜；越过红刻痕才撤销那下）
   9. **留出题**：血条上的青色斜纹是什么？（回溯现在能拿回的生命）
   10. **留出题**：什么时候不能指望回溯救你？（时砂不够 / 紫色伤害 / 时间锚 / 磁带烧毁 / 已经超过 3 秒——答出任一即可）
6. **通过**：Q1–Q8 **全部**包含评分要点且无事实错误，且 Q9–Q10 至少 1 题正确；同时 §12.1 的自动闸门全部通过。
7. **三轮**：中文（上述）；英文（`lang=en`，新代理）；手柄图标（`&glyph=pad` 由评审方注入，新代理；Q1、Q7 必须说出 LB / RB）。三轮都通过才算 F4 验收。
8. **不通过时**：把错题对应的截图段落与 `__tut.log` 一起交回设计，定位"哪一课的哪一句没被看到/看懂"，修改文案或时序后换一个新代理重测全部三轮（同一代理不得复测）。

### 12.5 QA 机器人与教学

- `?bot=1`（含 `players=N`）= 跳过教学、教练关、闸门全开 → 所有既有回归（`seed=21` 通关、4 人 180 s、F3 的 `rewind2*.json`）行为不变。
- `?autoplay=onboard` = 用课程自己的演示脚本**完成**教学（§3.9），战斗交给机器人；用于 §12.1 的 `prologue_auto` / `run1_auto` 与盲测模板的 CI 参考。

---

## 13. 风险与砍单顺序

### 13.1 风险

| # | 风险 | 后果 | 对策 |
|---|---|---|---|
| 1 | **演示漂移**：演示用真实战斗代码，P1/P2/P5 调参（攻击范围、连段时间、齿轮仔 AI）后该打中的没打中 | 演示与字幕对不上，比没有演示更糊涂 | 转向式 DSL（不录原始输入）；课程道具全是本模块自有实体，数值按真实武器在生成时计算；每个 `waitFor` 有 `timeout + force` 并记 `demo-desync`；每次合并跑 `prologue_ref.json` 与全部 `?lesson=` 演示，desync > 0 即失败；序章每阶段一个全新 `World` |
| 2 | **输入交接**：演示期间换掉 `p.input`，切换瞬间残留按住状态或影响别人 | 交还控制时角色自己冲刺/回溯，或卡住 | 只在舞台重置后（角色静止、`rw = null`、`forkHold < 0`）切换；交还时消耗全部动作并等 0.2 s 中立输入；bot 输入是独立 `PlayerInput` 并在结束时释放；`prologue_fail.json` 覆盖"演示中狂按 / 暂停 / 拔手柄" |
| 3 | **顶部拥挤与遮挡**：字幕、目标行、连锁计数、楼层卡、首领血条、共享钱袋、便条抢同一块；1366×768、125% 文字、2–4 人 | 字幕被挤掉或又盖住战斗（回到 S1 #1） | Stage 唯一调度、四种停靠 + 芯片退路、注意力预算；`Stage.audit` 进闸门；文案 ≤ 18 字 / 行、≤ 3 行；分辨率 × 文字大小 × 人数矩阵；序章与排练厅舞台几何上避开顶轨 |
| 4 | **闸门副作用**：老玩家觉得被限制；多人客人被关；机器人与非标准模式行为改变；奖励池给出依赖分岔的回忆 | 体验割裂、回归变红、"拿到用不了的回忆" | 首启跳过、设置一键关、暂停"我会玩了"；闸门最多影响 2 间房；分岔是"先解释再给用"而非锁死；客人默认老手；`?bot`、非标准模式视为已学；P4 奖励池过滤（接口请求） |
| 5 | **教学保真**：训练轮（L5 驻留 2.0 s、序章时砂补满）让第一局预期落空；暂停页循环与真实画面渐渐不一致 | "残响停得没那么久""怎么死了"，信任下降 | 训练轮只有 L5 一项，L6 用真实数值并明说；第一局前两间有教练兜底；循环只用真实精灵与从游戏导出的绘制函数；文案数字从 `mods` 读 |
| 6 | **教学疲劳**：第一局两课 + 教练 + 便条 | 用户已经"玩不明白"，再加打断会"玩着累" | 只在安静时刻、每间 ≤ 1 件、每局 ≤ 2 课、单课 ≤ 25 s、可推迟/跳过、认出就不教；`__tut.log` 统计第一局教学总时长，`autoplay` 跑 10 个种子取均值，目标 ≤ 60 s 且 ≤ 局时长 10% |
| 7 | **盲测脆弱**：无头浏览器约 4 fps / 0.4× 速度；机器人打得太好不挨打或太差早死；代理背课文 | 结果不可信或不可复现 | 所有等待按模拟时间、截图前冻结；序章确定性；清场课道具"必挨打"；死亡也继续（死亡卡本身是考点）；留出题 + "用自己的话"；每轮换新代理 |
| 8 | **与 F3 修复轮冲突**：它正在改 `player.ts`/`rewindHud.ts`/`callouts.ts` | 合并冲突、语义漂移 | F4 只在 `v2-F3` 之后开工；所有共享改动收敛为默认放行的钩子（接口日一次提交）；没有 F4 时游戏行为与 v2-F3 完全相同 |

### 13.2 砍单顺序（从上往下砍；每一项都不影响盲测通过）

| 序 | 砍掉 | 退路 |
|---|---|---|
| C1 | 掌握提示的局内出口 A/B（§6.10） | 只留局末复盘一行与工坊"今日一练" |
| C2 | 多人序章泳道（§2.12） | 客人"新手"速成课（§5.10）+ 排练厅 |
| C3 | 死亡回放动画（§9.4） | 冻结在"该按的那一帧"的静态图 + 注解 + 原因行 |
| C4 | 排练厅非 G 的 ★ 试炼与对应碎片 | 只留 G 8 项（GDD 原设计） |
| C5 | 认出就不教（§5.8） | 照常上课 |
| C6 | 教练 D5、D10 | — |
| C7 | 暂停页放大视图（§7.2） | 只留网格视图 |
| C8 | 排练厅提词板与机关区（§8.6） | 只留假人区与课程 |

**绝不砍**：一句话心智模型与模型条；序章 L3–L5 的先看再做；Stage 的不遮挡规则与审计；擦带/分岔闸门；教练 L3/L2 与自适应淡出；第一局两节清场课；暂停页网格 6 循环；死亡卡原因行；纯键盘与手柄图标；盲测三轮。
