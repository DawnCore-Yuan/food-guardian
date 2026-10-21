import type { LeaderboardConfig } from './config';
import { isLeaderboardConfigured } from './config';
import {
  LeaderboardError,
  type LeaderboardEntry,
  type LeaderboardPage,
  type RunTicket,
  type SubmitPayload,
  type SubmitResult,
} from './types';

/**
 * 排行榜連線唯一出口。所有雲端呼叫集中在這裡，方便在故障時整層降級。
 * 任何失敗都必須丟 LeaderboardError，不得拋出未預期的例外打斷遊戲。
 */

const TIMEOUT_MS = 8000;

interface FetchOptions {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

interface ErrorBody {
  code?: string;
  message?: string;
}

function joinUrl(cfg: LeaderboardConfig, path: string, query: Record<string, string>): string {
  const url = new URL(cfg.supabaseUrl + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
}

async function request<T>(cfg: LeaderboardConfig, opts: FetchOptions): Promise<T> {
  if (!isLeaderboardConfigured(cfg)) {
    throw new LeaderboardError('not_configured', '排行榜尚未設定連線', false);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = (): void => controller.abort();
  opts.signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(joinUrl(cfg, opts.path, opts.query ?? {}), {
      method: opts.method,
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${cfg.supabaseAnonKey}`,
        'Content-Type': 'application/json',
        ...(opts.headers ?? {}),
      },
      body: opts.method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const err = (parsed ?? {}) as ErrorBody;
      const code = typeof err.code === 'string' ? err.code : `http_${res.status}`;
      const message = typeof err.message === 'string' ? err.message : '排行榜伺服器回應錯誤';
      throw new LeaderboardError(code, message, res.status >= 500 || res.status === 429);
    }
    return parsed as T;
  } catch (e) {
    if (e instanceof LeaderboardError) throw e;
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    throw new LeaderboardError(aborted ? 'timeout' : 'network', aborted ? '排行榜連線逾時' : '排行榜連線失敗', true);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

/** 單局識別：遊戲開始時向伺服器取得，結算提交時一併驗證 */
export async function startRun(cfg: LeaderboardConfig, signal?: AbortSignal): Promise<RunTicket> {
  return request<RunTicket>(cfg, {
    method: 'POST',
    path: '/functions/v1/leaderboard-start',
    body: { version: cfg.version },
    signal,
  });
}

/** 提交成績：同一 ticket＋token 重試冪等，伺服器回傳相同名次 */
export async function submitRun(cfg: LeaderboardConfig, payload: SubmitPayload): Promise<SubmitResult> {
  return request<SubmitResult>(cfg, {
    method: 'POST',
    path: '/functions/v1/leaderboard-submit',
    body: { ...payload, version: cfg.version },
  });
}

interface RawRow {
  rank?: number;
  nickname?: string;
  score?: number;
  outcome?: string;
}

/** 公開榜單：只取前 maxPages 頁 × pageSize 名 */
export async function fetchPage(
  cfg: LeaderboardConfig,
  page: number,
  signal?: AbortSignal,
): Promise<LeaderboardPage> {
  const limit = cfg.pageSize;
  const offset = (page - 1) * limit;
  const raw = await request<{ rows?: RawRow[]; total?: number }>(cfg, {
    method: 'GET',
    path: '/functions/v1/leaderboard-list',
    query: { version: cfg.version, limit: String(limit), offset: String(offset) },
    signal,
  });
  const rows = Array.isArray(raw.rows) ? raw.rows : [];
  const entries: LeaderboardEntry[] = rows
    .filter((r): r is RawRow => !!r && typeof r.nickname === 'string' && typeof r.score === 'number')
    .map((r, i) => ({
      rank: typeof r.rank === 'number' ? r.rank : offset + i + 1,
      nickname: String(r.nickname),
      score: Number(r.score),
      outcome: r.outcome === 'won' ? 'won' : 'lost',
    }));
  const total = Math.min(
    Number.isFinite(raw.total) ? Math.max(0, Number(raw.total)) : 0,
    cfg.pageSize * cfg.maxPages,
  );
  return { entries, total, page, pageSize: limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
