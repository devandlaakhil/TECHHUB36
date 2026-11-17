-- Apply after schema.sql, including on existing deployments before accepting Go purchases.
begin;
alter table public.payments drop constraint if exists payments_tier_check;
alter table public.payments add constraint payments_tier_check
  check (tier in ('L1', 'L2', 'L3', 'Go', 'Pro'));
alter table public.entitlements drop constraint if exists entitlements_tier_check;
alter table public.entitlements add constraint entitlements_tier_check
  check (tier in ('L1', 'L2', 'L3', 'Go', 'Pro'));

-- No interview transcript is stored: only usage, a settings hash, and claim state.
create table if not exists public.ai_interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  context_hash text not null check (context_hash ~ '^[0-9a-f]{64}$'),
  state text not null check (state in ('starting', 'active', 'complete', 'failed')),
  completed_turns integer not null default 0 check (completed_turns between 0 and 6),
  claim_id uuid,
  busy_until timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists ai_interview_sessions_user_day_idx
  on public.ai_interview_sessions(user_id, created_at);
alter table public.ai_interview_sessions enable row level security;
revoke all on public.ai_interview_sessions from public, anon, authenticated;
grant all on public.ai_interview_sessions to service_role;

create or replace function public.claim_ai_interview(
  p_user_id uuid, p_session_id uuid, p_context_hash text, p_turn integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan text;
  session public.ai_interview_sessions%rowtype;
  claim uuid := gen_random_uuid();
begin
  if p_user_id is null or p_context_hash is null or p_context_hash !~ '^[0-9a-f]{64}$'
    or p_turn is null or p_turn < 0 or p_turn > 6 then
    return jsonb_build_object('error', 'invalid');
  end if;
  select tier into plan from public.entitlements
    where user_id = p_user_id and active and tier = 'Pro'
    limit 1;
  if plan is null then return jsonb_build_object('error', 'membership'); end if;

  if p_session_id is null then
    if p_turn <> 0 then return jsonb_build_object('error', 'invalid'); end if;
    -- One transaction lock serializes concurrent starts for this user across all servers.
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
    insert into public.ai_interview_sessions(user_id, context_hash, state, claim_id, busy_until)
      values (p_user_id, p_context_hash, 'starting', claim, now() + interval '45 seconds')
      returning * into session;
  else
    select * into session from public.ai_interview_sessions
      where id = p_session_id and user_id = p_user_id for update;
    if not found or session.context_hash <> p_context_hash or session.state <> 'active'
      or session.expires_at <= now() or p_turn <> session.completed_turns + 1 then
      return jsonb_build_object('error', 'session');
    end if;
    if session.busy_until > now() then return jsonb_build_object('error', 'busy'); end if;
    update public.ai_interview_sessions set claim_id = claim, busy_until = now() + interval '45 seconds'
      where id = session.id;
  end if;
  return jsonb_build_object('sessionId', session.id, 'claimId', claim, 'plan', plan);
end;
$$;

create or replace function public.settle_ai_interview(
  p_user_id uuid, p_session_id uuid, p_claim_id uuid,
  p_turn integer, p_success boolean, p_complete boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_turn is null or p_turn < 0 or p_turn > 6 or p_success is null or p_complete is null then
    return false;
  end if;
  update public.ai_interview_sessions
    set state = case
        when not p_success and p_turn = 0 then 'failed'
        when p_success and (p_complete or p_turn = 6) then 'complete'
        else 'active' end,
      completed_turns = case when p_success then p_turn else completed_turns end,
      claim_id = null, busy_until = null
    where id = p_session_id and user_id = p_user_id and claim_id = p_claim_id
      and busy_until > now()
      and ((p_turn = 0 and state = 'starting')
        or (state = 'active' and p_turn = completed_turns + 1));
  return found;
end;
$$;

revoke all on function public.claim_ai_interview(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.settle_ai_interview(uuid, uuid, uuid, integer, boolean, boolean) from public, anon, authenticated;
grant execute on function public.claim_ai_interview(uuid, uuid, text, integer) to service_role;
grant execute on function public.settle_ai_interview(uuid, uuid, uuid, integer, boolean, boolean) to service_role;
commit;
