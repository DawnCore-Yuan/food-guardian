-- 食安防衛隊｜排行榜 migration v2（取代 v1；尚未在雲端執行過）
-- 適用：Supabase（Postgres 15+）
-- 執行方式：Dashboard → SQL Editor 貼上整份執行。
--
-- v2 相對 v1 的修正：
--   1) 分數上限改為由計分規則計算（12760 → 上限 13000），不再是任意 30000。
--   2) 時間合理性改為「以伺服器核發時間計算實際經過時間」：
--      won 判定由伺服器推導，不相信客戶端回報；lost 允許 180 秒前陣亡。
--   3) 名次只由 SQL 計算（rank_of），列表與名次共用同一份資料與排序。
--   4) 限流移到資料庫（伺服器時間），多個函式實例共用。
--   5) 憑證消費改為原子 UPDATE（consumed_at is null），重送一律先驗證 ticket＋token。

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
-- 分數規則（與前端一致，見 docs/LEADERBOARD-RULES.md）：
--   沙門氏菌 24×200 + 二氧化硫 17×180 + 黃麴毒素 16×150 + 金黃色葡萄球菌 10×150 = 11760
--   通關生命獎勵 5×200 = 1000；理論上限 12760，取整 13000 作為伺服器硬上限。
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
  -- 伺服器核發本局的時間與伺服器寫入時間：名次排序以 created_at（伺服器寫入）為主鍵順序的一部分，
  -- 不用客戶端時間；issued_at 供時間合理性檢查。
  issued_at     timestamptz not null,
  created_at    timestamptz not null default now(),
  constraint scores_nickname_len   check (char_length(nickname) between 1 and 12),
  constraint scores_nickname_text  check (nickname !~ '[[:cntrl:]]'),
  constraint scores_score_range    check (score between 0 and 13000),
  constraint scores_outcome_valid  check (outcome in ('won', 'lost')),
  constraint scores_elapsed_range  check (elapsed_ms between 0 and 240000),
  constraint scores_kills_range    check (kills between 0 and 80),
  constraint scores_escapes_range  check (escapes between 0 and 80),
  constraint scores_won_duration   check (outcome <> 'won' or elapsed_ms >= 177000),
  -- 伺服器推導的時間合理性（第二道防線；Edge Function 已先檢查一次）
  constraint scores_issued_before_write check (issued_at <= created_at + interval '5 seconds'),
  -- 贏局：伺服器時間必須跨過 180 秒（暫停只會讓伺服器時間更長）
  constraint scores_won_server_time check (outcome <> 'won' or created_at - issued_at >= interval '180 seconds'),
  -- 客戶端遊戲時間不得超過伺服器之核發→寫入經過時間（+3 秒容差）
  constraint scores_elapsed_le_server check (elapsed_ms <= extract(epoch from (created_at - issued_at)) * 1000 + 3000),
  constraint scores_min_duration  check (elapsed_ms >= 3000)
);

-- 固定排序：分數高 → 伺服器寫入時間早 → id 小（完全確定性，無隨機 tie-break）
create index if not exists scores_rank_idx
  on public.scores (version, score desc, created_at asc, id asc);

-- ───────────────────────── 公開榜單 ─────────────────────────
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

-- ───────────────────────── 權限 ─────────────────────────
alter table public.run_tickets enable row level security;
alter table public.scores     enable row level security;

-- 無任何 anon 政策 = 一律拒絕直接存取資料表（含 SELECT／INSERT／UPDATE／DELETE）。
revoke all on public.run_tickets from anon, authenticated;
revoke all on public.scores     from anon, authenticated;
revoke all on public.v_scores_public from anon, authenticated;

-- ───────────────────────── 限流（資料庫端、跨實例） ─────────────────────────
-- 回傳是否允許；以伺服器時間判定，不依賴客戶端。多個 Edge 實例共用同一張表。
create or replace function public.leaderboard_rate_limited(
  p_ip_hash      text,
  p_window_sec   int default 600,
  p_max_tickets  int default 12,
  p_max_submits  int default 20
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
    return false; -- 無來源資訊時不額外限流（其他檢查仍在）
  end if;

  select count(*) into n_tickets
  from public.run_tickets
  where ip_hash = p_ip_hash
    and issued_at > now() - make_interval(secs => p_window_sec);

  select count(*) into n_scores
  from public.scores s
  join public.run_tickets t on t.id = s.ticket_id
  where t.ip_hash = p_ip_hash
    and s.created_at > now() - make_interval(secs => p_window_sec);

  return n_tickets >= p_max_tickets or n_scores >= p_max_submits;
end;
$$;

revoke all on function public.leaderboard_rate_limited(text, int, int, int) from anon, authenticated;

-- ───────────────────────── 投票（ticket）驗證 ─────────────────────────
-- 重送與首次提交共用這一條：一定要 ticket_id + token_hash 同時符合。
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

-- ───────────────────────── 查榜 ─────────────────────────
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

-- 名次：與列表共用 v_scores_public 的同一個 ranking window
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

-- 清理過期且未使用的憑證
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
