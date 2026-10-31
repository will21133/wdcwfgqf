# 《秒针 2：十二响》2.0 制作计划 (PLAN2)

> 制作人 / 主策划。设计依据：`docs/GDD2.md`（以下简称 GDD2，§ 号均指它）。本文件规定**做什么、谁做、改哪些文件、用什么共享接口、怎样算做完**。
> 仓库根目录 `/home/user/wdcwfgqf`。开发服务器 `http://127.0.0.1:5173`（每个 worktree 用自己的端口）。截图：`node tools/shot.cjs "<query>" out.png waitMs W H [script.json]`；QA 机器人：`node tools/qarun.cjs "<query>" <secs> <outPrefix>`。

---

## 0. 流程与规则

### 0.1 两个阶段

| 阶段 | 包 | 方式 |
|---|---|---|
| **基础 Foundation** | F1 → F2 → F3 | **按顺序**在主分支 `claude/confident-edison-4lycb6` 上完成，每个包完成后合并、打 tag（`v2-F1` / `v2-F2` / `v2-F3`）。它们会改造大量共享代码，所以不能并行 |
| **生产 Production** | P1 … P7 | F3 合并后，每个包在**独立 git worktree** 里并行开发：`git worktree add ../wdc-P1 -b v2/P1-combat v2-F3`。每个文件只属于一个包 |

### 0.2 所有包都必须遵守

1. **只改自己拥有的文件**（§3 文件归属表）。需要别人文件里的改动 → 写进最终报告的"接口请求"一节，由主程在集成时处理；不要自己改。
2. **`npm run typecheck` 必须通过**；合并前跑一次 `node tools/qarun.cjs "seed=21&bot=1&speed=8&god=1" 120 tools/out/qa_<pkg>`，0 个运行时错误。
3. **字符串**不再写进 `src/game/i18n.ts`：每个包在自己的 `src/game/strings/<pkg>.ts` 里调用 `registerStrings('<pkg>', {...})`（§1.2）。所有面向玩家的文字必须是 `{zh, en}`。
4. **调试路由**不再改 `src/game/boot.ts`：在自己的文件里 `registerDebugRoute(...)`（§1.2），并在包的入口文件里 import。
5. **音效**放在自己的 `src/audio/sfx_<pkg>.ts`，导出 `register<Pkg>Sfx(a)`；基础包 F1 在 `src/game/boot.ts` 的 `setupAudio()`（与 1.0 的音效注册在一起）预留了全部 7 个注册调用（文件先以空函数存在）。
6. **颜色只用调色板**（`src/art/palette.ts`）。C 青 = 残响/回溯/时砂；M 品红 = 敌方子弹；V 紫 = 定格伤害。玩家颜色 R3 / B5 / G3 / U4（GDD2 §5.2）。
7. **文字规则**（GDD2 §12.1）：中文不得用 `tiny`；关键信息用 `body`（FP12）。开发模式下 `Text.draw` 遇到中文 + `tiny` 会在控制台打印 `[text] CJK in tiny`，验收时必须为 0。
8. **确定性**：游戏逻辑里禁止新增 `Math.random` 和 `setTimeout`/`setInterval`；用 `world.rng` / `run.rng` 和 `world.after()`。
9. 新内容的数值以 GDD2 为准；要偏离必须在报告里写明理由。
10. 每个包结束时提交 `tools/out/<pkg>/` 下的验收截图，并在报告中列出所用 URL。
11. **便条触发分工**：便条的文字由 P7 用 `Hints.define` 定义。凡是能从总线事件或 `GameHooks` 看到的触发（受击、状态、同步、连锁、元凶、卡秒、打断、破绽、节拍、逆弹、停摆、加入、房间类型、精英词缀）由 P7 订阅；卡面相关的 `replace_slot` `duo` `legend` `keystone` 由 P4 在自己的文件里调用 `Hints.show(id)`；`crack_wall` 由 P2 调用；`rescue` 由 P6 调用。对未定义的 id 调用 `Hints.show` 是安全的空操作。

### 0.3 合并顺序（生产阶段）

P1 → P4 → P2 → P3 → P5 → P6 → P7。主程每合并一个就跑一次回归（§4）。顺序依据：P1/P4 拥有被其他包"使用"最多的运行时文件（player/combat/echo/paradox）；P7 最后，因为它的彩蛋与便条会引用所有人的事件。

---

## 1. 共享接口契约 (Shared API Contract)

> 以下接口由基础包**实现并冻结**。生产包只能调用，不能改签名。函数体可以先是简化实现，但签名、事件名、字段名必须与此一致。标注 *(stub)* 的由基础包提供空/最小实现，由指定生产包填充。

### 1.1 文字与 UI（F1）

```ts
// src/game/ui/text.ts
export type TextSize = 'title' | 'body' | 'small' | 'tiny';     // title=FP12×2, body=FP12(lineH15), small=FP10(lineH13), tiny=FP8 拉丁/数字
export interface TextOpts {
  size?: TextSize; color?: ColorKey; align?: 'left' | 'center' | 'right';
  shadow?: boolean; outline?: ColorKey | false; maxW?: number; alpha?: number;
  plate?: boolean;            // 85% K0 底板
}
export const Text: {
  draw(ctx: CanvasRenderingContext2D, s: string | L10n, x: number, y: number, o?: TextOpts): { w: number; h: number };
  measure(s: string | L10n, size?: TextSize): { w: number; h: number };   // 逻辑像素
  wrap(s: string | L10n, size: TextSize, maxW: number): string[];
  lineH(size: TextSize): number;
  // F1 修复追加：
  measureWrapped(s: string | L10n, size: TextSize, maxW?: number): { w: number; h: number };
  inkMid(size?: TextSize): number;   // 从 top y 到字身（汉字 / 大写字母）中心的逻辑距离
  inkH(size?: TextSize): number;     // 字身高度（逻辑像素），给框定高用
  readonly k: number;                // 本帧文字相对布局的大小（见下）
};
// TextOpts 追加 valign?: 'top' | 'middle' —— 'middle' 时 y 是字身中心：固定高度的行、键帽、芯片、横幅一律用它。
// 文字倍率：m = round(s)；k = m/s 在 960×540 以上的窗口为 0.8–1.33（更小的窗口 0.67–1），
// 文字大小 125% 再升一级、最多 1.5。所以**任何装文字的框都必须从 lineH / measure /
// measureWrapped / inkH 推出尺寸**，不要写死 15/13 之类的像素；widgets 另有 promptH()（按键图标高 13，
// 125% 时 15）和 tagChipH()。Text.measure 返回 UI 层宽度，不适用于 1× 离屏画布烘焙的文字。

// src/engine/gfx/renderer.ts（新增成员）
r.uiScale: number;                          // 设备像素 / 逻辑像素
r.snap(v: number): number;                  // 对齐设备像素网格
r.worldToUi(x: number, y: number): { x: number; y: number };
r.label(l: WorldLabel): void;               // 每帧入队，在 UI 层画（不受后处理影响）；只能在渲染代码里调用
r.worldUi(fn: (ctx: CanvasRenderingContext2D, toUi: (x: number, y: number) => { x: number; y: number }) => void): void;   // 同上
// WorldLabel.alpha 会被抬到 minAlpha（默认 0.7，路牌永远可读）；要完全淡出的标签传 minAlpha: 0
interface WorldLabel { x: number; y: number; text: string | L10n; size?: TextSize; color?: ColorKey;
  plate?: boolean; alpha?: number; minAlpha?: number /* 默认 0.7 */; player?: number /* 槽位 */ }

// src/game/ui/widgets.ts
drawPanel(ctx, x, y, w, h, style?: 'brass' | 'dark' | 'paper' | 'slot', slot?: number): void;
drawPrompt(ctx, action: Action, x: number, y: number, who?: PlayerInput | null): number;   // 按设备画按键图标，返回宽度
drawBar(ctx, x, y, w, h, max: number, segs: { v: number; color: ColorKey; pattern?: 'solid' | 'hatch' | 'lock' }[]): void;
drawTagChip(ctx, tag: TagId, x: number, y: number): number;
drawTooltip(ctx, x, y, title: L10n, lines: L10n[]): void;
drawStamp(ctx, text: L10n, x, y, color: ColorKey, t: number): void;   // "TICK!" "PERFECT" 等印章
export type TagId = 'burn'|'rust'|'res'|'stasis'|'gear'|'echo'|'paradox'|'rewind'|'dash'|'crit'|'tempo'|'bond'|'heal';
export const TAG_COLOR: Record<TagId, ColorKey>;   // GDD2 §6.1

// src/game/ui/panels.ts —— 面板注册表（避免包之间互相 import）
Panels.register(id: string, factory: (args?: any) => Overlay): void;
Panels.open(id: string, args?: any): Overlay | null;   // 未注册返回 null（不报错）
Panels.has(id: string): boolean;
// 约定 id：'pocketWatch'(P4) 'almanac'(P7) 'controls'(P7) 'join'(F2) 'mainspring'(P6) 'armory'(P5)
//          'handStand'(P5) 'departure'(P6) 'contracts'(P6) 'ledger'(P6) 'shrine'(P6) 'rehearsal'(P7)
```

### 1.2 元数据注册表、便条、字符串、调试路由、真实时钟（F1）

```ts
// src/game/meta/registry.ts —— 所有数据都写进存档 v2（§1.11）
defineAchievement(d: { id: string; name: L10n; desc: L10n; icon?: string; hidden?: boolean; reward?: string /* unlock id */ }): void;
achieve(id: string): boolean;                     // 首次返回 true 并弹提示；未定义的 id 也会记录
hasAchievement(id: string): boolean;
defineUnlock(d: { id: string; kind: 'weapon'|'hand'|'keystone'|'cosmetic'|'mode'|'station'|'memory'|'part'|'aspect'; name: L10n; desc?: L10n; hint?: L10n }): void;
unlock(id: string, source?: string): boolean;     isUnlocked(id: string): boolean;     onUnlock(cb: (id: string) => void): void;
defineCosmetic(d: { id: string; kind: 'scarf'|'hat'|'trail'|'shadow'|'title'|'echoMask'|'companion'|'mode'; name: L10n; data?: any }): void;
export const CHIME_IDS = ['strike','homecoming','wound','minutehand','patience','westminster','ghostwriter','lostminute','watchman','dissonance','midnight'] as const;
Chimes: { ring(id: ChimeId): boolean; has(id: ChimeId): boolean; count(): number };   // ring 会发 bus 'chime' 并播放钟声
Flags: { get(id: string): number; set(id: string, v: number): void; inc(id: string, n?: number): number };   // 存档级
Stats: { add(id: string, n: number): void; get(id: string): number };   // 终身计数：rewindFrames, damage, deaths, catPets, tickDodges...
Secrets: { found(id: string, payload?: { toast?: L10n }): boolean; has(id: string): boolean };

// src/game/ui/hints.ts —— 伊妮丝的便条（GDD2 §9.2）
Hints.define(d: { id: string; text: L10n; icon?: string; pause?: boolean; glossary?: string }): void;
Hints.show(id: string, o?: { player?: number }): boolean;   // 每存档一次、20s 节流、首领转阶段时排队；未定义 id → false
Hints.seen(id: string): boolean;
Hints.onShow(cb: (id: string) => void): void;

// src/game/strings.ts（i18n.ts 保留 tr/L/Lang 并 re-export）
registerStrings(ns: string, table: Record<string, L10n>): void;
S(ns: string, key: string): L10n;             // 找不到时返回 {zh:key,en:key} 并在开发模式警告

// src/game/debugRoutes.ts
registerDebugRoute(name: string, run: (q: URLSearchParams) => boolean | Promise<boolean>): void;   // boot 依次尝试，返回 true 表示已接管

// src/game/clock.ts
RealClock: { now(): Date; freeze(d: Date | null): void; isBetween(h1: number, m1: number, h2: number, m2: number): boolean; dateIs(month: number, day: number): boolean; season(): 'halloween'|'newyear'|'leap'|'pi'|null };
// 每日一秒 / 种子局调用 RealClock.freeze(...)；调试 ?fakeTime=2026-10-31T23:59:30
```

#### 1.2b 术语表与渐进揭示（F1 实现，GDD2 §9.8，主程追加）

```ts
// src/game/strings.ts
export interface TermDef { id: string; name: L10n; plain: L10n; detail?: L10n; icon?: string; glossary?: boolean }
defineTerm(d: TermDef): void;                // F1 预置 GDD2 §9.8 表格里的全部术语；各包可追加自己的
term(id: string): TermDef | null;
// src/game/ui/widgets.ts
drawTermLabel(ctx, id: string, x: number, y: number, o?: { size?: TextSize; color?: ColorKey; align?: 'left'|'center'|'right'; forcePlain?: boolean }): { w: number; h: number };
//   画"风格名"，并在其下方用 small/K7 画 plain 白话；是否显示白话由 Terms.showPlain(id) 决定
// src/game/meta/registry.ts（存档 v2：profile.termSeen: Record<string, number>, profile.taught: string[]）
Terms: { showPlain(id: string): boolean /* 设置 termHints=always 或 auto 且看过 <3 次 */; seen(id: string): void };
Teach: { has(id: string): boolean; mark(id: string): void; onMark(cb: (id: string) => void): void };
//   渐进揭示：HUD 组件、便条、门标签据此决定是否显示高级元素（节拍、破绽、擒纵器槽、分岔提示……）
// settings: termHints: 'auto' | 'always' | 'off'（默认 auto）
```
所有包：凡是在 UI 上第一次展示术语（卡片、门、HUD 标注、商店、工作站、结算），一律用 `drawTermLabel` 或 `Terms.showPlain` + `term(id).plain`，不要自己硬写说明。

### 1.3 输入与玩家（F2）

```ts
// src/engine/input.ts + src/engine/devices.ts
export type Action = 'up'|'down'|'left'|'right'|'attack'|'special'|'dash'|'rewind'|'fork'|'interact'|'pause'|'confirm'|'cancel'|'info'|'tabL'|'tabR';
export type DeviceId = 'kbm' | 'kbL' | 'kbR' | `pad${number}` | `bot${number}`;
export class PlayerInput {
  slot: number; device: DeviceId; kind: 'kbm' | 'kb' | 'pad' | 'bot';
  down(a: Action): boolean; pressed(a: Action): boolean; released(a: Action): boolean;   // released 支持手柄
  consume(a: Action): boolean; heldFor(a: Action): number;   // 当前按住了多少秒（重击、擦带、上弦用）
  move(): { x: number; y: number };
  aim(fromX: number, fromY: number): { x: number; y: number; kind: 'mouse' | 'stick' | 'assist' | 'none' };
  nav(dt: number): { x: number; y: number };
  rumble(strong: number, weak: number, ms: number): void;   // 只震自己的手柄
  bot?: BotInput;
}
export const devices: {
  joinPressed(): DeviceId | null;         // 未占用设备按 A/Start/Enter/(kbL:F)/(kbR:K)
  claim(id: DeviceId, slot: number): PlayerInput; release(slot: number): void;
  onDisconnect(cb: (slot: number) => void): void;
  recentCodes: string[];                  // 最近 16 个按键/按钮 code（彩蛋密码）
  onSequence(seq: string[], cb: () => void, owner?: unknown): void;
};
G.input   // 菜单聚合：保持 1.0 API，= 所有已占用设备的 OR（无人加入时 = 所有设备）
G.players: PlayerInput[]   // 已加入的槽位

// src/game/players.ts
export const SLOT_COLOR: ColorKey[] = ['R3', 'B5', 'G3', 'U4'];
export const SLOT_SHAPE = ['tri', 'circle', 'square', 'diamond'] as const;
export const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'];

// src/game/progression/hands.ts（F2 建立，P5 拥有）
export interface HandDef { id: 'tick'|'mina'|'hora'|'ling'|'manman'; name: L10n; title: L10n; maxHp: number; speed: number;
  dashes: number; tape: number; rewindStyle: string; mods?(m: Mods): void; palette?: Record<string, ColorKey>; variant?: string; unlock?: string }
export const HANDS: Record<string, HandDef>;      // F2 只放 tick
buildTick(pal?: Partial<Record<string, ColorKey>>, variant?: string)   // src/art/sprites/tick.ts，帧缓存按 (variant,pal) 键控
```

### 1.4 世界、目标选择、计时器（F2）

```ts
world.players: Player[];
get world.player(): Player | null;          // 兼容：第一个存活玩家，否则第一个
world.alive(): Player[];
world.nearestPlayer(x: number, y: number, o?: { alive?: boolean; taunts?: boolean }): Actor | null;   // taunts=true 时包含嘲讽中的残响
world.hurtPlayers(shape: Shape, info: DamageInfo): number;   // 敌人直接接触伤害统一入口（替换 13 处 world.player.hurt）
world.after(sec: number, fn: () => void, owner?: unknown): void;   // 随模拟时间（受暂停/顿帧/倍速影响）
world.every(sec: number, fn: () => void, owner?: unknown): void;
world.rng: RNG;                             // 每房间由 run.rng 派生
world.playerCount: number;
world.timeScaleAt(x: number, y: number): number;   // F3 实现时间气泡；F2 先返回 world.timeScale
Enemy.target: Actor | null;                 // 仇恨评分 + 1.5s 粘滞（GDD2 §5.8）
Enemy.targetSlot: number;                   // 预警尖端色点用
Player.slot; Player.input; Player.lo; Player.color; Player.state: 'alive' | 'stopped' | 'ghost';
Player.revive(frac: number, by: Player | null, source: 'windup' | 'pullback' | 'echo' | 'room' | 'self'): void;
```

### 1.5 局状态、钩子、房间类型、路线（F2）

```ts
// src/game/run.ts
interface RunConfig { mode: 'standard' | 'daily' | 'rush' | 'practice' | 'custom'; seed: number;
  players: { slot: number; device: DeviceId; hand: string; weapon: string; aspect?: string; pact?: Patron[]; keystonePin?: string }[];
  contracts: Record<string, number>; seedText?: string }
class Run {   // 共享部分
  config: RunConfig; rng: RNG; seed; floor; roomIndex; time; brass /*共享钱袋*/; shards; stats; history; lore; eventsSeen; floorState;
  loadouts: Loadout[]; lo(slot: number): Loadout; addBrass(n: number): void; spendBrass(n: number): boolean;
  flags: Record<string, number>;   // 本局临时标记（彩蛋、多层事件）
}
class Loadout {   // 每名玩家
  slot; hand: HandDef; weapon: string; aspect: string | null; hp; sand; mods: Mods; memories: OwnedMemory[];
  hourglass: string[]; parts: string[]; calibrations: string[]; keystone: string | null; pact: Patron[];
  rerolls; banishes; locks; tape: Recording | null /* 跨房间保留 */; tempo: number;
  recompute(): void; registerHooks(w: World, p: Player): void; addSand(n: number): void; spendSand(n: number): boolean;
  get sandMax(): number; has(id: string): boolean;
}
interface HookCtx { w: World; run: Run; lo: Loadout; p: Player;
  on<K extends keyof BusEvents>(k: K, fn: (e: BusEvents[K]) => void): void;
  onMine<K extends keyof BusEvents>(k: K, fn: (e: BusEvents[K]) => void): void;   // 只收 e.player === p 的事件
}

// src/game/hooks.ts —— 全局生命周期钩子（彩蛋、收入、便条都用它，不用改场景文件）
GameHooks.onRunStart(fn: (run: Run) => void): void;
GameHooks.onRoomStart(fn: (c: { w: World; run: Run; scene: GameScene; kind: RoomKind }) => void): void;   // 在 bus 清空后、hooks 注册后调用
GameHooks.onRoomClear(fn: (c: { w: World; run: Run; scene: GameScene; grade: 'S' | 'A' | 'B' }) => void): void;
GameHooks.onRunEnd(fn: (run: Run, kind: RunEndKind) => void): void;
GameHooks.onHub(fn: (scene: HubScene) => void): void;
GameHooks.onTitle(fn: (scene: TitleScene) => void): void;
GameHooks.onPauseTick(fn: (pausedSec: number) => void): void;
Cutscenes.register(id: string, factory: (then: () => void) => Scene): void;   // P7 注册 'intro' 'ending' 'belfry' 'true' 'forever' 'credits'
Cutscenes.play(id: string, then: () => void): void;                          // 未注册时直接调用 then()（不报错）

// src/game/progression/patrons.ts（F2 建立空实现，P6 拥有）
Patrons: { isRescued(p: Patron): boolean; rescue(p: Patron): void; addAffinity(p: Patron, n: number): void; level(p: Patron): number };
// src/game/progression/events.ts（F2 提供默认实现 = 1.0 的均匀随机，P7 替换为加权/条件版）
export function pickEvent(run: Run): EventDef;

// src/game/rooms/registry.ts —— 房间类型注册（门表权重由各类型自己给）
export type RoomKind = 'combat'|'elite'|'boss'|'shop'|'event'|'rest'|'vault'|'treasure'|'start'|'hub'|'tutorial'
  |'rescue'|'trial'|'secret'|'miniboss'|'wrongHour'|'leap'|'prologue'|'rehearsal'|'belfry'|'lostminute';
RoomTypes.register(kind: RoomKind, d: { label: L10n; icon: string; combat: boolean;
  weight(run: Run, floor: number, roomIdx: number): number; oncePerFloor?: boolean; advancesRoom?: boolean /* 默认 true */;
  build(scene: GameScene): void; doorInfo?(run: Run): L10n }): void;
RoomTypes.get(kind): RoomTypeDef | undefined;
// F2 注册 1.0 已有的类型；rescue(P6) trial/treasure/secret/leap(P2) miniboss/belfry/lostminute(P3) wrongHour(P4) prologue/rehearsal(P7)

// src/game/routes.ts —— 楼层路线
Routes.floors(run: Run): FloorDesc[];   // 默认 4 层
Routes.registerBranch(b: { id: string; afterFloor: number; cond(run: Run): boolean; floor: FloorDesc }): void;   // P3：失落的一分钟 / 钟楼
interface FloorDesc { id: string; theme: number | string; rooms: number; boss: string | null; name: L10n; timecode: string }
```

### 1.6 HUD 组件注册（F2 建立，P1 拥有 hud.ts）

```ts
// src/game/ui/hud.ts
Hud.register(w: { id: string; area: 'pod' | 'top' | 'bottom' | 'corner'; order: number;
  draw(ctx: CanvasRenderingContext2D, p: Player | null, rect: { x: number; y: number; w: number; h: number; compact: boolean }): void }): void;
Hud.podRect(slot: number): Rect;   // 单人 176×44 左上；多人 132×32 四角（GDD2 §12.2）
// 约定 id/order：hp(10,F3) tape(20,F3) sand(30,F3) dash(40,F2) special(50,F2) tempo(60,P1) keystone(70,P4)
//                objective(top,P2) chain(top,F3) brass(corner,F2) slots(bottom,P4) metaKey(pod,P6)
```

### 1.7 事件总线（F2 声明完整列表；之后冻结）

所有与玩家相关的事件都带 `player?: Player`（发出者/归属者）。生产包只能**发出/订阅**这些事件；需要新事件时用 `custom`。

| 事件 | 载荷 | 由谁发出 |
|---|---|---|
| `hit` | `{target, info, dealt, player?}` | combat |
| `kill` | `{target, info, player?}` | combat |
| `damaged` | `{info, dealt, player, undoable}` | player |
| `attack` / `special` | `{owner, player, combo/angle, echo, heavy?}` | weapons |
| `dash` / `dashEnd` | `{owner, player, dx, dy, echo}` | player / echo |
| `rewind` | `{player, fromX, fromY, toX, toY, restored, seconds, cost, perfect, scrub}` | F3 |
| `fork` | `{player, echo}` | F3 |
| `echoSpawn` / `echoArmed` / `echoEnd` | `{echo, player}` / `{echo, player}` / `{echo, player, paradox}` | F3 |
| `paradox` | `{x, y, echo, player, kind: 'overlap'\|'pierce'\|'chain'\|'recall'\|'quartet', chain: number, duet: boolean}` | F3 |
| `sync` | `{player, target, sources: number}` | F3 |
| `culprit` | `{player, target}` | F3 |
| `perfectRewind` | `{player}` | F3 |
| `tickDodge` | `{player, x, y}`（旧的 `perfectDodge` 作为别名同时发出） | F3 |
| `interrupt` / `poiseBreak` / `deflect` | `{player?, target}` / `{player?, target}` / `{player, bullet}` | P1 |
| `tempoRank` | `{player, rank, prev}` | P1 |
| `downed` / `revived` / `ghost` | `{player}` / `{player, by, source}` / `{player}` | F2 |
| `playerJoin` / `playerLeave` | `{slot}` | F2 |
| `roomStart` / `roomClear` / `waveStart` | `{kind}` / `{grade}` / `{wave}` | F2 / P2 |
| `objective` | `{id, state: 'start'\|'done'\|'fail'}` | P2 |
| `hazardHit` | `{hazard, target}` | P2 |
| `pickup` / `statusApplied` / `spawn` / `tick` | 同 1.0（`pickup`/`statusApplied` 增加 `player?`） | 各处 |
| `secret` / `achievement` / `chime` / `hint` | `{id}` | F1 |
| `custom` | `{id: string, player?: Player, data?: any}` | 任何包 |

### 1.8 回溯 / 残响 / 悖论（F3）

```ts
// src/game/systems/rewind.ts
class Recorder { push(f: Frame): void; at(i: number): Frame; oldest(): Frame; get length(): number; get seconds(): number;
  cutFrom(i: number): Recording;          // 返回 [i..now] 作为残响录像，自身截断到 [0..i)
  slice(fromSec: number): Recording;      // 分岔用：最近 fromSec 秒的拷贝，不截断
  prefill(x: number, y: number, frames: number, base: Partial<Frame>): void;
  fixedSince(i: number): number; tempoAt(i: number): number; hpAt(i: number): number; }
// Frame 新增：tempo, culprits(本帧伤害来源 id 列表)

// Player（rewind 部分）
p.canRewind(): { ok: boolean; reason?: 'sand' | 'tape' | 'anchor' | 'burnt' | 'state' };
p.rewindPreview(): { frame: number; x: number; y: number; hpGain: number; locked: number; cost: number };
p.fork(): boolean;
p.pullBack(target: Player): boolean;     // 拉回倒地队友（GDD2 §5.5）
p.catchUpTo(x: number, y: number): void; // 追赶回溯

// src/game/systems/rewindStyles.ts（F3 实现 'standard'；P5 拥有并添加 mina/hora/ling/manman）
interface RewindStyle { id: string;
  cost(p: Player, seconds: number): number;
  commit(p: Player, frameIdx: number, rec: Recording): void;   // 移动/回血/生成残响
  teleports: boolean; }
RewindStyles.register(s: RewindStyle): void;

// src/game/entities/echo.ts（F3 实现；P4 拥有）
new Echo(owner: Player, rec: Recording, o?: EchoOpts);
interface EchoOpts { kind?: 'walk' | 'statue' | 'bell' | 'fork' | 'dash'; speed?: number; dmgScale?: number; life?: number;
  standT?: number; loops?: number; gilded?: boolean; taunt?: number; integrity?: number; onStep?: (e: Echo) => void }
echo.owner: Player; echo.armed: boolean; echo.integrity: number; echo.shatter(by?: Actor): void;
echo.cues(): { t: number; x: number; y: number; kind: 'attack' | 'special' | 'dash' | 'last' }[];
echo.isTaunting: boolean; echo.endX/endY;

// src/game/systems/paradox.ts（F3 实现；P4 拥有）
Paradox.trigger(o: { x: number; y: number; owner: Player; echo?: Echo; kind: 'overlap' | 'pierce' | 'chain' | 'recall' | 'quartet';
  dmgMul?: number; radius?: number; line?: { ax: number; ay: number; bx: number; by: number; w: number }; chain?: number }): void;
Paradox.preview(p: Player): { kind: 'circle' | 'line'; x: number; y: number; r?: number; line?: any } | null;
```

### 1.9 战斗契约（F3 提供字段与最小实现，P1 完成）

```ts
interface DamageInfo { /* 1.0 字段 + */ src?: number /* slot*2+(echo?1:0)，敌人 = -1 */; player?: Player;
  heavy?: boolean; poise?: number; counter?: boolean; reversed?: boolean; sync?: number; tags?: TagId[]; hazard?: boolean }
Actor.marks: Map<string, { t: number; stacks: number; src: number }>;   // 新状态（刻痕、丝带、元凶）用这里，不改 entity.ts
Actor.lastHits: { src: number; t: number }[];                           // 同步判定
Actor.culpritOf: Map<number /*slot*/, number /*剩余秒*/>;
Enemy.windup(state: string, dur: number, o?: { interruptible?: boolean /*默认 true*/; armored?: boolean; tele?: TeleSpec }): void;
Enemy.interruptWindow: boolean;     // 前摇最后 0.18s
Enemy.poise: number; Enemy.poiseMax: number; Enemy.breakT: number;
Enemy.stagger(t: number, why: 'hit' | 'interrupt' | 'break' | 'wall'): void;   // 会暂停 stateT
Enemy.affixes: string[];            // P2 填充
Bullet.reversible: boolean;         // 白芯；P1 实现翻转
```

### 1.10 Mods 完整字段（F3 预先声明，之后冻结）

1.0 字段全部保留，另加（默认值见 GDD2 §3.12 / §4）：
`tapeLen, rewindCostPerSec, rewindMinCost, rewindTapThreshold, scrubFreeFirst, scrubMax, perfectWindow, forkCost, forkLen, forkCd, recall, recallDmg, echoArm, echoStandT, echoContactR, echoIntentDeg, echoTauntT, echoLoops, echoSentinelT, echoSentinelRate, echoDecoyHp, echoIntegrity, paradoxPierceDmg, paradoxChainMul, paradoxChainRange, paradoxLeavesEcho, paradoxInvuln, paradoxSand, syncWindow, syncBonus, chordBonus, culpritT, culpritBonus, tickDodgeWindow, tickDodgeSlow, tickDodgeSand, counterMult, deflectMul, poiseMul, heavyMul, tempoDecay, tempoFloor, tempoCap, reviveTime, landInvuln, sandMaxBonus`，
以及兜底的 `flags: Record<string, number>`（擒纵器与新零件用，例如 `flags.transposition = 1`）。

### 1.11 存档 v2（F1 定义结构与迁移；P6 拥有 save.ts）

`localStorage['secondhand.profile.v2']`，`version: 2`。新增字段：`achievements: string[]`、`secrets: string[]`、`flags: Record<string,number>`、`unlocks: string[]`、`chimes: string[]`、`cosmetics: {owned: string[]; equipped: Record<string,string>}`、`hints: string[]`、`stats: Record<string,number>`、`mastery: Record<string,{xp:number; lv:number}>`、`affinity: Record<Patron,number>`、`rescued: Patron[]`、`contracts: Record<string,number>`、`clockNodes: string[]`（主发条）、`lastSeen: number`、`deathTapes: {floor:number; frames:string /*压缩*/}[]`（最多 5 条）、`prologueDone: boolean`、`daily: Record<string,number>`。
迁移：读取 v1 → 退还已花费碎片（按 1.0 成本表求和，**包括武器节点**，GDD2 §10.3"退还所有已花费的碎片，保留已解锁武器"）→ 保留 `weapons`、计数、`seen`、`lore`、`ines` → `wins ≥ 1` 时解锁契约。v2 坏档另存为 `.v2.corrupt.<时间戳>` 后回落到 v1 迁移。

---

## 2. 工作包 (Work Packages)

### F1 · 清晰文字、UI 工具箱与共享注册表

- **阶段**：foundation · **顺序** 1 · **依赖**：无
- **拥有（本阶段）**：`src/engine/gfx/font.ts` `src/engine/gfx/post.ts` `src/engine/gfx/renderer.ts` `src/main.ts` `src/game/G.ts` `index.html` `src/game/ui/draw.ts` `src/game/ui/prompts.ts` `src/game/i18n.ts` `src/game/boot.ts` `src/game/save.ts` `src/game/settings.ts`，以及为 FP10 重排版而做的局部修改：`src/game/ui/overlay.ts` `hud.ts` `pause.ts` `menu.ts` `controls.ts` `metaPanels.ts` `eventOverlay.ts` `dialogue.ts` `src/game/entities/interact.ts` `src/game/rooms/tutorial.ts` `src/game/rooms/special.ts` `src/game/world/fx.ts` `src/game/scenes/game.ts` `summary.ts` `title.ts` `hub.ts` `cutscene.ts`
- **新建**：`src/assets/fonts/fusion-10.woff2` `tools/subset-fonts.py` `tools/textcheck.cjs` `tools/fixtures/profile_v1.json` `src/game/ui/text.ts` `src/game/ui/widgets.ts` `src/game/ui/panels.ts` `src/game/ui/hints.ts` `src/game/meta/registry.ts` `src/game/clock.ts` `src/game/strings.ts` `src/game/debugRoutes.ts` `src/audio/sfx_combat.ts` `sfx_encounters.ts` `sfx_bosses.ts` `sfx_builds.ts` `sfx_hands.ts` `sfx_meta.ts` `sfx_story.ts`（空注册函数）
- **共享触点**：§1.1、§1.2、§1.11 全部接口。
- **任务书**：
  1. **Phase 0**：修复下伸部截断（`font.ts` 字形画布高度改为 `ceil(fontBoundingBoxAscent+Descent)+2`，草稿画布同步）；对比度地板（9 处 K4–K6 文字改为 ≥K7/K8）；缺字 ⧉ ✥ 改为 `widgets.ts` 里手绘的手柄按钮图标。
  2. **Phase 1**：下载 Fusion Pixel 10px Prop zh_hans（OFL，同 1.0 字体来源）为 `G.small`；FP8 改名 `G.tiny`（只允许拉丁/数字）；HUD 数字 3×5 → 5×7；约 25 处布局调整（按键框高 13–14、交互框 15、卡片偏移、发条面板、事件选项、暂停、结算、楼层卡 96–150 带、菜单提示）。若网络无法获取 FP10，回退方案：所有中文用 FP12，`small` = FP12，并在报告注明。
  3. **Phase 2**：UI 改为 DOM 覆盖画布 `<canvas id="ui">`（`pointer-events:none`），尺寸 = `post.layout()` 的设备像素；`begin()` 中 `ui2.setTransform(L.s,…)`，所有现有 UI 调用继续用 640×360 逻辑坐标；`PixelFont.draw` 在上下文带缩放时以整数倍 `m=max(1,round(s))` 在设备坐标绘制缓存字形块，`measure` 返回逻辑宽度；`rect()` 对齐设备网格；从 `FS_FINAL` 移除 UI 纹理；2D 回退路径同步。保留 `title.ts` 标志烘焙与 `metaPanels.ts:194` 伪渲染器的 1× 路径。
  4. **Phase 3**：世界标签队列 `r.label()` / `r.worldUi()`；把交互提示、路牌、商店说明、慢慢气泡、伤害数字与横幅（`fx.ts`）迁移过去；路牌最低不透明度 0.7。
  5. 字体子集化：`tools/subset-fonts.py` 扫描 `src/**/*.ts` 字符串 + ASCII，用 fontTools 生成子集，接入 `build`/`build:single`。
  6. 注册表与工具：`registry.ts`（成就/解锁/外观/钟响/标记/统计/秘密）、`hints.ts`（含节流与单人暂停）、`panels.ts`、`strings.ts`、`debugRoutes.ts`（`boot.ts` 先遍历路由再走默认流程）、`clock.ts`（含 `?fakeTime=`）、存档 v2 结构与 v1 迁移、设置新增 `textSize`、`hudLabels`、`rewindMode`、`flashLimit`、接上 `showDamage`。
  7. 在 `main.ts` 预留 7 个生产包音效注册调用。
- **验收**：
  - `npm run typecheck` 通过；`npm run build:single` 成功且 `dist-single/index.html` ≤ 1.6 MB。
  - `node tools/shot.cjs "scene=title" tools/out/F1/title_1536.png 3000 1536 730` 与 `… 1920 969`：用 `node tools/textcheck.cjs <png> <x> <y> <w> <h>` 量一条标题文字区域，不同颜色数 ≤ 8（1.0 为 600–700）。
  - `?seed=1&floor=0&god=1&offer=oren` 在 1920×969 截图：卡片标签为 10px、"将替换"为 12px，无 8px 中文；`?lang=en` 同 URL 中 "Triggering" 的 g 完整。
  - `?scene=hub` 截图：工作站名与交互提示清晰；在回溯进行中截图（脚本按 Q），世界标签不随扫描线抖动。
  - 120s bot 跑（`seed=21&bot=1&speed=8&god=1`）控制台 `[text] CJK in tiny` 警告 0 条、运行时错误 0。
  - 把 `tools/fixtures/profile_v1.json`（F1 新建，含 3 个已购节点）放进 localStorage 后加载：v2 档案碎片 = 原碎片 + 退还额；`?debug=registry` 路由打印注册表计数；`achieve('test')` 刷新后仍在。

### F2 · 多手同刻：本地联机核心

- **阶段**：foundation · **顺序** 2 · **依赖**：F1
- **拥有（本阶段）**：`src/engine/input.ts` `src/engine/rumble.ts` `src/engine/camera.ts` `src/game/G.ts` `src/game/run.ts` `src/game/flow.ts` `src/game/world/world.ts` `src/game/systems/bus.ts` `src/game/systems/combat.ts`（归属/送砂改为 owner） `src/game/entities/player.ts` `enemy.ts` `projectile.ts` `interact.ts` `door.ts` `pickup.ts` `boss.ts` `src/game/entities/enemies/*.ts` 与 `bosses/*.ts`（仅 13 处直接伤害点与 `world.player` 引用） `src/game/progression/memories.ts` `parts.ts` `calibrations.ts` `hourglass.ts` `effectEnts.ts` `events.ts` `rewards.ts`（仅 HookCtx/归属重构） `src/game/weapons/*.ts`（归属） `src/game/world/director.ts`（多人预算缩放） `src/game/scenes/game.ts` `hub.ts` `title.ts` `src/game/ui/hud.ts` `overlay.ts` `controls.ts` `metaPanels.ts`（武器架按玩家） `src/game/rooms/special.ts` `tutorial.ts` `src/game/qa/bot.ts` `src/art/sprites/tick.ts` `src/game/entities/scarf.ts`
- **新建**：`src/engine/devices.ts` `src/game/players.ts` `src/game/hooks.ts` `src/game/rooms/registry.ts` `src/game/routes.ts` `src/game/progression/hands.ts` `src/game/progression/patrons.ts`（空实现） `src/game/ui/joinPanel.ts` `src/game/systems/downed.ts` `tools/padtest4.cjs` `tools/scripts/coop.json`
- **共享触点**：§1.3、§1.4、§1.5、§1.6、§1.7 全部接口。
- **任务书**：
  1. **输入**：`DeviceHub` 按 `gp.index` 管理所有手柄；`PlayerInput` 每槽一个；`kbm` / `kbL` / `kbR` 三种键盘档（GDD2 §2.1–2.2 默认键位，按设备分别重绑）；新增 `fork`、`tabL/tabR` 动作；`released()` 支持手柄；`heldFor()`；每手柄独立震动（`rumble.ts` 26 处调用改为 `p.input.rumble` 或 `rumbleAll`）；`recentCodes` / `onSequence`；控制面板可用手柄取消重绑。`G.input` 保持为菜单聚合。
  2. **世界**：`world.players[]` + 兼容 getter；`nearestPlayer`；仇恨评分与粘滞；多源 BFS 流场；13 处直接 `world.player.hurt` 改为 `world.hurtPlayers` 或 `combat.add`；追踪敌弹找最近玩家；`world.after/every`（替换 `tutorial.ts:44`、`maul.ts:50`、`memories.ts:97,223,292`、`parts.ts:48` 的 `setTimeout`）；`world.rng`（首领队列里的 `Math.random` 改为它）。
  3. **局状态拆分**：`Run`（共享）+ `Loadout`（每人）；`registerHooks` 按玩家；23 处 `c.p` 改为按 owner 解析；燃烧/锈蚀/共鸣/定格的归属与送砂改到 `info.owner` 对应的 Loadout；治疗类效果作用于 owner；`RunConfig` 与 `Flow.startRun(config)`。
  4. **玩家**：`Player` 读 `this.input`；槽位颜色围巾与形状徽记（`buildTick(pal)`）；`HandDef` 表（只做 Tick）；停摆 / 上弦 / 残响救援 / 幽灵 / 房间开始复活（`systems/downed.ts`）；单人"最后一秒"窗口（1.5s 0.2× + 提示；回溯部分由 F3 接上）。拉回与自救留接口给 F3。
  5. **镜头与门**：多人中点 + 拴绳 600×340 + 出屏箭头；取消多人前瞻；门 `n/N` 站门规则；离开房间与死亡判定改为全员。
  6. **奖励与界面**：每人一个奖励球（颜色）；`ChoiceOverlay(input, rect)` 每人一份、多人紧凑列表；商店按住购买、共享钱袋；休息站每人选；事件归第一个交互者。HUD 铭牌框架 + `Hud.register`（单人 176×44，多人四角 132×32）；本包注册 `dash`、`special`、`brass` 三个组件，并临时把 1.0 的血条/沙漏作为 `hp`/`sand` 组件（F3 替换）。
  7. **加入流程**：标题"同行"→ `joinPanel`（4 槽位卡）；工坊热加入（落地钟门弹出 + 横幅）、离开、断线暂停；局中加入（下个房间 + 补选回忆）。
  8. **钩子与注册表**：`hooks.ts`（`GameHooks` 在 `GameScene.enter/leave`、`Flow.endRun`、`HubScene.enter`、`TitleScene.enter`、暂停中调用；`Cutscenes` 注册表，1.0 的开场/结局/字幕先注册为默认实现）；`events.ts` 导出默认 `pickEvent(run)`；`patrons.ts` 空实现；`rooms/registry.ts` 注册 1.0 全部房间类型，`rewards.ts` 的门表改为读取注册表权重（数值保持 1.0）；`routes.ts` 默认 4 层。
  9. **机器人**：每槽 `BotInput`；`?bot=1&players=N`（N 个机器人），`?players=N`（N-1 个机器人 + 你）；`?devices=kbm,pad0,pad1` 指定设备。
  10. 多人数值缩放表（GDD2 §5.8）接入 `enemy.ts` / `director.ts` / 首领基类 / 黄铜。
- **验收**：
  - `npm run typecheck`；单人回归：`node tools/qarun.cjs "seed=21&bot=1&speed=8&god=1" 600 tools/out/F2/solo` 打到第 4 层首领并通关，0 错误。
  - `node tools/qarun.cjs "seed=3&floor=0&god=1&bot=1&players=4&speed=8" 180 tools/out/F2/coop4`：4 个机器人推进 ≥ 6 个房间，0 错误；截图中 4 根不同颜色/形状的表针与 4 个铭牌。
  - `node tools/padtest4.cjs "scene=hub"`（虚拟 4 手柄）：每个手柄按 A 各加入一名玩家，左摇杆只移动自己的玩家，`__rumbles` 按手柄 index 分别计数。
  - `node tools/shot.cjs "seed=5&floor=1&players=2&bot=1" tools/out/F2/down.png 6000 1280 720 tools/scripts/coop.json`：脚本把 P2 生命设为 0 → 截图出现 12 刻度停摆环；P1 机器人上弦后 P2 以 35% 复活（eval 检查）。
  - eval：两名玩家分站房间两端时，每个敌人的 `target` 是更近的玩家；门显示 `1/2`。
  - `?scene=title` → 选"同行"能打开加入面板；`?scene=hub&players=2` 截图中两人围巾颜色为 R3/B5。

### F3 · 回溯 2.0 与战斗契约

- **阶段**：foundation · **顺序** 3 · **依赖**：F1、F2
- **拥有（本阶段）**：`src/game/systems/rewind.ts` `src/game/entities/echo.ts` `src/game/entities/player.ts` `src/game/entities/entity.ts` `src/game/entities/enemy.ts` `src/game/entities/projectile.ts` `src/game/systems/combat.ts` `src/game/run.ts`（Mods 完整字段、时砂池） `src/engine/gfx/post.ts`（局部倒带涟漪 uniform） `src/game/world/world.ts`（时间气泡） `src/game/ui/hud.ts`（替换 hp/sand 组件） `src/audio/sfx.ts` `src/game/weapons/weapon.ts`（重击/冲刺攻击钩子、残响意图修正） `src/game/weapons/maul.ts`（残响冲击波系数与归属） `src/game/progression/hourglass.ts`（`hg_stable` 修复、移除 `hg_lastsecond`） `src/game/progression/parts.ts`（`twin_mirror` 修复） `src/game/rooms/tutorial.ts`（让旧教学房在新回溯下仍可用） `src/game/qa/bot.ts`（会用轻按/擦带/分岔） `src/game/entities/bosses/stillness.ts` `archivist.ts`（所有玩家残响可动；修订读取新 `src`）
- **新建**：`src/game/systems/rewindStyles.ts` `src/game/systems/paradox.ts` `src/game/systems/timeBubble.ts` `src/game/ui/rewindHud.ts` `tools/scripts/rewind2.json`
- **共享触点**：§1.8、§1.9、§1.10；替换 HUD 组件 `hp`、`tape`、`sand`、`chain`。
- **任务书**：
  1. **录像**：`Recorder` 支持 `cutFrom/slice/prefill`，帧内记录节拍与伤害来源；回溯后不清空；磁带存在 `Loadout.tape`，跨房间保留，进房时预填 3s 站在入口。
  2. **回溯**：轻按（<0.18s）/ 按住擦带（光标 3s/0.9s、最长 1.2s、冲刺取消）；按下即无形；代价 `clamp(round(33.4×s),25,100)`；时砂池 100×沙漏数、开局满、每层补满；落地 0.5s 无敌环；`+N` 世界标签；拒绝原因文字；最后一秒（接 F2 窗口）；完美回溯（0.2s、返还、镀金残响）；元凶标记与磁带白菱形；拉回队友、自救、追赶回溯；`RewindStyles` 只实现 `standard`。
  3. **时间气泡**：`world.timeScaleAt()`，实体 update 用各自缩放；单人 = 全局 0.15×；多人 r72。后处理加 `uRewindCenter/uRewindRadius`，倒带涟漪只在圈内，圈外擦带时降饱和 30%；闷音 0.5s；擦带卡带"咔"声（`sfx.ts`）。
  4. **旧影与 HUD**：旧影描边 + 游丝 + 头顶 `+HP` / `−N🔒`（世界标签）；三色血条；磁带条（红/紫刻痕、白菱形、锚灰）；时砂数字；`rewindHud.ts` 注册 `hp/tape/sand/chain`。
  5. **分岔**：50 时砂、最近 2.0s、冷却 1.0s、终点钟面图标；召回（`mods.recall` 为 1 时按住分岔 0.4s）。
  6. **残响 2.0**：`owner`、主人围巾色与形状徽记、0.4s 就绪（◆ + 实线 + 脉冲）、驻留 0.6s、接触 16px、意图修正 ±30°、2px 虚线路径 + 行动珠倒数 + ★ + »、嘲讽 0.6s（接上 `tauntEcho`）、完整度 3、`EchoOpts` 全部选项可用（P4/P5 依赖）、每人上限与全队 8 上限、别人路径 40%。
  7. **悖论**：移出 `player.ts` 到 `systems/paradox.ts`；重合/穿越/连锁/二重奏/召回；预告圈；命中可破坏物；0.5s 无敌、+20 时砂、3× 破绽；`hg_stable` 1.0s 冷却。
  8. **同步与卡秒**：`applyDamage` 记录 `lastHits` 并判定同步/和弦（+50%/+100%，每目标每秒 1 次和弦），发 `sync`；`hurt()` 中判定卡秒（冲刺前 0.16s 被挡下、0.5s 间隔），发 `tickDodge`，给 +25 时砂与 1.2s 反击暴击；其余视觉奖励（世界减速、印章）也在本包完成。
  9. **战斗契约字段**（§1.9）：`DamageInfo` 新字段、`Actor.marks/lastHits/culpritOf`、`Enemy.windup()`（含最后 0.18s 闪白与 `interruptWindow`）、`poise/poiseMax/stagger()`（硬直暂停 `stateT`，修复 `enemy.ts:75-77`）、`Bullet.reversible` 字段（翻转逻辑由 P1 做）。把 1.0 各敌人的前摇改用 `windup()` **不在本包范围**（P2）；本包只保证接口可用并在齿轮仔上示范一次。
  10. `Mods` 完整字段（§1.10）与默认值。
- **验收**：
  - `npm run typecheck`；单人 bot 全通关回归 0 错误；`?bot=1&players=4` 180s 0 错误。
  - `node tools/shot.cjs "seed=2&floor=0&god=1&spawn=cogling" tools/out/F3/rw.png 1500 1280 720 tools/scripts/rewind2.json` 截图序列可见：旧影与 `+HP`、三色血条、磁带红刻痕；按住 Q 时的预览影与 `−N` 代价；松开后的倒带涟漪（非全屏）；分岔残响走到脚下、0.4s 后出现 ◆；走进去出现悖论横幅；两个残响时出现 `连锁 ×2`。
  - eval：1s 擦带后 `p.rec.seconds ≥ 1.9`（磁带未清空）；进入新房间 0.1s 内 `p.canRewind().ok === true`；与 `hg_stable` 残响重叠 2s 内悖论次数 ≤ 2；2 人局一人擦带时 200px 外的敌人位置仍在变化。
  - 调试路由 `?drill=perfect`（本包注册）：脚本在敌人攻击前 0.1s 按回溯 → `perfectRewind` 事件触发，时砂未减少。
  - `?drill=tickdodge`：齿轮仔冲锋时冲刺 → 出现"TICK!"，下一击暴击。

### P1 · 战斗深度 (Combat Depth)

- **阶段**：production · **依赖**：F1、F2、F3
- **拥有**：`src/game/systems/combat.ts` `src/game/entities/player.ts` `src/game/entities/enemy.ts` `src/game/entities/projectile.ts` `src/game/entities/fxents.ts` `src/game/world/world.ts` `src/game/world/fx.ts` `src/game/ui/hud.ts` `src/game/ui/rewindHud.ts` `src/game/weapons/weapon.ts` `rapier.ts` `maul.ts` `bow.ts` `chakram.ts` `src/engine/audio/music.ts` `src/game/qa/bot.ts` `src/audio/sfx_combat.ts`
- **新建**：`src/game/systems/tempo.ts` `src/game/systems/teamTech.ts` `src/game/strings/combat.ts` `tools/scripts/combat.json`
- **共享触点**：使用 §1.6–1.10；发出 `interrupt` `poiseBreak` `deflect` `tempoRank`；注册 HUD `tempo`；读取 `weapon.aspect`（元数据由 P5 在 `weapons/index.ts` 定义，id：`rp_pendulum` `ml_anvil` `bw_startrail` `ck_relay`）；`Bullet.reversible` 的取值由各敌人所属包设置。
- **任务书**：GDD2 §4 全部。逆弹（任何玩家/残响攻击判定碰到白芯弹 → 翻转、×1.3 速度、×2 伤害、+5 时砂）；打断（重型命中 + `interruptWindow`；金色霸体）；破绽条完整实现（点数、衰减、爆发 2.5/3.0s、+50%、上限 +25%、首领"钟停了"表盘）与杂兵硬直递减；撞墙/敌敌相撞/坑击落默认化；重击（按住 0.4s 蓄力圈）与冲刺攻击（结束后 0.15s）框架 + 4 把旧武器的重击、冲刺攻击与"相"（GDD2 §4.6）；节拍系统（点数、5 阶、衰减、受伤掉阶、回溯恢复到落点值、合奏、房间评级 S/A/B 计算并通过 `GameHooks.onRoomClear` 的 grade 字段输出）；打击感分级与方向性震屏、击杀白剪影；音乐强度层 API `G.music.setIntensity(0..4)` 与午夜钟层；合针 Noon / 整点、击掌上弦、霍拉弹射接口 `p.launch(ally, angle)`；预警尖端玩家色点（`Enemy.targetSlot`）；伤害数字开关与闪光限制；机器人学会卡秒/重击/分岔。彩蛋：#5 π 日、#23 不是今天、#26 坑里有灰、#33 理发店四重唱。
- **验收**：
  - typecheck；单人与 4 人 bot 回归 0 错误。
  - `?drill=reverse`（本包注册：一个射白芯弹的炮台）：攻击子弹后子弹变青并命中炮台，eval `stats.deflects ≥ 1`。
  - `?seed=4&floor=0&god=1&spawn=brute`：截图可见破绽条；打满后出现"BREAK"、敌人硬直、前摇被取消（eval `breakT > 0` 且无伤害判定生成）。
  - 截图：节拍摆锤从 嘀 升到 钟鸣；受伤后掉阶、回溯后恢复（eval `lo.tempo` 前后值）。
  - 4 把旧武器的重击与冲刺攻击各有一张截图（`tools/out/P1/heavy_<w>.png`）；手柄重击可用（padtest 按住 X 0.5s）。
  - `?players=2&bot=1`：两个机器人相距 <28px 同时特技 → 正午光柱（`?drill=noon` 强制）。

### P2 · 敌人、遭遇与地形 (Enemies, Encounters & Hazards)

- **阶段**：production · **依赖**：F1、F2、F3
- **拥有**：`src/game/entities/enemies/gearworks.ts` `conservatory.ts` `archive.ts` `clockface.ts` `src/game/entities/props.ts` `src/game/entities/door.ts` `src/game/world/director.ts` `roomgen.ts` `room.ts` `roomRender.ts` `enemyDef.ts` `stockProps.ts` `src/game/scenes/game.ts` `artPreview.ts` `roomPreview.ts` `src/art/themes.ts` `src/art/biomes/*.ts` `src/art/sprites/gearworks.ts` `conservatory.ts` `archive.ts` `clockface.ts` `props.ts` `src/audio/sfx_archive.ts` `sfx_clockface.ts` `sfx_conservatory.ts` `sfx_encounters.ts`
- **新建**：`src/game/entities/enemies/gearworks2.ts` `conservatory2.ts` `archive2.ts` `clockface2.ts` `src/game/entities/affixes.ts` `src/game/entities/hazards.ts` `src/game/world/templates.ts` `src/game/world/objectives.ts` `src/game/rooms/secretRooms.ts` `src/art/sprites/enemies2.ts` `src/game/strings/encounters.ts`
- **共享触点**：`Enemy.windup/poise/affixes`、`Bullet.reversible`；`RoomTypes.register('trial'|'treasure'|'secret'|'leap')`；发 `objective` `hazardHit`；HUD 组件 `objective`；`GameHooks.onRoomClear` 的调用点在 `game.ts`（本包保持调用）；房间生成输出 `map.secrets: {x,y,w,h,kind:'crack'|'bell'|'plate'}[]` 与 `T.CRACK` 瓦片（P3/P7 只读）；`Chimes.ring('westminster')` 由本包调用；冻雨/蝴蝶/书页的计数用 `Flags`。
- **任务书**：GDD2 §7.1–7.6、§8.2（试炼、裂墙宝库、侧门密室、跃日房）。12 个新普通敌人 + 公证人 + 4 个新精英（每层新文件 `<floor>2.ts`，各自 ROSTER 双语图鉴）；10 个精英词缀（`affixes.ts`，使用 `aura` 字段，头顶图标 + 12px 名称）；1.0 全部敌人的前摇改用 `Enemy.windup()`、给小型弹设置 `reversible`、给重型敌人设 `poiseMax`；10 种波次模板 + 定位配额 + 3 房不重复（`templates.ts` / `director.ts`）；冻结伏击；5 种房间目标 + 6 种房间变奏（`objectives.ts`，门上第二图标与门标签文字 — `door.ts` 接近时显示奖励名、说明、目标/变奏）；12 种地形机关（`hazards.ts` + `applyObstacles(biome)` + 生物群系美术）；会回溯的可破坏物；裂墙（悖论打开，重绘墙面）与侧门密室（东西门，不推进房间序号）；威斯敏斯特 4 口裂铃（每层一口，音高 E/G♯/F♯/B，同一局按序同步敲响 → 钟响 #6 + 解锁 `marta_belfry`）。彩蛋：#2、#20、#30、#36、#47，及可选的书页/雨伞/幻影面具（§11.2）。万圣节帽子：`RealClock.season()==='halloween'` 时齿轮仔戴南瓜帽。
- **验收**：
  - typecheck；单人与 2 人 bot 回归 0 错误。
  - `?scene=art_enemies2&page=0..3`（本包注册）每层新敌人精灵页截图；`?floor=N&god=1&spawn=<新id>` 每个新敌人各一张战斗截图，预警 ≥0.35s。
  - `?floor=2&god=1&spawn=hourglassgolem&affix=eraser,anchored`：截图可见两个词缀图标与名称；锚圈内磁带变灰（eval `canRewind().reason==='anchor'`）。
  - `?floor=0&seed=9&god=1&template=frozenAmbush`：开局敌人为静止雕像，越过中线后苏醒。
  - `?floor=0&seed=11&god=1&hazard=steam,conveyor,crusher`：截图可见三种机关；被打进压机的敌人死亡计入玩家（eval `stats.kills`）。
  - `?floor=1&seed=12&god=1&objective=protect`；`?mutator=darkness`；门标签截图。
  - `?floor=0&seed=13&god=1&secret=crack`：悖论炸开裂墙，进入宝库。
  - 统计：`node tools/qarun.cjs "seed=31&bot=1&speed=8&god=1" 300` 日志中 10 种模板各至少出现 1 次（bot 日志打印模板 id）。

### P3 · 首领与隐藏路线 (Bosses & Secret Routes)

- **阶段**：production · **依赖**：F1、F2、F3
- **拥有**：`src/game/entities/boss.ts` `src/game/entities/bosses/foreman.ts` `moth.ts` `archivist.ts` `stillness.ts` `src/game/world/bosses.ts` `src/art/sprites/foreman.ts`
- **新建**：`src/game/entities/bosses/cuckoo.ts` `minutehand.ts` `watchman.ts` `tock.ts` `src/game/rooms/belfry.ts` `src/game/rooms/lostMinute.ts` `src/art/sprites/bosses2.ts` `src/art/themesSecret.ts` `src/game/strings/bosses.ts`（音效写入 F1 预留的 `src/audio/sfx_bosses.ts`，归本包）
- **共享触点**：`Routes.registerBranch`（失落的一分钟：2 层后、持有 ≥3 钟响且灯蛾掉落分针；钟楼：4 层后、11 钟响）；`RoomTypes.register('miniboss'|'belfry'|'lostminute')`；守夜人触发 = 已清场房间停留 90s（通过 `GameHooks.onRoomClear` + `world.every`）；嗒读取 `profile.deathTapes`（写入由 P6 在 `Flow.endRun` 中完成，格式见 §1.11）；分针读取本层录像（`Loadout.tape` 历史，本包在 `onRoomStart` 中累积）；`Chimes.ring('minutehand'|'ghostwriter'|'lostminute'|'watchman')`；`achieve(...)`；`Enemy.poise` 系统；多人缩放读 `world.playerCount`。
- **任务书**：GDD2 §7.7、§8.3。4 个旧首领：破绽条、`world.rng` 种子队列、每阶段一次场地变化、回溯互动（工头残响诱饵与加班哨、灯蛾黑暗中残响为灯与螺旋预警、档案管理员改稿之争与三阶段修订柱子、静止所有玩家残响可动与召回 ×2）、多人分摊瞄准与额外弹幕组。新首领：布谷母（1 层 50% 替换，需首杀工头）、分针（4 层 50% 替换，需首次通关）、守夜人（隐藏小首领）、嗒（钟楼）。失落的一分钟（4 个反色战斗房：敌人碎片 3s 复原、雨上落、回溯免费、残响朝你走 + 奖励房：钟响 + 英雄传说三选一）；钟楼路线（钟室过场 `Cutscenes.play('belfry', …)` 由 P7 注册，未注册时直接跳过）。彩蛋 #24、#37、#38、#39、#40、#41。
- **验收**：
  - typecheck；`?room=boss&floor=N&god=1&boss=<id>` 8 个首领各自可打完（bot `speed=8` 0 错误），每个各 3 张截图（开场 / 阶段变化 / 破绽"钟停了"）。
  - 同一 `seed` 两次运行首领前 10 个招式序列一致（bot 日志打印招式 id）。
  - `?room=boss&floor=2&god=1&boss=archivist&drill=editwar`：修订吟唱时回溯 → 出现"改稿之争"横幅，她硬直。
  - `?room=boss&floor=3&god=1&boss=tock&fakeDeathTape=1`：嗒按存档录像行动（截图）。
  - `?route=lostminute&god=1`：进入反色楼层，4 房 + 奖励房可走完；`Chimes.has('lostminute')`。
  - `?room=boss&floor=0&players=3&bot=1&god=1`：首领生命按 ×2.2 缩放（eval）。

### P4 · 构筑与奖励 (Builds, Offers & Echo Rules)

- **阶段**：production · **依赖**：F1、F2、F3
- **拥有**：`src/game/progression/memories.ts` `parts.ts` `hourglass.ts` `calibrations.ts` `rewards.ts` `effectEnts.ts` `src/game/entities/echo.ts` `src/game/systems/paradox.ts` `src/game/entities/pickup.ts` `src/game/ui/overlay.ts` `src/game/ui/pause.ts` `src/game/rooms/special.ts` `src/art/sprites/icons.ts` `src/audio/sfx_builds.ts`
- **新建**：`src/game/progression/keystones.ts` `src/game/progression/tags.ts` `src/game/ui/pocketWatch.ts` `src/game/rooms/vaults.ts` `src/game/strings/builds.ts`
- **共享触点**：`TagId`、`drawTagChip`；`Panels.register('pocketWatch')`（第 2 页调用 `Panels.open('almanac')` 内嵌，第 3 页 `Panels.open('controls')`）；HUD 组件 `keystone`、`slots`；`RoomTypes.register('wrongHour')` 并为 1.0 的 shop/rest/vault/event 提供新权重；事件房调用 `pickEvent(run)`（P7 在 `events.ts` 导出，F2 已提供默认实现）；`Mods.flags` 中擒纵器标记（`loop` `sentinel` `domino` `transposition` `overclock` `borrowed` `stoppedClock` `wick` `clockworkHeart` `bellBody` `rings` `stopwatch`）；亲和度加点调用 `Patrons.addAffinity(patron, n)`（P6 导出，F2 预留空实现于 `progression/hands.ts` 旁的 `progression/patrons.ts` *(stub)*）；守护者 L2 新回忆以 `isUnlocked('mem_<id>')` 控制入池。
- **任务书**：GDD2 §6 全部 + §3.5/3.6 的规则调优（本包拥有 echo/paradox）。所有物品加 `tags`；卡面（标签芯片、协同 ×N、双人预告、传说进度、"将替换"+稀有度继承、风味、按住 Tab 详解、新！）；多人紧凑卡列表；守护者权重/誓约/天命/重抽（全奖励类型，30+15n 黄铜）/放逐/锁定/跳过/重复升稀有度/英雄附加/洗牌噪声；擒纵器 12 个（第 1 层首领后三选一 + 钉住位）；新物品：15 回忆、6 双人、4 二重奏、18 零件（含 4 诅咒）、5 个冗余零件改造、8 沙漏；诅咒零件入常规池；状态可读化（灼烧层数点、定格储存数字累加、锈蚀保留 5 层、共鸣在同步时敲响、清场持续伤害统计）；§6.7 全部修复；商店（按住购买、重抽、多人库存）、休息站（打磨截断修复、每人选择）；5 种宝库谜题（`vaults.ts`，多人 3 压板）；错时门；怀表面板（构筑 / 钟典 / 操作）。彩蛋：#4、#27、#28、#29、#34、#35、#42（触发）、#43、#44；暂停 11:59 计时（`GameHooks.onPauseTick` → `Chimes.ring('midnight')`，与 P7 共用钟响 id）。
- **验收**：
  - typecheck；bot 回归 0 错误。
  - `?seed=1&floor=0&god=1&offer=oren&own=oren_attack,oren_special`：卡面截图出现"◆ 协同 ×2"、传说进度 `●●○`、标签芯片；`&own=marta_attack` 时出现双人预告行。
  - 选卡面板：R 重抽扣 30 黄铜、X 放逐后本局不再出现（eval 奖池）、按住 Esc 跳过得 +25/+25。
  - `?seed=1&floor=0&room=boss&god=1` 击败工头后出现擒纵器三选一；`&keystone=domino` 时连锁伤害每环 +50%（eval 伤害数字）。
  - `?room=vault&vault=1..5&god=1` 五种宝库各可完成（截图）；`&players=2` 时双压板变 3 块。
  - `?room=shop&brass=0` → 慢慢给 1 黄铜（彩蛋 #44）。
  - 怀表 Tab 在战斗中打开，三页可切换（钟典页在 P7 合并前显示"即将推出"占位）。

### P5 · 表针与武器库 (Hands & Arsenal)

- **阶段**：production · **依赖**：F1、F2、F3
- **拥有**：`src/game/progression/hands.ts` `src/game/systems/rewindStyles.ts` `src/art/sprites/tick.ts` `src/art/sprites/weapons.ts` `src/game/entities/scarf.ts` `src/game/weapons/index.ts` `src/audio/sfx_hands.ts`
- **新建**：`src/game/weapons/hook.ts` `twinhands.ts` `tuningfork.ts` `src/game/progression/mastery.ts` `src/game/cosmetics.ts` `src/game/ui/armory.ts` `src/game/ui/handStand.ts` `src/game/strings/hands.ts`
- **共享触点**：`RewindStyles.register`；`EchoOpts`（`kind:'statue'|'bell'`、`life`、`speed`、`taunt`）；`Panels.register('armory'|'handStand')`（工坊站点由 P6 放置并调用）；`WeaponDef` 增加 `aspects: {id, name, desc}[]`、`unlock`、`calibrations`；旧 4 把武器的"相"行为由 P1 实现（本包只定义元数据与熟练度解锁）；`defineCosmetic` 的渲染（围巾/帽子/拖尾/旧影皮肤/残响面具/伙伴猫）在 `cosmetics.ts`，其他包只用 id；熟练度经验来源订阅 `kill`/`roomClear`（`GameHooks.onRoomStart` 中注册）；`Loadout.hand` 由 `HandDef` 驱动。
- **任务书**：GDD2 §5.2、§4.6（新武器）、§10.4–10.5。米娜/霍拉/铃/慢慢的数值、轮廓变体（同一骨骼的头/臂替换 + 调色板）、回溯风格（长影、守时+哨兵残响+顶步、贪睡+铃残响、太慢了）、被动；擒纵钩/双针匕/音叉（普攻、重击、冲刺攻击、特技、残响特性、相、各 4 个校准）；熟练度 1–5 与"相"切换；武器架与指针架面板（选角色、外观、AI 搭档开关）；外观系统；角色解锁条件（击败工头/灯蛾/档案管理员；慢慢由 `isUnlocked('hand_manman')`，P4 触发）；多人客人可用全部角色。
- **验收**：
  - typecheck；`?seed=1&floor=0&god=1&hands=mina,hora,ling,tick&players=4&bot=1` 180s 0 错误，截图四种轮廓。
  - `?scene=art&page=hands`（本包注册）四个角色动作帧页截图。
  - 霍拉回溯后位置不变、生命恢复、生成原地哨兵残响（eval + 截图）；铃回溯为 72px 内队友回血（eval 队友 hp 变化）。
  - `?seed=1&floor=1&god=1&weapon=hook|twinhands|tuningfork` 各一组截图（普攻/重击/特技/残响特性）。
  - `?scene=hub` → 武器架面板显示 7 把武器、熟练度条与"相"；指针架可切换角色与围巾。

### P6 · 工坊与局外成长 (Workshop & Meta)

- **阶段**：production · **依赖**：F1、F2、F3
- **拥有**：`src/game/scenes/hub.ts` `src/game/ui/metaPanels.ts` `src/game/save.ts` `src/game/flow.ts` `src/game/scenes/summary.ts` `src/game/story.ts` `src/art/sprites/hub.ts` `src/art/sprites/npcs.ts` `src/game/progression/patrons.ts` *(F2 stub)* `src/audio/sfx_meta.ts`
- **新建**：`src/game/ui/mainspring.ts` `src/game/ui/departure.ts` `src/game/ui/contracts.ts` `src/game/ui/ledger.ts` `src/game/ui/shrine.ts` `src/game/progression/income.ts` `src/game/progression/contracts.ts` `src/game/rooms/rescue.ts` `src/game/modes.ts` `src/game/strings/meta.ts`
- **共享触点**：`Panels.register('mainspring'|'departure'|'contracts'|'ledger'|'shrine')`；工坊放置 P5/P7 的站点并 `Panels.open('armory'|'handStand'|'rehearsal')`；收入通过 `GameHooks.onRoomClear/onRunEnd` 与 bus `kill`（精英/首领）计算，不改 `game.ts`；`RoomTypes.register('rescue')`；`Patrons.addAffinity/rescued/isRescued`；契约效果通过 `RunConfig.contracts` 写入，各系统读 `run.config.contracts[id]`（P1/P2/P3 已按 GDD2 §10.6 读取：`tightSpring` `violetHour` `erasers` `shortTape` `anchored` `lateBells` `ironPoise` `echoTax` `leanPurse` `noRest` `eliteAffix` `bossesRemember`）；`Flow.endRun` 写 `profile.deathTapes`；主发条节点效果以 `MetaBonus` 应用到每个 Loadout，`recall`/`lock`/`keystonePin` 等以 `unlock(id)` 标记；HUD 组件 `metaKey`。
- **任务书**：GDD2 §10 全部 + §6.5 救援房 + §8.5 模式（每日一秒、十二击、自定义种子；加班可选）。碎片收入表；工坊报告（罐子、可购买数、下一个目标）；"是什么让你停下"死亡卡的数据（死因、磁带状态）在结算第一页显示；主发条大钟 36 节点（墙上 96px 大钟随节点前进，18 节点钟响 #3）；出发台（誓约、钉住擒纵器、今日上弦卡）；守护者神龛与亲和度 5 级；5 个救援房；契约 12 条（替换超频拉杆）与钟响 #10；账簿新页（首领、事件、档案页、成就、钟响、便条）与每 10 条奖励；慢慢寄存摊；工坊随进度变化（守护者站位、灯、铃位、"！"标记、站名常驻 12px）；伊妮丝 +16 段与守护者台词；存档 v2 读写与 1.0 迁移。彩蛋：#3、#7、#8、#9、#10、#11、#14、#16、#17、#18、#19、#21、#31，及可选"无悔"。
- **验收**：
  - typecheck；bot 回归 0 错误。
  - `?scene=summary&kind=death&floor=0&rooms=5`：工坊报告截图，碎片 15–20，显示"你可以购买 N 项"。
  - `?scene=hub&profile=fresh` 与 `&profile=late`（本包注册的两个档案预设）截图对比：工坊明显不同（守护者、灯、铃、大钟时间）。
  - 主发条面板：36 个节点均有 12px 名称；购买后墙上大钟前进 20 分钟（截图前后）；无面板遮挡节点（1.0 bug）。
  - `?mode=daily&fakeTime=2026-10-31T10:00:00` 两次启动种子一致；`?seed=MIDNIGHT` 夜色。
  - `?room=rescue&patron=pip&god=1` 可完成，工坊出现皮普。
  - 1.0 档案迁移：放入 `tools/fixtures/profile_v1.json` 后碎片正确退还。
  - `?fakeTime=2026-12-31T23:59:50&scene=hub`：跨年倒计时与 00:00 烟花截图。

### P7 · 引导、秘密与故事内容 (Onboarding, Secrets & Story)

- **阶段**：production · **依赖**：F1、F2、F3
- **拥有**：`src/game/rooms/tutorial.ts` `src/game/progression/events.ts` `src/game/ui/eventOverlay.ts` `src/game/ui/dialogue.ts` `src/game/ui/controls.ts` `src/game/ui/menu.ts` `src/game/settings.ts` `src/game/scenes/title.ts` `src/game/scenes/cutscene.ts` `src/audio/songs.ts` `src/audio/instruments.ts` `src/audio/score/*` `src/audio/sfx_story.ts`
- **新建**：`src/game/scenes/prologue.ts` `src/game/rooms/rehearsal.ts` `src/game/progression/hintsData.ts` `src/game/progression/secrets.ts` `src/game/progression/achievements.ts` `src/game/ui/almanac.ts` `src/art/sprites/events2.ts` `src/game/strings/story.ts` `tools/scripts/prologue.json`
- **共享触点**：`Hints.define`（GDD2 §9.2 全部 id）与基于 bus / `GameHooks` 的触发；`defineAchievement`（47 个，id 供其他包调用）；`Secrets/Chimes/Flags/Stats`；`devices.onSequence`（科乐美、TICKTOCK 由 P6、1159）；`RealClock`；`Panels.register('almanac'|'controls'|'rehearsal')`；`RoomTypes.register('prologue'|'rehearsal')`；`pickEvent(run)` 导出（替换 F2 默认实现）；`Cutscenes.register('belfry'|'true'|'forever'|'credits'|'intro'|'ending')`；标题通过 `Panels.open('join')` 进入加入面板。
- **任务书**：GDD2 §9（序章 8 步门控、便条 30 条、钟典 30+ 条带小循环演示、HUD 标注、楼层卡技巧轮换、排练厅 + 8 个训练、多人引导卡）；§8.4 新事件 17 个与 `EventDef/EventCtx` 扩展（权重、条件、每存档一次、多段、伏击、标记、解锁、标门）；§8.6 结局（真结局、永远差一秒、字幕倒放）与过场；§12.3 标题 2.0（钟面菜单、11 铃位、加入表针、`v2.0 · 十二响`）；成就表 47 个；彩蛋 #1、#6、#12、#13、#15、#22、#25、#32、#45、#46、#48 与"假人"两个可选彩蛋；钟响 #5、#11 的注册与表现；设置/菜单/操作页（每设备重绑、回溯模式、文字大小、HUD 标注、闪光限制）；配乐：钟楼/真结局变奏、威斯敏斯特四音动机。
- **验收**：
  - typecheck；bot 回归 0 错误。
  - `?scene=prologue`：脚本 `tools/scripts/prologue.json`（本包新建）完整走完 8 步（截图每步）；未完成当前步时门不开（eval）。
  - `?scene=title&fakeTime=2026-10-31T23:59:58`：秒针走到 12、敲钟、钟响 #11 记录；`?scene=title` 标题截图为钟面菜单 + 11 铃位。
  - `?seed=3&floor=0&god=1&hint=fixed_hit`：便条卡 12px 显示并暂停（单人）；同一档案第二次不再出现。
  - 怀表第 2 页钟典可滚动，每条有数字与演示。
  - `?scene=rehearsal`：8 个训练均可完成并发放碎片。
  - `?room=event&event=<id>&god=1` 新增 17 个事件各一张截图。
  - `?scene=credits&drill=rewind`：字幕倒放出现隐藏留言。
  - 万圣节：`?scene=hub&fakeTime=2026-10-31T20:00:00` 截图中有南瓜灯与伊妮丝台词。

---

## 3. 文件归属表（生产阶段）

> 每个文件只属于一个生产包。**冻结**文件只能由主程在集成时修改（生产包提"接口请求"）。

| 文件 | 归属 |
|---|---|
| `src/main.ts` `src/game/G.ts` `src/game/boot.ts` `src/game/i18n.ts` `src/game/strings.ts` `src/game/debugRoutes.ts` `src/game/clock.ts` `src/game/hooks.ts` `src/game/players.ts` `src/game/routes.ts` `src/game/run.ts` `src/game/meta/registry.ts` `index.html` | 冻结 |
| `src/engine/**`（除 `engine/audio/music.ts`） | 冻结 |
| `src/engine/audio/music.ts` | P1 |
| `src/art/palette.ts` `src/art/blit.ts` `src/art/gear.ts` | 冻结 |
| `src/art/themes.ts` `src/art/biomes/*` `src/art/sprites/{gearworks,conservatory,archive,clockface,props}.ts` `src/art/sprites/enemies2.ts` | P2 |
| `src/art/sprites/foreman.ts` `src/art/sprites/bosses2.ts` `src/art/themesSecret.ts` | P3 |
| `src/art/sprites/icons.ts` | P4 |
| `src/art/sprites/tick.ts` `src/art/sprites/weapons.ts` | P5 |
| `src/art/sprites/hub.ts` `src/art/sprites/npcs.ts` | P6 |
| `src/art/sprites/events2.ts` | P7 |
| `src/audio/sfx.ts` | 冻结 |
| `src/audio/sfx_combat.ts` / `sfx_encounters.ts`+`sfx_archive/clockface/conservatory.ts` / `sfx_bosses.ts` / `sfx_builds.ts` / `sfx_hands.ts` / `sfx_meta.ts` / `sfx_story.ts` | P1 / P2 / P3 / P4 / P5 / P6 / P7 |
| `src/audio/songs.ts` `src/audio/instruments.ts` `src/audio/score/*` | P7 |
| `src/game/systems/bus.ts` `src/game/systems/rewind.ts` `src/game/systems/timeBubble.ts` `src/game/systems/downed.ts` `src/game/entities/entity.ts` `src/game/entities/interact.ts` `src/game/rooms/registry.ts` | 冻结 |
| `src/game/systems/combat.ts` `src/game/systems/tempo.ts` `src/game/systems/teamTech.ts` `src/game/entities/{player,enemy,projectile,fxents}.ts` `src/game/world/{world,fx}.ts` `src/game/ui/{hud,rewindHud}.ts` `src/game/weapons/{weapon,rapier,maul,bow,chakram}.ts` `src/game/qa/bot.ts` | P1 |
| `src/game/entities/enemies/*` `src/game/entities/{props,door,affixes,hazards}.ts` `src/game/world/{director,roomgen,room,roomRender,enemyDef,stockProps,templates,objectives}.ts` `src/game/rooms/secretRooms.ts` `src/game/scenes/{game,artPreview,roomPreview}.ts` | P2 |
| `src/game/entities/boss.ts` `src/game/entities/bosses/*` `src/game/world/bosses.ts` `src/game/rooms/{belfry,lostMinute}.ts` | P3 |
| `src/game/progression/{memories,parts,hourglass,calibrations,rewards,effectEnts,keystones,tags}.ts` `src/game/entities/{echo,pickup}.ts` `src/game/systems/paradox.ts` `src/game/ui/{overlay,pause,pocketWatch}.ts` `src/game/rooms/{special,vaults}.ts` | P4 |
| `src/game/progression/{hands,mastery}.ts` `src/game/systems/rewindStyles.ts` `src/game/entities/scarf.ts` `src/game/weapons/{index,hook,twinhands,tuningfork}.ts` `src/game/cosmetics.ts` `src/game/ui/{armory,handStand}.ts` | P5 |
| `src/game/scenes/{hub,summary}.ts` `src/game/ui/{metaPanels,mainspring,departure,contracts,ledger,shrine}.ts` `src/game/{save,flow,story,modes}.ts` `src/game/progression/{patrons,income,contracts}.ts` `src/game/rooms/rescue.ts` | P6 |
| `src/game/rooms/{tutorial,rehearsal}.ts` `src/game/scenes/{prologue,title,cutscene}.ts` `src/game/progression/{events,hintsData,secrets,achievements}.ts` `src/game/ui/{eventOverlay,dialogue,controls,menu,almanac}.ts` `src/game/settings.ts` | P7 |
| `src/game/ui/{text,widgets,panels,hints,notices,draw,prompts,joinPanel}.ts` `src/game/scenes/{registryDebug,widgetPreview}.ts` | 冻结 |
| `src/game/strings/<pkg>.ts` | 各自的包 |
| 各包"新建"中列出的 `tools/scripts/*.json`，以及 `tools/out/<pkg>/` | 各自的包 |

---

## 4. 集成与 QA

- 每次合并后主程跑：typecheck → 单人 bot 全通关（`seed=21`）→ 4 人 bot 180s（`seed=3&players=4&bot=1`）→ 文字检查（`textcheck` 标题与卡面）→ 1536×730 与 1920×969 两种分辨率各截标题/工坊/战斗/卡面/结算 5 张。
- 合并冲突原则：冻结文件的接口不改签名；若两个包都通过"接口请求"要求修改同一冻结文件，主程合并后在 `docs/PLAN2.md` 的本节记录变更。
- 最终验收（全部合并后）：
  1. 新存档从标题开始：序章 → 工坊 → 第一局 → 死亡 → 工坊报告 → 购买节点，全程无 8px 中文、无模糊文字（1536×730 截图）。
  2. 2 个虚拟手柄 + 键鼠三人局打到第 2 层首领。
  3. `seed=21&bot=1&speed=8&god=1` 通关；`players=4` 通关。
  4. 48 个彩蛋中至少 30 个有可复现的调试触发方式（`?egg=<n>` 路由，由各负责包注册），清单写入最终报告。

---

## 5. 砍单顺序

与 GDD2 §13 一致，从上往下砍：加班模式 → 十二击 → 布谷母 → 二重奏 4→2 → 慢慢可玩 → 宝库 5→3 → 新事件 17→10 → 失落的一分钟 4→2 房 → 只给原 4 把武器做"相"。
**绝不砍**：任何窗口下锐利的文字；旧影 + 三色血条 + 磁带；轻按/擦带 + 分岔 + 行动珠 + ◆；同步；序章 + 便条；2–4 人同屏合作（含拉回/上弦）；卡秒 + 打断 + 破绽；卡面标签与协同提示；碎片收入 + 主发条大钟；十二响 + ≥30 个彩蛋。
