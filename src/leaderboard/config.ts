/**
 * 排行榜前端連線設定（公開安全）。
 *
 * 這裡只能放「本來就會送到瀏覽器」的值：Supabase project URL 與 anon public key。
 * 絕對不要放 service_role key、資料庫密碼、管理密鑰；那些只存在 Supabase 的後端秘密設定。
 *
 * 未設定（或仍是佔位字串）時，前端進入「模擬」模式：只顯示明確標示的示範榜單，
 * 不會送任何寫入請求，也不把模擬資料說成連線成功。
 */
export interface LeaderboardConfig {
  /** 例：https://abcdefghijklm.supabase.co ；留空 = 未設定 */
  supabaseUrl: string;
  /** Supabase anon public key（僅供 Edge Function 呼叫與公開榜單讀取） */
  supabaseAnonKey: string;
  /** 榜單版本；不同玩法或計分規則必須換版本，避免舊成績混進新榜 */
  version: string;
  /** 每頁筆數（規格：固定 10） */
  pageSize: number;
  /** 公開榜單頁數上限（規格：只顯示前 100 名） */
  maxPages: number;
}

const PLACEHOLDER = 'REPLACE_ME';

function readEnv(name: string): string {
  const env = (import.meta.env ?? {}) as Record<string, unknown>;
  const raw = env[name];
  return typeof raw === 'string' ? raw.trim() : '';
}

export function loadLeaderboardConfig(): LeaderboardConfig {
  const supabaseUrl = readEnv('VITE_LEADERBOARD_SUPABASE_URL').replace(/\/+$/, '');
  const supabaseAnonKey = readEnv('VITE_LEADERBOARD_SUPABASE_ANON_KEY');
  const version = readEnv('VITE_LEADERBOARD_VERSION') || 'official-180s-v2';
  return {
    supabaseUrl,
    supabaseAnonKey,
    version,
    pageSize: 10,
    maxPages: 10,
  };
}

export function isLeaderboardConfigured(cfg: LeaderboardConfig): boolean {
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return false;
  if (cfg.supabaseUrl.includes(PLACEHOLDER) || cfg.supabaseAnonKey.includes(PLACEHOLDER)) return false;
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.supabaseUrl);
}
