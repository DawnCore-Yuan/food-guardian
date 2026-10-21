// POST /functions/v1/leaderboard-submit
// 驗證單局憑證並寫入成績。冪等性靠 scores.ticket_id 唯一約束 + 單筆插入，
// 同一局重試會拿到「原本那一筆」的名次，不會產生第二筆。
import { allowedVersions, fail, json, restUrl, adminHeaders, sha256Hex } from '../_shared/helpers.ts';

const NICK_MAX = 12;
const NICK_FALLBACK = '匿名隊員';
const ABSOLUTE_MAX_SCORE = 30000;
const MIN_DURATION_MS = 180_000;
const MAX_ELAPSED_MS = 200_000;   // 180 秒 + 收尾緩衝
const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

function graphemes(s: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (typeof Seg === 'function') {
    return Array.from(new Seg('zh-Hant', { granularity: 'grapheme' }).segment(s), (x) => x.segment);
  }
  return Array.from(s);
}

function normalizeNickname(raw: unknown): string {
  const s = String(raw ?? '').replace(CONTROL_RE, '').trim();
  if (!s) return NICK_FALLBACK;
  return graphemes(s).slice(0, NICK_MAX).join('');
}

interface Payload {
  ticketId?: unknown;
  token?: unknown;
  nickname?: unknown;
  score?: unknown;
  outcome?: unknown;
  elapsedMs?: unknown;
  kills?: unknown;
  escapes?: unknown;
  version?: unknown;
}

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST') return fail('method_not_allowed', '只接受 POST', 405);

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return fail('bad_json', '請求內容不是有效 JSON', 400);
  }

  const version = typeof body.version === 'string' ? body.version.trim() : '';
  if (!allowedVersions().includes(version)) return fail('bad_version', '不支援的版本', 400);
  if (typeof body.ticketId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.ticketId)) {
    return fail('bad_ticket', '缺少本局識別', 400);
  }
  if (typeof body.token !== 'string' || body.token.length !== 64) {
    return fail('bad_ticket', '本局憑證無效', 400);
  }
  if (body.outcome !== 'won' && body.outcome !== 'lost') return fail('bad_outcome', '勝負值無效', 400);
  if (!isInt(body.score, 0, ABSOLUTE_MAX_SCORE)) return fail('bad_score', '分數格式無效', 400);
  if (!isInt(body.elapsedMs, 0, MAX_ELAPSED_MS)) return fail('bad_elapsed', '時間格式無效', 400);
  if (!isInt(body.kills, 0, 500) || !isInt(body.escapes, 0, 500)) return fail('bad_stats', '統計值無效', 400);
  // 正式關卡至少撐到 180 秒才會結算；低於此值必然是異常結算
  if (body.elapsedMs < MIN_DURATION_MS - 500) return fail('bad_elapsed', '本局時間不足正式關卡長度', 400);

  const nickname = normalizeNickname(body.nickname);

  try {
    const headers = adminHeaders();
    const ticketUrl = `${restUrl('run_tickets')}?id=eq.${body.ticketId}&select=id,token_hash,version,expires_at,consumed_at`;
    const tr = await fetch(ticketUrl, { headers });
    if (!tr.ok) return fail('server_error', '無法驗證本局識別', 500);
    const tickets = await tr.json() as Array<{ id: string; token_hash: string; version: string; expires_at: string; consumed_at: string | null }>;
    const ticket = tickets[0];
    if (!ticket) return fail('bad_ticket', '本局識別不存在', 400);
    if (ticket.version !== version) return fail('bad_version', '版本與本局不符', 400);

    const tokenHash = await sha256Hex(body.token);
    if (tokenHash !== ticket.token_hash) return fail('bad_ticket', '本局憑證無效', 403);

    // 先查是否已登錄：已登錄就回原名次（冪等重試，連點也走這條）
    const existing = await fetch(
      `${restUrl('scores')}?ticket_id=eq.${body.ticketId}&select=id,score,outcome`,
      { headers },
    );
    if (existing.ok) {
      const rows = await existing.json() as Array<{ id: number; score: number; outcome: string }>;
      if (rows[0]) {
        const rank = await rankOf(rows[0].id, headers);
        return json({ saved: true, rank, duplicate: true });
      }
    }

    if (new Date(ticket.expires_at).getTime() < Date.now()) {
      return fail('ticket_expired', '本局憑證已過期，請重新開始一局', 410);
    }
    if (ticket.consumed_at) {
      // 已標記消費但沒有成績（極端競態）：視為不可重複使用
      return fail('ticket_used', '本局已登錄', 409);
    }

    const insert = await fetch(restUrl('scores'), {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        ticket_id: body.ticketId,
        version,
        nickname,
        score: body.score,
        outcome: body.outcome,
        elapsed_ms: body.elapsedMs,
        kills: body.kills,
        escapes: body.escapes,
      }),
    });

    if (insert.status === 409) {
      // 併發重複：唯一約束擋下第二筆，回傳既有名次
      const again = await fetch(
        `${restUrl('scores')}?ticket_id=eq.${body.ticketId}&select=id`,
        { headers },
      );
      const rows = again.ok ? await again.json() as Array<{ id: number }> : [];
      const rank = rows[0] ? await rankOf(rows[0].id, headers) : null;
      return json({ saved: true, rank, duplicate: true });
    }
    if (!insert.ok) return fail('server_error', '登錄成績失敗', 500);

    const created = await insert.json() as Array<{ id: number }>;
    const row = created[0];
    if (!row) return fail('server_error', '登錄成績失敗', 500);

    // 標記憑證已使用（不影響冪等：上面已先查過既有成績）
    await fetch(`${restUrl('run_tickets')}?id=eq.${body.ticketId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ consumed_at: new Date().toISOString() }),
    });

    const rank = await rankOf(row.id, headers);
    return json({ saved: true, rank, duplicate: false });
  } catch {
    return fail('server_error', '伺服器暫時無法處理', 500);
  }
});

async function rankOf(scoreId: number, headers: Record<string, string>): Promise<number | null> {
  const res = await fetch(restUrl('rpc/leaderboard_rank_of'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_score_id: scoreId }),
  });
  if (!res.ok) return null;
  const v = await res.json();
  return typeof v === 'number' ? v : null;
}
