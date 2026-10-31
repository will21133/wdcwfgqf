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
});
