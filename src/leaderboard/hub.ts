import { LeaderboardUI } from './ui';

/**
 * 排行榜單例：整個遊戲共用同一個 UI 層，避免多份樣式與重複監聽。
 * 排行榜是雲端功能；初始化失敗不得影響遊戲本體。
 */
let instance: LeaderboardUI | null = null;

/** 目前這局的伺服器核發識別（還沒有票時回 null）；模擬模式亦回 null */
export function currentTicketId(): string | null {
  try { return leaderboard().currentTicketId(); } catch { return null; }
}

export function leaderboard(): LeaderboardUI {
  if (!instance) instance = new LeaderboardUI();
  return instance;
}
