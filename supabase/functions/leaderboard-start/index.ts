// POST /functions/v1/leaderboard-start
// 核發單局識別（ticket + token）。token 只在本回應出現一次，資料庫只存 SHA-256 雜湊。
//
// 身分與權限：關閉 Verify JWT 後，這個端點不驗證任何「使用者」，
// 只靠 (a) 版本白名單 (b) 資料庫端限流（跨實例、伺服器時間）限制消耗。
// CORS 與 anon key 只是讓瀏覽器能呼叫，不是身分驗證，也不是防作弊。
import {
  allowedVersions, adminHeaders, fail, ipHash, json, randomToken, restUrl, sha256Hex,
} from '../_shared/helpers.ts';

const TICKET_TTL_SEC = 20 * 60; // 單局憑證 20 分鐘（180 秒關卡＋暫停＋輸入暱稱＋網路延遲）

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
    if (!ip) return fail('not_configured', '伺服器尚未設定 IP 雜湊鹽（LEADERBOARD_IP_SALT），暫停核發單局識別', 503);

    // 限流在資料庫內以伺服器時間計數，多個函式實例共用同一份狀態
    const rl = await fetch(restUrl('rpc/leaderboard_rate_limited'), {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ p_ip_hash: ip, p_window_sec: 600, p_max_tickets: 12, p_max_submits: 20 }),
    });
    if (!rl.ok) return fail('server_error', '伺服器暫時無法處理', 500);
    if (await rl.json() === true) {
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
