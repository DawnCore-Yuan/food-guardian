-- 食安防衛隊｜排行榜 migration（v3，對應 official-180s-v2）
--
-- 執行順序（空白資料庫只需要這一份）：
--   1. SQL Editor 貼上本檔全文 → Run
--   2. 部署三支 Edge Function（leaderboard-start / leaderboard-submit / leaderboard-list）
--   3. 設定 Edge Secrets：LEADERBOARD_VERSIONS=official-180s-v2
-- 本檔可重複執行（idempotent）：create ... if not exists / create or replace。
-- 不含任何密鑰。
--
-- v2 波次依據（src/systems/waves.ts）：
--   沙門氏菌 26×200 + 黃麴毒素 14×150 + 二氧化硫 12×180 + 葡萄球菌 11×150 = 11,110
--   通關生命獎勵 5×200 = 1,000 → 設定理論上限 12,110 → 硬上限 12,500（向上取整 500）

create extension if not exists pgcrypto;

-- ───────────────────────── 單局識別 ─────────────────────────
create table if not exists public.run_tickets (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text        not null,
  version       text        not null,
  issued_at     timestamptz not null default now(),
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
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
  issued_at     timestamptz not null,          -- 伺服器核發時間
  created_at    timestamptz not null default now(),  -- 伺服器寫入時間（排序依據）
  constraint scores_nickname_len   check (char_length(nickname) between 1 and 12),
  constraint scores_nickname_text  check (nickname !~ '[[:cntrl:]]'),
  constraint scores_score_range    check (score between 0 and 12500),
  constraint scores_outcome_valid  check (outcome in ('won', 'lost')),
  constraint scores_elapsed_range  check (elapsed_ms between 0 and 240000),
  constraint scores_kills_range    check (kills between 0 and 63),
  constraint scores_escapes_range  check (escapes between 0 and 63),
  -- 通關：遊戲時間必須到 180 秒（容差 3 秒）
  constraint scores_won_duration    check (outcome <> 'won' or elapsed_ms >= 177000),
  -- 通關：伺服器時間也必須跨過 180 秒（暫停只會讓伺服器時間更長，不會誤殺）
  constraint scores_won_server_time check (outcome <> 'won' or created_at - issued_at >= interval '180 seconds'),
  -- 客戶端遊戲時間不得超過伺服器核發→寫入的經過時間（+3 秒容差）
  constraint scores_elapsed_le_server
    check (elapsed_ms <= extract(epoch from (created_at - issued_at)) * 1000 + 3000)
);

-- 固定排序：分數高 → 伺服器寫入時間早 → id 小
create index if not exists scores_rank_idx
  on public.scores (version, score desc, created_at asc, id asc);

-- ───────────────────────── 公開榜單 ─────────────────────────
create or replace view public.v_scores_public
with (security_invoker = false) as
select
  id, version, nickname, score, outcome, created_at,
  row_number() over (partition by version order by score desc, created_at asc, id asc)::int as rank
from public.scores;

-- ───────────────────────── 權限 ─────────────────────────
alter table public.run_tickets enable row level security;
alter table public.scores     enable row level security;

-- 無 anon 政策＝一律拒絕（含 SELECT）；公開端只走 Edge Function
revoke all on public.run_tickets from anon, authenticated;
revoke all on public.scores     from anon, authenticated;
revoke all on public.v_scores_public from anon, authenticated;

-- ───────────────────────── 限流（資料庫端、跨實例） ─────────────────────────
-- 說明：計數與判斷在同一條 SQL 內完成（同一 snapshot），但整個函式不是「鎖定後插入」；
-- 兩支請求可在同一瞬間都讀到 11 筆而同時通過。因此限流是「軟性流量上限」，
-- 真正的併發保證在 scores.ticket_id 唯一約束（資料庫層硬約束）。
create or replace function public.leaderboard_rate_limited(
  p_ip_hash     text,
  p_window_sec  int default 600,
  p_max_tickets int default 12,
  p_max_submits int default 20
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n_tickets int;
  n_scores  int;
begin
  if p_ip_hash is null then
    return false;   -- 無來源資訊時不額外限流（其他檢查仍在）
  end if;

  select count(*) into n_tickets
  from public.run_tickets
  where ip_hash = p_ip_hash and issued_at > now() - make_interval(secs => p_window_sec);

  select count(*) into n_scores
  from public.scores s
  join public.run_tickets t on t.id = s.ticket_id
  where t.ip_hash = p_ip_hash and s.created_at > now() - make_interval(secs => p_window_sec);

  return n_tickets >= p_max_tickets or n_scores >= p_max_submits;
end;
$$;

revoke all on function public.leaderboard_rate_limited(text, int, int, int) from anon, authenticated;

-- ───────────────────────── ticket 驗證 ─────────────────────────
-- 重送與首次提交共用：一定同時比對 id 與 token_hash
create or replace function public.leaderboard_ticket(p_id uuid, p_token_hash text)
returns table (id uuid, version text, issued_at timestamptz, expires_at timestamptz, consumed_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.version, t.issued_at, t.expires_at, t.consumed_at
  from public.run_tickets t
  where t.id = p_id and t.token_hash = p_token_hash;
$$;

revoke all on function public.leaderboard_ticket(uuid, text) from anon, authenticated;

-- ───────────────────────── 查榜／名次 ─────────────────────────
create or replace function public.leaderboard_page(
  p_version text,
  p_limit   int default 10,
  p_offset  int default 0
)
returns table (rank int, nickname text, score int, outcome text)
language sql
stable
security definer
set search_path = public
as $$
  select v.rank, v.nickname, v.score, v.outcome
  from public.v_scores_public v
  where v.version = p_version and v.rank <= 100
  order by v.rank
  limit greatest(1, least(10, coalesce(p_limit, 10)))
  offset greatest(0, least(90, coalesce(p_offset, 0)));
$$;

revoke all on function public.leaderboard_page(text, int, int) from anon, authenticated;

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

-- ───────────────────────── 清理 ─────────────────────────
create or replace function public.leaderboard_cleanup(p_keep_days int default 7)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare removed int;
begin
  delete from public.run_tickets t
  where t.consumed_at is null
    and t.expires_at < now() - make_interval(days => greatest(1, p_keep_days));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.leaderboard_cleanup(int) from anon, authenticated;
