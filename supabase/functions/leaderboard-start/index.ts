// POST /functions/v1/leaderboard-start
// 核發單局識別（ticket + token）。token 只在本回應出現一次，資料庫只存雜湊。
import { allowedVersions, fail, ipHash, json, randomToken, restUrl, adminHeaders, sha256Hex } from '../_shared/helpers.ts';

const TICKET_TTL_SEC = 20 * 60;      // 單局憑證 20 分鐘內有效（180 秒關卡 + 收尾 + 網路延遲）
const IP_WINDOW_SEC = 10 * 60;       // 頻率窗
const IP_MAX_TICKETS = 12;           // 同一來源 10 分鐘最多 12 局

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST') return fail('method_not_allowed', '只接受 POST', 405);

  let body: { version?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail('bad_json', '請求內容不是有效 JSON', 400);
  }
  const version = typeof body.version === 'string' ? body.version.trim() : '';
  if (!version || version.length > 40) return fail('bad_version', '缺少版本', 400);
  if (!allowedVersions().includes(version)) return fail('bad_version', '不支援的版本', 400);

  try {
    const ip = await ipHash(req);
    const since = new Date(Date.now() - IP_WINDOW_SEC * 1000).toISOString();

    // 頻率限制（伺服器端計數，前端無法繞過）
    const countRes = await fetch(
      `${restUrl('run_tickets')}?ip_hash=eq.${ip}&issued_at=gte.${encodeURIComponent(since)}&select=id`,
      { headers: { ...adminHeaders(), Prefer: 'count=exact', Range: '0-0' } },
    );
    const countHeader = countRes.headers.get('content-range') ?? '0-0/0';
    const used = Number(countHeader.split('/')[1] ?? '0');
    if (!Number.isFinite(used) || used >= IP_MAX_TICKETS) {
      return fail('rate_limited', '本局開啟太頻繁，請稍後再試', 429);
    }

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + TICKET_TTL_SEC * 1000).toISOString();

    const insert = await fetch(restUrl('run_tickets'), {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ token_hash: tokenHash, version, expires_at: expiresAt, ip_hash: ip }),
    });
    if (!insert.ok) return fail('server_error', '無法建立本局識別', 500);
    const rows = await insert.json() as Array<{ id: string; issued_at: string; expires_at: string }>;
    const row = rows[0];
    if (!row) return fail('server_error', '無法建立本局識別', 500);

    return json({ ticketId: row.id, token, issuedAt: row.issued_at, expiresAt: row.expires_at });
  } catch {
    return fail('server_error', '伺服器暫時無法處理', 500);
  }
});
