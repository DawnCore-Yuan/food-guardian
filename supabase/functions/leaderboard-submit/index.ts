// POST /functions/v1/leaderboard-submit
//
// 不變量：
//  1) 每次呼叫（含重送）都必須同時提供 ticket_id 與 64 字元 token；以 stored token_hash 比對，
//     只憑 ticket_id 取不到任何東西。
//  2) 冪等性由 scores.ticket_id 的唯一約束保證；插入是單筆，唯一約束會擋下「同時送出」的第二筆
//     （PostgREST 回 409），兩條路徑都回傳同一個結果。
//  3) 勝負由伺服器以「伺服器時間 − 伺服器核發時間」推導，不相信客戶端回報的 won/lost：
//       - 客戶端回報 lost：允許 180 秒前正常陣亡（至少已進行 MIN_LOST_MS）
//       - 客戶端回報 won ：伺服器時間必須已跨過 180 秒（暫停會讓伺服器經過時間 > 遊戲時間，所以只看下限）
//     這是合理性檢查，不是完整防作弊。
import {
  allowedVersions, adminHeaders, fail, json, restUrl, sha256Hex,
} from '../_shared/helpers.ts';

const NICK_MAX = 12;
const NICK_FALLBACK = '匿名隊員';
const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

// 計分規則（與 src/data/*、src/systems/waves.ts 對齊；見 docs/LEADERBOARD-RULES.md）
const SFX = { salmonella: 200, sulfur: 180, aflatoxin: 150, aureus: 150 } as const;
const OFFICIAL_COUNTS = { salmonella: 24, sulfur: 17, aflatoxin: 16, aureus: 10 } as const;
const HP_BONUS_PER_LIFE = 200;
const RAW_MAX = OFFICIAL_COUNTS.salmonella * SFX.salmonella
  + OFFICIAL_COUNTS.sulfur * SFX.sulfur
  + OFFICIAL_COUNTS.aflatoxin * SFX.aflatoxin
  + OFFICIAL_COUNTS.aureus * SFX.aureus;
// v2 波次（src/systems/waves.ts）：沙門氏菌 26、黃麴毒素 14、二氧化硫 12、葡萄球菌 11 ＝ 63 隻
// 擊破總分 11,110＋通關生命獎勵 1,000 ＝ 理論上限 12,110 → 硬上限 12,500
const MAX_SCORE = 12500;
const MAX_KILLS = 63;
const OFFICIAL_DURATION_MS = 180_000;
// 最早可能陣亡＝第一顆敵彈或第一個敵人接觸；不放任意下限。
const MIN_LOST_MS = 0;
const MAX_GAME_MS = 240_000;             // 客戶端回報的遊戲時間上限
const SERVER_SLACK_MS = 3_000;           // 伺服器與客戶端計時的允許誤差

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

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

interface Payload {
  ticketId?: unknown; token?: unknown; nickname?: unknown; score?: unknown;
  outcome?: unknown; elapsedMs?: unknown; kills?: unknown; escapes?: unknown; version?: unknown;
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
  if (typeof body.token !== 'string' || !/^[0-9a-f]{64}$/i.test(body.token)) {
    return fail('bad_ticket', '本局憑證無效', 400);
  }
  if (body.outcome !== 'won' && body.outcome !== 'lost') return fail('bad_outcome', '勝負值無效', 400);
  if (!isInt(body.score, 0, MAX_SCORE)) return fail('bad_score', '分數超出計分規則上限', 400);
  if (!isInt(body.elapsedMs, 0, MAX_GAME_MS)) return fail('bad_elapsed', '時間格式無效', 400);
  if (!isInt(body.kills, 0, MAX_KILLS)) return fail('bad_stats', '擊破數不合理', 400);
  if (!isInt(body.escapes, 0, MAX_KILLS)) return fail('bad_stats', '逃脫數不合理', 400);

  const nickname = normalizeNickname(body.nickname);

  try {
    const headers = adminHeaders();
    const tokenHash = await sha256Hex(body.token);

    // 一律先驗證 ticket + token；consumed 與否不影響「也驗證 token」這件事
    const tRes = await fetch(restUrl('rpc/leaderboard_ticket'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_id: body.ticketId, p_token_hash: tokenHash }),
    });
    if (!tRes.ok) return fail('server_error', '無法驗證本局識別', 500);
    const tickets = await tRes.json() as Array<{ id: string; version: string; issued_at: string; expires_at: string; consumed_at: string | null }>;
    const ticket = tickets[0];
    if (!ticket) return fail('bad_ticket', '本局識別或憑證無效', 403);
    if (ticket.version !== version) return fail('bad_version', '版本與本局不符', 400);

    const nowMs = Date.now();
    const issuedMs = new Date(ticket.issued_at).getTime();
    const serverElapsedMs = nowMs - issuedMs;

    // 重送：先驗證過 token，才回傳原本的名次（不新增資料）
    const existing = await fetch(
      restUrl(`scores?ticket_id=eq.${body.ticketId}&select=id`),
      { headers },
    );
    if (existing.ok) {
      const rows = await existing.json() as Array<{ id: number }>;
      if (rows[0]) {
        const rank = await rankOf(rows[0].id, headers);
        return json({ saved: true, rank, duplicate: true, outcome: null });
      }
    }

    if (new Date(ticket.expires_at).getTime() < nowMs) {
      return fail('ticket_expired', '本局憑證已過期，請重新開始一局', 410);
    }

    // 伺服器推導勝負與時間合理性
    const claimedWon = body.outcome === 'won';
    // 通關需要三件事同時成立：正式關卡（版本白名單已涵蓋）、遊戲時間達 180 秒、
    // 伺服器經過時間也達 180 秒且不超過合理上限（ticket 有效期 20 分鐘）
    if (claimedWon && serverElapsedMs < OFFICIAL_DURATION_MS) {
      return fail('bad_time', '通關時間與伺服器記錄不符', 400);
    }
    if (claimedWon && body.elapsedMs < OFFICIAL_DURATION_MS - SERVER_SLACK_MS) {
      return fail('bad_time', '通關時間不足正式關卡長度', 400);
    }
    // 遊戲時間不得超過伺服器從核發到提交的經過時間（允許 3 秒誤差）；
    // 暫停與輸入暱稱只會讓伺服器時間更長，因此不會誤殺。
    if (body.elapsedMs > serverElapsedMs + SERVER_SLACK_MS) {
      return fail('bad_time', '遊戲時間長於伺服器記錄', 400);
    }
    if (body.elapsedMs < MIN_LOST_MS) {
      return fail('bad_time', '本局時間過短', 400);
    }
    // 由分數推回擊破數下限：只有全部擊破才可能達到 RAW_MAX 級分數
    if (body.score > RAW_MAX + HP_BONUS_PER_LIFE && body.kills < MAX_KILLS) {
      return fail('bad_score', '分數與擊破數不相符', 400);
    }
    if (!claimedWon && body.score > RAW_MAX) {
      return fail('bad_score', '未通關不得包含生命獎勵', 400);
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
        issued_at: ticket.issued_at,
      }),
    });

    if (insert.status === 409) {
      // 同時送出的第二筆：唯一約束擋下，回傳既有那一筆的名次
      const again = await fetch(restUrl(`scores?ticket_id=eq.${body.ticketId}&select=id`), { headers });
      const rows = again.ok ? await again.json() as Array<{ id: number }> : [];
      const rank = rows[0] ? await rankOf(rows[0].id, headers) : null;
      return json({ saved: true, rank, duplicate: true, outcome: null });
    }
    if (!insert.ok) return fail('server_error', '登錄成績失敗', 500);

    const created = await insert.json() as Array<{ id: number }>;
    const row = created[0];
    if (!row) return fail('server_error', '登錄成績失敗', 500);

    // 原子標記已使用（只標一次；失敗不影響已寫入的成績）
    await fetch(restUrl(`run_tickets?id=eq.${body.ticketId}&consumed_at=is.null`), {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ consumed_at: new Date().toISOString() }),
    });

    const rank = await rankOf(row.id, headers);
    return json({ saved: true, rank, duplicate: false, outcome: body.outcome });
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
