-- 食安防衛隊｜排行榜 migration v4（對應 official-180s-v2）
--
-- 空白資料庫只需要執行這一份。可重複執行（if not exists / create or replace）。
-- 建立物件與權限設定在同一個交易內：失敗會整批回滾，不會留下「已建立但尚未撤權」的空窗。
--
-- v2 波次依據（src/systems/waves.ts）：
--   沙門氏菌 26×200 + 黃麴毒素 14×150 + 二氧化硫 12×180 + 葡萄球菌 11×150 = 11,110
--   通關生命獎勵 5×200 = 1,000 → 設定理論上限 12,110 → 硬上限 12,500
--
-- 暱稱：產品規格「12 個使用者可見字元」由前端與 Edge Function 以字素（grapheme）分段驗證。
--   PostgreSQL 內建正則不支援 \X，也不安裝額外擴充，因此資料庫不做字素計數；
--   資料庫只檢查：非空、合理儲存長度（位元組）、禁止控制字元。
--   位元組上限 200 bytes：足以容納 12 個可見字元（含多碼位 emoji 與組合序列），
--   同時避免超長字串。此為儲存上限，不是「12 字元」的等價換算。

begin;

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
  issued_at     timestamptz not null,
  created_at    timestamptz not null default now(),
  -- 暱稱：1–12 個使用者可見字元（grapheme），且不得含控制字元
  constraint scores_nickname_len  check (octet_length(nickname) between 1 and 200),
  constraint scores_nickname_text  check (nickname !~ '[[:cntrl:]]'),
  constraint scores_score_range    check (score between 0 and 12500),
  constraint scores_outcome_valid  check (outcome in ('won', 'lost')),
  constraint scores_elapsed_range  check (elapsed_ms between 0 and 240000),
  constraint scores_kills_range    check (kills between 0 and 63),
  constraint scores_escapes_range  check (escapes between 0 and 63),
  constraint scores_won_duration    check (outcome <> 'won' or elapsed_ms >= 177000),
  constraint scores_won_server_time check (outcome <> 'won' or created_at - issued_at >= interval '180 seconds'),
  constraint scores_elapsed_le_server
    check (elapsed_ms <= extract(epoch from (created_at - issued_at)) * 1000 + 3000)
);

create index if not exists scores_rank_idx
  on public.scores (version, score desc, created_at asc, id asc);

-- ───────────────────────── 公開榜單檢視表 ─────────────────────────
create or replace view public.v_scores_public
with (security_invoker = false) as
select
  id, version, nickname, score, outcome, created_at,
  row_number() over (partition by version order by score desc, created_at asc, id asc)::int as rank
from public.scores;

-- ───────────────────────── 資料表權限（RLS + 明確撤權） ─────────────────────────
alter table public.run_tickets enable row level security;
alter table public.scores     enable row level security;

revoke all on table public.run_tickets    from public, anon, authenticated;
revoke all on table public.scores         from public, anon, authenticated;
revoke all on table public.v_scores_public from public, anon, authenticated;

-- ───────────────────────── 限流（資料庫端、跨實例） ─────────────────────────
-- 計數與判斷在同一 snapshot；不是「鎖定後插入」，屬軟性流量上限。
-- 真正的併發保證是 scores.ticket_id 唯一約束。
create or replace function public.leaderboard_rate_limited(
  p_ip_hash     text,
  p_window_sec  int default 600,
  p_max_tickets int default 12,
  p_max_submits int default 20
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n_tickets int;
  n_scores  int;
begin
  if p_ip_hash is null then
    return false;
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

-- ───────────────────────── ticket 驗證 ─────────────────────────
create or replace function public.leaderboard_ticket(p_id uuid, p_token_hash text)
returns table (id uuid, version text, issued_at timestamptz, expires_at timestamptz, consumed_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.version, t.issued_at, t.expires_at, t.consumed_at
  from public.run_tickets t
  where t.id = p_id and t.token_hash = p_token_hash;
$$;

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
set search_path = public, pg_temp
as $$
  select v.rank, v.nickname, v.score, v.outcome
  from public.v_scores_public v
  where v.version = p_version and v.rank <= 100
  order by v.rank
  limit greatest(1, least(10, coalesce(p_limit, 10)))
  offset greatest(0, least(90, coalesce(p_offset, 0)));
$$;

-- ───────────────────────── 名次 ─────────────────────────
create or replace function public.leaderboard_rank_of(p_score_id bigint)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.rank from public.v_scores_public v where v.id = p_score_id and v.rank <= 100;
$$;

-- ───────────────────────── 清理（不影響成績） ─────────────────────────
create or replace function public.leaderboard_cleanup(p_keep_days int default 7)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
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

-- ───────────────────────── 函式權限（逐一簽名） ─────────────────────────
-- 只處理本專案的五支函式，不動 public schema 的其他權限。
-- 注意：Postgres 預設把函式 EXECUTE 給 PUBLIC，因此三種角色都要撤。
revoke all on function public.leaderboard_rate_limited(text, int, int, int) from public, anon, authenticated;
revoke all on function public.leaderboard_ticket(uuid, text)                  from public, anon, authenticated;
revoke all on function public.leaderboard_page(text, int, int)                from public, anon, authenticated;
revoke all on function public.leaderboard_rank_of(bigint)                     from public, anon, authenticated;
revoke all on function public.leaderboard_cleanup(int)                        from public, anon, authenticated;

grant execute on function public.leaderboard_rate_limited(text, int, int, int) to service_role;
grant execute on function public.leaderboard_ticket(uuid, text)                to service_role;
grant execute on function public.leaderboard_page(text, int, int)              to service_role;
grant execute on function public.leaderboard_rank_of(bigint)                   to service_role;
grant execute on function public.leaderboard_cleanup(int)                      to service_role;

-- 後端（service_role）需要直接讀寫資料表與檢視表
grant select, insert, update, delete on table public.run_tickets to service_role;
grant select, insert, delete        on table public.scores      to service_role;
grant select                        on table public.v_scores_public to service_role;

-- 在交易內就驗證一次：三個角色對五支函式的實際權限
do $$
declare
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args,
           has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
           has_function_privilege('service_role',  p.oid, 'EXECUTE') as svc_exec
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('leaderboard_rate_limited','leaderboard_ticket','leaderboard_page',
                        'leaderboard_rank_of','leaderboard_cleanup')
  loop
    if r.anon_exec or r.auth_exec or not r.svc_exec then
      raise exception 'permission check failed: %(%) anon=% auth=% service_role=%',
        r.proname, r.args, r.anon_exec, r.auth_exec, r.svc_exec;
    end if;
  end loop;
end;
$$;

commit;
