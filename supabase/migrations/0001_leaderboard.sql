-- 食安防衛隊｜排行榜 migration v1
-- 適用：Supabase（Postgres 15+）
-- 執行方式：Supabase Dashboard → SQL Editor 貼上本檔執行，或用 supabase db push。
--
-- 設計要點：
-- 1) run_tickets 每局一筆，由 leaderboard-start 核發；token 只存 SHA-256 雜湊。
-- 2) scores 以 (ticket_id) 唯一約束保證「同一局只能成功登錄一次」。
-- 3) 公開端（anon）只能呼叫兩個 Edge Function 與讀 v_scores_public 檢視表，不能直接寫任何表。
-- 4) 這個 migration 不含任何密鑰；服務金鑰只存在 Edge Function 的秘密設定。
--
-- 版本：leaderboard_version 用來隔離不同玩法／計分規則；換版本時舊成績自動不再顯示。

create extension if not exists pgcrypto;

-- ───────────────────────── 單局識別 ─────────────────────────
create table if not exists public.run_tickets (
  id            uuid primary key default gen_random_uuid(),
  -- 憑證雜湊：提交時比對；原始 token 只在核發回應出現一次
  token_hash    text        not null,
  version       text        not null,
  issued_at     timestamptz not null default now(),
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  -- 提交頻率限制：同一來源（雜湊後 IP）在時間窗內的核發數
  ip_hash       text,
  constraint run_tickets_version_len check (char_length(version) between 1 and 40)
);

create index if not exists run_tickets_expires_idx on public.run_tickets (expires_at);
create index if not exists run_tickets_ip_idx on public.run_tickets (ip_hash, issued_at desc);

-- ───────────────────────── 成績 ─────────────────────────
create table if not exists public.scores (
  id            bigint generated always as identity primary key,
  ticket_id     uuid        not null unique references public.run_tickets (id) on delete cascade,
  version       text        not null,
  nickname      text        not null,
  score         integer     not null,
  outcome       text        not null,
  elapsed_ms    integer     not null,
  kills         integer     not null,
  escapes       integer     not null,
  created_at    timestamptz not null default now(),
  constraint scores_nickname_len   check (char_length(nickname) between 1 and 12),
  constraint scores_nickname_text  check (nickname !~ '[[:cntrl:]]'),
  constraint scores_score_range    check (score >= 0 and score <= 30000),
  constraint scores_outcome_valid  check (outcome in ('won', 'lost')),
  constraint scores_elapsed_range  check (elapsed_ms >= 0 and elapsed_ms <= 200000),
  constraint scores_kills_range    check (kills >= 0 and kills <= 500),
  constraint scores_escapes_range  check (escapes >= 0 and escapes <= 500)
);

-- 榜單排序：分數高到低，同分依伺服器登錄時間（早者在前），最後用 id 保證穩定
create index if not exists scores_rank_idx
  on public.scores (version, score desc, created_at asc, id asc);

-- ───────────────────────── 公開榜單檢視表 ─────────────────────────
-- 只曝露必要欄位；不含 ticket、IP、token 或任何管理資訊。
create or replace view public.v_scores_public
with (security_invoker = false) as
select
  id,
  version,
  nickname,
  score,
  outcome,
  created_at,
  row_number() over (partition by version order by score desc, created_at asc, id asc)::int as rank
from public.scores;

-- ───────────────────────── 權限（最低權限） ─────────────────────────
alter table public.run_tickets enable row level security;
alter table public.scores     enable row level security;

-- 沒有任何 anon／authenticated 政策 = 一律拒絕直接存取資料表。
-- Edge Function 使用 service_role，繞過 RLS，但只在伺服器端使用。

revoke all on public.run_tickets from anon, authenticated;
revoke all on public.scores     from anon, authenticated;
revoke all on public.v_scores_public from anon, authenticated;

-- 公開端只能讀檢視表（效能考量在 Edge Function 內以 RPC 查詢，這裡僅作為備援）
grant select on public.v_scores_public to anon, authenticated;

-- ───────────────────────── 查榜函式 ─────────────────────────
-- 只回傳前 100 名內的分頁結果；呼叫端（Edge Function）以 service_role 執行。
create or replace function public.leaderboard_page(
  p_version text,
  p_limit   int default 10,
  p_offset  int default 0
)
returns table (
  rank     int,
  nickname text,
  score    int,
  outcome  text
)
language sql
stable
security definer
set search_path = public
as $$
  select v.rank, v.nickname, v.score, v.outcome
  from public.v_scores_public v
  where v.version = p_version
    and v.rank <= 100
  order by v.rank
  limit greatest(1, least(50, coalesce(p_limit, 10)))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.leaderboard_page(text, int, int) from anon, authenticated;

-- ───────────────────────── 進榜名次 ─────────────────────────
-- 登錄成功後回傳名次（前 100 名外回 NULL）
create or replace function public.leaderboard_rank_of(p_score_id bigint)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select v.rank from public.v_scores_public v where v.id = p_score_id and v.rank <= 100;
$$;

revoke all on function public.leaderboard_rank_of(bigint) from anon, authenticated;

-- ───────────────────────── 清理過期憑證 ─────────────────────────
-- 由 pg_cron 每日執行（若專案未啟用 pg_cron，可忽略；不影響正確性）
create or replace function public.leaderboard_cleanup(p_keep_days int default 7)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  removed int;
begin
  delete from public.run_tickets t
  where t.consumed_at is null
    and t.expires_at < now() - make_interval(days => greatest(1, p_keep_days));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.leaderboard_cleanup(int) from anon, authenticated;
