// 共用工具：Edge Function（Deno）
// 秘密只從環境變數讀取；不回傳、不記錄。

export const API_VERSION = '1';

export const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-version, x-limit, x-offset',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function fail(code: string, message: string, status = 400): Response {
  return json({ code, message }, status);
}

/** 來源 IP 只保留雜湊，不落庫明文 */
export async function ipHash(req: Request): Promise<string> {
  const raw = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('cf-connecting-ip')
    ?? 'unknown';
  const data = new TextEncoder().encode(raw + '|' + (Deno.env.get('LEADERBOARD_IP_SALT') ?? 'no-salt'));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 允許的版本：以環境變數宣告，避免任意版本字串灌爆榜單 */
export function allowedVersions(): string[] {
  return (Deno.env.get('LEADERBOARD_VERSIONS') ?? 'official-180s-v1')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

export function adminHeaders(): Record<string, string> {
  // service_role：只在 Edge Function 內使用，永遠不會送到瀏覽器
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

export function restUrl(path: string): string {
  const base = Deno.env.get('SUPABASE_URL') ?? '';
  return `${base}/rest/v1/${path}`;
}
