// Localisation: every player-facing string is bilingual { zh, en }.
export type Lang = 'zh' | 'en';
export interface L10n { zh: string; en: string }

export const i18n = { lang: 'zh' as Lang };

export function tr(l: L10n | string | undefined): string {
  if (!l) return '';
  if (typeof l === 'string') return l;
  return l[i18n.lang] ?? l.zh;
}

/** inline bilingual helper */
export const L = (zh: string, en: string): L10n => ({ zh, en });

/** UI strings */
export const UI = {
  cleared: L('— 清 场 —', '— CLEARED —'),
  paused: L('暂停', 'PAUSED'),
  resume: L('继续', 'Resume'),
  settings: L('设置', 'Settings'),
  abandon: L('放弃本局', 'Abandon Run'),
  quit: L('返回标题', 'Quit to Title'),
  stopped: L('停 摆', 'THE CLOCK STOPS'),
  retry: L('按 [攻击] 重新上发条', 'Press [Attack] to wind up again'),
  noSand: L('时砂不足', 'Not enough sand'),
  paradox: L('悖论！', 'PARADOX!'),
  lastSecond: L('最后一秒！', 'LAST SECOND!'),
  choose: L('选择一项', 'Choose one'),
  replaces: L('将替换', 'Replaces'),
  new: L('新！', 'NEW!'),
  interact: L('交互', 'Interact'),
  buy: L('购买', 'Buy'),
  soldOut: L('售罄', 'Sold'),
  notEnough: L('黄铜不足', 'Not enough brass'),
  memory: L('回忆', 'Memory'),
  hourglass: L('沙漏', 'Hourglass'),
  part: L('零件', 'Part'),
  calibration: L('校准', 'Calibration'),
  heal: L('机油', 'Oil'),
  brass: L('黄铜', 'Brass'),
  shards: L('时之碎片', 'Time Shards'),
  shop: L('慢慢的店', "Manman's Shop"),
  event: L('凝固的瞬间', 'A Frozen Moment'),
  rest: L('修理站', 'Repair Station'),
  vault: L('宝库', 'Vault'),
  elite: L('精英', 'Elite'),
  boss: L('首领', 'Boss'),
  rarity: [L('普通', 'Common'), L('稀有', 'Rare'), L('史诗', 'Epic'), L('英雄', 'Heroic')],
  slots: {
    attack: L('攻击', 'Attack'), special: L('特技', 'Special'), dash: L('冲刺', 'Dash'), rewind: L('回溯', 'Rewind'),
    echo: L('残响', 'Echo'), passive: L('被动', 'Passive'), legendary: L('传说', 'Legendary'), duo: L('双重', 'Duo'),
  } as Record<string, L10n>,
};
