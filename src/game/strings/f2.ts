// F2 (local co-op core) player-facing strings (PLAN2 §0.2 rule 3).
import { registerStrings } from '../strings';
import { L } from '../i18n';

registerStrings('f2', {
  // solo Last Second (GDD2 §3.10)
  lastSecond: L('回溯！', 'REWIND!'),
  noSand: L('时砂不足', 'No sand left'),
  // stopped & revive (GDD2 §5.5); {n} = the stopped hand's numeral
  stopped: L('停摆', 'Stopped'),
  windUp: L('按住：上弦 {n}', 'Hold: wind up {n}'),
  wound: L('上好了弦', 'Wound up'),
  echoSaved: L('过去救了你', 'Your past saved you'),
  ghost: L('幽灵指针', 'Ghost hand'),
  roomRevive: L('重新走动', 'Ticking again'),
  allStopped: L('所有指针都停了', 'Every hand has stopped'),
  // HUD pods / joining (GDD2 §5.1)
  joinNext: L('下个房间加入', 'Joins next room'),
  catchup: L('补选回忆', 'Catch-up pick'),
  // co-op choice panel: hold the pocket-watch button for the full card
  holdCard: L('按住：卡面', 'Hold: card'),
  // co-op shop (GDD2 §2.3): the shared purse needs a deliberate hold
  holdBuy: L('按住购买', 'Hold to buy'),
  // joining & leaving (GDD2 §5.1): the title's Together panel, hot join, lost pads ({n} = the hand's numeral)
  together: L('同行', 'Together'),
  togetherSub: L('最多四根指针，同一座钟。', 'Up to four hands. One clock.'),
  pressJoin: L('按下加入', 'Press to join'),
  splitKb: L('分体键盘', 'Split keyboard'),
  ready: L('准备', 'Ready'),
  readyStamp: L('准备好了', 'Ready!'),
  unready: L('取消准备', 'Not ready'),
  leave: L('离开', 'Leave'),
  back: L('返回', 'Back'),
  allReady: L('全员就位——出发！', 'Everyone ready — off we go!'),
  waitReady: L('等所有人按下准备', 'Waiting for everyone to ready up'),
  devKbm: L('键盘 + 鼠标', 'Keyboard + mouse'),
  devKbL: L('左半键盘', 'Keyboard, left half'),
  devKbR: L('右半键盘', 'Keyboard, right half'),
  devPad: L('手柄 {n}', 'Controller {n}'),
  devBot: L('机器人', 'Bot'),
  lostTitle: L('手柄 {n} 断开了', 'Controller {n} disconnected'),
  lostBody: L('重新连接手柄就能继续。', 'Reconnect it to carry on.'),
  lostDrop: L('不带他继续', 'Continue without them'),
  joined: L('第{n}根指针醒了', 'Hand {n} wakes'),
  joinsNext: L('第{n}根指针将在下个房间加入', 'Hand {n} joins at the next room'),
  left: L('第{n}根指针离开了', 'Hand {n} has left'),
  leaving: L('离开…', 'Leaving…'),
  holdLeave: L('按住：离开', 'Hold: leave'),
  leaveHand: L('离开（{n}）', 'Leave ({n})'),
});
