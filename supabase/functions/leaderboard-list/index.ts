// GET /functions/v1/leaderboard-list?version=...&limit=10&offset=0
// 只回傳公開欄位與前 100 名內的資料。
import { allowedVersions, fail, json, restUrl, adminHeaders } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'GET') return fail('method_not_allowed', '只接受 GET', 405);

  const url = new URL(req.url);
  const version = (url.searchParams.get('version') ?? req.headers.get('x-version') ?? '').trim();
  if (!allowedVersions().includes(version)) return fail('bad_version', '不支援的版本', 400);

  const limitRaw = Number(url.searchParams.get('limit') ?? req.headers.get('x-limit') ?? '10');
  const offsetRaw = Number(url.searchParams.get('offset') ?? req.headers.get('x-offset') ?? '0');
  const limit = Number.isFinite(limitRaw) ? Math.min(10, Math.max(1, Math.floor(limitRaw))) : 10;
  const offset = Number.isFinite(offsetRaw) ? Math.min(90, Math.max(0, Math.floor(offsetRaw))) : 0;

  try {
    const res = await fetch(restUrl('rpc/leaderboard_page'), {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ p_version: version, p_limit: limit, p_offset: offset }),
    });
    if (!res.ok) return fail('server_error', '榜單暫時無法載入', 500);
    const rows = await res.json() as Array<{ rank: number; nickname: string; score: number; outcome: string }>;

    const countRes = await fetch(
      `${restUrl('scores')}?version=eq.${encodeURIComponent(version)}&select=id`,
      { headers: { ...adminHeaders(), Prefer: 'count=exact', Range: '0-0' } },
    );
    const range = countRes.headers.get('content-range') ?? '0-0/0';
    const rawTotal = Number(range.split('/')[1] ?? '0');
    const total = Math.min(Number.isFinite(rawTotal) ? rawTotal : 0, 100);

    return json({
      rows: rows.map((r) => ({
        rank: r.rank,
        nickname: r.nickname,
        score: r.score,
        outcome: r.outcome === 'won' ? 'won' : 'lost',
      })),
      total,
      limit,
      offset,
    });
  } catch {
    return fail('server_error', '榜單暫時無法載入', 500);
  }
});
