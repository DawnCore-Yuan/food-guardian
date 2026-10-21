import type { LeaderboardEntry, LeaderboardPage, SubmitResult } from './types';

/**
 * 模擬榜單（只有在 VITE_LEADERBOARD_SUPABASE_URL／ANON_KEY 未設定時使用）。
 *
 * 目的：在雲端還沒接好之前驗證 UI 的載入、分頁、同分排序與樣式。
 * 介面一律加「模擬資料」標記；不得把這裡的內容說成已連線的榜單。
 * 內容固定（無隨機），方便前後截圖對照。
 */

const PAGE_SIZE = 10;
const MAX_ROWS = 100; // 與正式規則一致：只顯示前 100 名

const NAMES = [
  '食安小隊長', '火鍋守門員', '阿柴', '柚子', '林同學', '小8', '抹茶控', '稽查員A',
  '檢驗所老兵', '路過的阿姨', '微生物剋星', '夜班小七', '台北代表', '匿名隊員', '黃豆',
  '珍珠奶茶', '臭豆腐', '滷肉飯', '鳳梨酥', '雞排英雄', '鹽酥雞', '豆花',
  '木瓜牛奶', '地瓜球', '蔥油餅', '芒果冰', '蚵仔煎', '雞蛋糕', '碗粿', '貢丸湯',
];

function makeEntries(): LeaderboardEntry[] {
  const out: LeaderboardEntry[] = [];
  let score = 22600;
  for (let i = 0; i < MAX_ROWS; i += 1) {
    out.push({
      rank: i + 1,
      nickname: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? '·' + (Math.floor(i / NAMES.length) + 1) : ''}`,
      score: Math.max(0, score),
      // 前 40 名通關，其餘失敗
      outcome: i < 40 ? 'won' : 'lost',
    });
    // 前四名刻意同分，用來驗證「同分依登錄時間先後」
    score = i < 4 ? score : Math.max(0, score - (400 + ((i * 37) % 900)));
  }
  return out;
}

const ALL = makeEntries();

function makePage(n: number): LeaderboardPage {
  const start = (n - 1) * PAGE_SIZE;
  return {
    entries: ALL.slice(start, start + PAGE_SIZE),
    total: MAX_ROWS,
    page: n,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(MAX_ROWS / PAGE_SIZE),
  };
}

export const MOCK_PAGES: LeaderboardPage[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(makePage);

const MOCK_LATENCY_MS = 320;

/**
 * 模擬提交：回傳示範名次。
 * second=true 表示同一局第二次送出（連點或重試），回傳相同名次並標 duplicate，
 * 對應正式環境以唯一約束達成的冪等行為。
 */
export function MOCK_SUBMIT(second: boolean, score: number): Promise<SubmitResult> {
  const rank = score > 0
    ? Math.max(1, Math.round(30000 / Math.log10(score + 10)) - 500)
    : null;
  const clamped = rank === null ? null : Math.min(MAX_ROWS + 1, rank);
  const result: SubmitResult = { saved: true, rank: clamped, duplicate: second };
  return new Promise((resolve) => { window.setTimeout(() => resolve(result), MOCK_LATENCY_MS); });
}
