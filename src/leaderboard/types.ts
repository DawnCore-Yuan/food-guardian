/** 公開榜單一列：只含可公開欄位（不含玩家識別或憑證） */
export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  score: number;
  outcome: 'won' | 'lost';
}

export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  /** 前 100 名內的總筆數（伺服器回傳） */
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 單局憑證。只存在這個分頁的記憶體（不寫 localStorage），
 * 重玩即換新；頁面重載後舊憑證失效是預期行為。
 */
export interface RunTicket {
  ticketId: string;
  /** 提交時證明是本局核發的憑證；不回顯在畫面上 */
  token: string;
  issuedAt: string;
  expiresAt: string;
}

export interface SubmitResult {
  saved: boolean;
  /** 前 100 名內的名次；未進榜為 null */
  rank: number | null;
  duplicate: boolean;
}

export interface SubmitPayload {
  ticketId: string;
  token: string;
  nickname: string;
  score: number;
  outcome: 'won' | 'lost';
  elapsedMs: number;
  kills: number;
  escapes: number;
}

export class LeaderboardError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'LeaderboardError';
  }
}
