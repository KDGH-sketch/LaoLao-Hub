-- ========================================================
--  LaoLao (ຮຽນພາສາລາວ) - Supabase schema, security policies and storage
--
--  Run in the Supabase Dashboard: SQL Editor -> New query -> paste everything -> Run.
--  Safe to run again: tables are only created when missing (existing rows are kept),
--  and ALL existing policies on these tables are replaced by the ones below.
--
--  Owner (always full access): change the email in ll_owner_email() if needed.
-- ========================================================

begin;

-- --------------------------------------------------------
-- 1. Tables (every table: id text, data jsonb)
-- --------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'users','admins','adminNotes','access','plans','subscriptions','settings',
    'lessons','patterns','grammar','vocabulary','dialogues','quizzes','audio','paths','releases','lexicon',
    'videos','tones','culture','characters','dictionary',
    'bundles','progress','reviews','bookmarks','notes','activity',
    'usage','accessLogs',
    'vocab','saved'  -- legacy, unused by the app
  ] loop
    execute format('create table if not exists public.%I (
      id text primary key,
      data jsonb not null default ''{}''::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- --------------------------------------------------------
-- 2. Helper functions (security definer: they read admins/users/access without RLS recursion)
-- --------------------------------------------------------
create or replace function public.ll_owner_email() returns text
language sql immutable as $$ select 'kindathanomsuck@gmail.com'::text $$;

-- The owner is the account that completed the first-time setup (settings/bootstrap.uid).
-- The email is used only before setup has happened, so nobody can become owner by claiming the email later.
create or replace function public.ll_is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.settings where id = 'bootstrap' and coalesce(data ->> 'uid', '') <> '')
      then auth.uid() is not null and auth.uid()::text = (select data ->> 'uid' from public.settings where id = 'bootstrap')
    else coalesce(lower(auth.jwt() ->> 'email') = lower(public.ll_owner_email()), false)
  end
$$;

-- Role of the signed-in admin (null when not an admin or disabled)
create or replace function public.ll_admin_role() returns text
language sql stable security definer set search_path = public as $$
  select a.data ->> 'role' from public.admins a
  where a.id = auth.uid()::text and coalesce(a.data ->> 'status', 'active') <> 'disabled'
$$;

create or replace function public.ll_is_admin() returns boolean
language sql stable as $$ select public.ll_is_owner() or public.ll_admin_role() is not null $$;

create or replace function public.ll_is_super() returns boolean
language sql stable as $$ select public.ll_is_owner() or coalesce(public.ll_admin_role() in ('super','owner'), false) $$;

create or replace function public.ll_can_support() returns boolean
language sql stable as $$ select public.ll_is_super() or coalesce(public.ll_admin_role() in ('support','admin'), false) $$;

-- Mirrors canEditMenu() in js/admin/state.js
create or replace function public.ll_can_edit(menu text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.ll_is_super()
    or coalesce(public.ll_admin_role() in ('editor','content','admin'), false)
    or exists (select 1 from public.admins a
               where a.id = auth.uid()::text and a.data ->> 'role' = 'custom'
                 and coalesce(a.data ->> 'status', 'active') <> 'disabled'
                 and a.data -> 'permissions' -> menu ->> 'edit' = 'true')
$$;

-- Any admin who may change content somewhere (publishing, uploads)
create or replace function public.ll_can_publish() returns boolean
language sql stable as $$
  select public.ll_is_super() or coalesce(public.ll_admin_role() in ('editor','content','admin','custom'), false)
$$;

create or replace function public.ll_registration_open() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select data ->> 'allowRegistration' from public.settings where id = 'app') = 'true', false)
$$;

-- --------------------------------------------------------
-- Entitlements: plan → features, usage limits and content tier (see docs/ACCESS.md)
-- ll_resolve() mirrors resolveEntitlements() in js/shared/access.js; keep the two identical.
-- Precedence: global switch-off → account status → plan → personal grants → usage limit.
-- --------------------------------------------------------

-- jsonb number / numeric string → numeric (null otherwise)
create or replace function public.ll_num(v jsonb) returns numeric
language plpgsql immutable as $$
begin
  if v is null then return null; end if;
  if jsonb_typeof(v) = 'number' then return (v #>> '{}')::numeric; end if;
  if jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then return (v #>> '{}')::numeric; end if;
  return null;
end $$;

-- Dates are stored as epoch milliseconds (older rows may hold ISO strings)
create or replace function public.ll_ms(v jsonb) returns numeric
language plpgsql stable as $$
begin
  if v is null or jsonb_typeof(v) = 'null' then return null; end if;
  if jsonb_typeof(v) = 'number' then return (v #>> '{}')::numeric; end if;
  if jsonb_typeof(v) = 'string' then return extract(epoch from (v #>> '{}')::timestamptz) * 1000; end if;
  return null;
exception when others then return null;
end $$;

-- The signed-in account's effective plan, features, limits and content tier.
create or replace function public.ll_resolve() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  s jsonb; u jsonb; a jsonb; p jsonb; own jsonb; k text; v jsonb;
  tz text; off jsonb; def_id text; st text; status text := 'none';
  now_ms numeric := floor(extract(epoch from now()) * 1000);
  exp numeric; grace numeric;
  feats jsonb := '{}'; lims jsonb := '{}'; grants jsonb := '[]'; all_f boolean := false;
  res jsonb;
begin
  select data into s from public.settings where id = 'app';
  s := coalesce(s, '{}'::jsonb);
  tz := coalesce(nullif(s ->> 'timezone', ''), 'Asia/Vientiane');
  off := case when jsonb_typeof(s -> 'disabledFeatures') = 'array' then s -> 'disabledFeatures' else '[]'::jsonb end;
  res := jsonb_build_object('uid', v_uid, 'role', 'guest', 'status', 'guest', 'planId', null, 'tier', 0, 'all', false,
           'features', '{}'::jsonb, 'grants', '[]'::jsonb, 'limits', '{}'::jsonb, 'off', off, 'tz', tz,
           'start', null, 'expiresAt', null, 'graceUntil', null, 'now', now_ms);
  if v_uid is null then return res; end if;
  if public.ll_is_admin() then
    return res || jsonb_build_object('role', 'admin', 'status', 'admin', 'tier', 99, 'all', true, 'off', '[]'::jsonb);
  end if;
  res := res || '{"role":"learner"}'::jsonb;
  -- no learner profile = not a learner (e.g. an account created directly through the Supabase API while registration is closed)
  select data into u from public.users where id = v_uid;
  if u is null then return res || '{"status":"no_profile"}'::jsonb; end if;
  if coalesce(u ->> 'status', 'active') <> 'active' then return res || '{"status":"disabled"}'::jsonb; end if;

  def_id := coalesce(nullif(s ->> 'defaultPlanId', ''), 'free');
  select x.data || jsonb_build_object('id', x.id) into p from public.plans x where x.id = def_id;
  p := coalesce(p, jsonb_build_object('id', def_id, 'tier', 1));
  select data into a from public.access where id = v_uid;
  if a is not null then
    st := coalesce(a ->> 'status', 'none');
    res := res || jsonb_build_object('start', a -> 'start', 'expiresAt', a -> 'expiresAt');
    if jsonb_typeof(a -> 'grants') = 'array' then
      select coalesce(jsonb_agg(g), '[]'::jsonb) into grants from jsonb_array_elements(a -> 'grants') g where jsonb_typeof(g) = 'string';
    end if;
    if st = 'suspended' then
      return res || jsonb_build_object('status', 'suspended', 'planId', a -> 'planId', 'grants', '[]'::jsonb);
    end if;
    if st in ('active', 'trial') then
      select x.data || jsonb_build_object('id', x.id) into own from public.plans x where x.id = a ->> 'planId';
      own := coalesce(own, jsonb_build_object('id', coalesce(a ->> 'planId', def_id), 'tier', coalesce(a -> 'tier', '1'::jsonb)));
      exp := public.ll_ms(a -> 'expiresAt');
      grace := coalesce(public.ll_num(own -> 'graceDays'), 0) * 86400000;
      if exp is null or exp > now_ms then p := own; status := st;
      elsif exp + grace > now_ms then p := own; status := 'grace'; res := res || jsonb_build_object('graceUntil', exp + grace);
      else status := 'expired';
      end if;
    else
      status := st;                                  -- cancelled, pending, … → default plan
    end if;
  end if;

  if jsonb_typeof(p -> 'entitlements') = 'object' then
    for k, v in select * from jsonb_each(p -> 'entitlements') loop
      if v = 'true'::jsonb then feats := feats || jsonb_build_object(k, true); end if;
    end loop;
    if jsonb_typeof(p -> 'limits') = 'object' then
      for k, v in select * from jsonb_each(p -> 'limits') loop
        if feats ? k and jsonb_typeof(v) = 'object' and public.ll_num(v -> 'n') is not null and public.ll_num(v -> 'n') >= 0 then
          lims := lims || jsonb_build_object(k, jsonb_build_object('n', floor(public.ll_num(v -> 'n')), 'per', coalesce(nullif(v ->> 'per', ''), 'day')));
        end if;
      end loop;
    end if;
  else
    all_f := true;                                   -- plan not configured yet: every feature, no limits
  end if;
  return res || jsonb_build_object('status', status, 'planId', p ->> 'id',
    'tier', greatest(1, coalesce(floor(public.ll_num(p -> 'tier'))::int, 1)),
    'all', all_f, 'features', feats, 'limits', lims, 'grants', grants);
exception when others then
  return coalesce(res, '{}'::jsonb) || '{"status":"error","tier":1}'::jsonb;
end $$;

-- Effective content tier: 0 public, 1 free, 2+ paid, 99 admin (used by the bundles policy)
create or replace function public.ll_my_tier() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((public.ll_resolve() ->> 'tier')::int, 0)
$$;

-- Decision for one feature (mirrors decide() in js/shared/access.js)
create or replace function public.ll_decide(e jsonb, f text) returns text
language sql immutable as $$
  select case
    when e is null or e ->> 'role' = 'guest' then 'not_signed_in'
    when e ->> 'role' = 'admin' then 'admin'
    when e ->> 'status' = 'disabled' then 'account_disabled'
    when e ->> 'status' = 'suspended' then 'account_suspended'
    when e ->> 'status' = 'no_profile' then 'no_profile'
    when coalesce(e -> 'off', '[]'::jsonb) ? f then 'feature_disabled'
    when coalesce(e -> 'grants', '[]'::jsonb) ? f then 'granted'
    when coalesce((e ->> 'all')::boolean, false) or coalesce(e -> 'features', '{}'::jsonb) ? f then 'plan_allows_feature'
    else 'feature_not_in_plan'
  end
$$;

create or replace function public.ll_can(f text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.ll_decide(public.ll_resolve(), f) in ('admin', 'granted', 'plan_allows_feature')
$$;

-- Counter key and reset time of a limit period, in the platform time zone (mirrors periodOf() in js/shared/access.js)
create or replace function public.ll_period(per text, tz text, p_start jsonb, p_exp jsonb, out key text, out reset_ms numeric)
language plpgsql stable as $$
declare loc timestamp := now() at time zone tz; d date := (now() at time zone tz)::date; m date;
begin
  if per = 'day' then
    key := 'd' || to_char(d, 'YYYY-MM-DD');
    reset_ms := extract(epoch from ((d + 1)::timestamp at time zone tz)) * 1000;
  elsif per = 'week' then                                     -- weeks start on Monday
    m := date_trunc('week', loc)::date;
    key := 'w' || to_char(m, 'YYYY-MM-DD');
    reset_ms := extract(epoch from ((m + 7)::timestamp at time zone tz)) * 1000;
  elsif per = 'month' then
    m := date_trunc('month', loc)::date;
    key := 'm' || to_char(m, 'YYYY-MM');
    reset_ms := extract(epoch from ((m + interval '1 month') at time zone tz)) * 1000;
  elsif per = 'period' then                                   -- the current subscription
    key := 'p' || coalesce(round(public.ll_ms(p_start))::text, '0');
    reset_ms := public.ll_ms(p_exp);
  else                                                        -- lifetime
    key := 'l'; reset_ms := null;
  end if;
end $$;

-- One counter step under a row lock, so parallel requests can never pass the limit. Internal: not callable by users.
create or replace function public.ll_count(p_id text, p_limit int, p_amount int, p_ref text, p_info jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb; n int;
begin
  insert into public."usage" (id, data) values (p_id, jsonb_build_object('n', 0, 'refs', '{}'::jsonb) || coalesce(p_info, '{}'::jsonb))
    on conflict (id) do nothing;
  select data into d from public."usage" where id = p_id for update;
  n := coalesce(public.ll_num(d -> 'n'), 0)::int;
  if p_ref is not null and coalesce(d -> 'refs', '{}'::jsonb) ? p_ref then
    return jsonb_build_object('allowed', true, 'reason', 'already_counted', 'used', n);
  end if;
  if p_amount <= 0 then
    return jsonb_build_object('allowed', n < p_limit, 'reason', case when n < p_limit then 'within_limit' else 'limit_reached' end, 'used', n);
  end if;
  if n + p_amount > p_limit then
    return jsonb_build_object('allowed', false, 'reason', 'limit_reached', 'used', n);
  end if;
  update public."usage" set
    data = data || coalesce(p_info, '{}'::jsonb) || jsonb_build_object('n', n + p_amount, 'updatedAt', floor(extract(epoch from now()) * 1000))
           || case when p_ref is not null then jsonb_build_object('refs', coalesce(data -> 'refs', '{}'::jsonb) || jsonb_build_object(p_ref, true)) else '{}'::jsonb end,
    updated_at = now()
  where id = p_id;
  return jsonb_build_object('allowed', true, 'reason', 'within_limit', 'used', n + p_amount);
end $$;

-- Denials and limit hits, for Admin → Access logs. Internal: not callable by users.
create or replace function public.ll_log(e jsonb, f text, r jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if e ->> 'uid' is null then return; end if;
  insert into public."accessLogs" (id, data) values ((e ->> 'uid') || '__' || gen_random_uuid()::text,
    jsonb_build_object('uid', e ->> 'uid', 'feature', f, 'plan', e -> 'planId', 'status', e -> 'status', 'decision', case when (r ->> 'allowed')::boolean then 'allow' else 'deny' end,
      'reason', r -> 'reason', 'used', r -> 'used', 'limit', r -> 'limit', 'at', floor(extract(epoch from now()) * 1000)));
end $$;

-- Ask before a limited action: checks the plan, counts one use (p_amount 0 = only check), returns the decision.
-- p_ref counts distinct items: opening the same lesson again in the same period is free.
create or replace function public.ll_use(p_feature text, p_amount int default 1, p_ref text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb; reason text; lim jsonb; per record; r jsonb; o jsonb;
begin
  e := public.ll_resolve();
  reason := public.ll_decide(e, p_feature);
  o := jsonb_build_object('feature', p_feature, 'plan', e -> 'planId', 'allowed', reason in ('admin', 'granted', 'plan_allows_feature'),
         'reason', reason, 'used', 0, 'limit', null, 'per', null, 'resetAt', null);
  if not (o ->> 'allowed')::boolean then perform public.ll_log(e, p_feature, o); return o; end if;
  lim := case when e ->> 'role' = 'admin' or coalesce(e -> 'grants', '[]'::jsonb) ? p_feature then null else e -> 'limits' -> p_feature end;
  if lim is null or jsonb_typeof(lim) <> 'object' then
    return o || jsonb_build_object('reason', case when reason = 'admin' then 'admin' else 'unlimited' end);
  end if;
  select * into per from public.ll_period(lim ->> 'per', e ->> 'tz', e -> 'start', e -> 'expiresAt');
  r := public.ll_count((e ->> 'uid') || '__' || p_feature || '__' || per.key, (lim ->> 'n')::int, coalesce(p_amount, 1), p_ref,
         jsonb_build_object('uid', e ->> 'uid', 'feature', p_feature, 'period', per.key, 'limit', (lim ->> 'n')::int, 'per', lim ->> 'per', 'resetAt', per.reset_ms));
  o := o || r || jsonb_build_object('limit', (lim ->> 'n')::int, 'per', lim ->> 'per', 'resetAt', per.reset_ms);
  if not (o ->> 'allowed')::boolean then perform public.ll_log(e, p_feature, o); end if;
  return o;
end $$;

-- Everything the app needs for its UI in one call: the resolved account plus the current counters.
create or replace function public.ll_entitlements() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e jsonb; k text; lim jsonb; per record; n numeric; u jsonb := '{}';
begin
  e := public.ll_resolve();
  if e ->> 'role' = 'learner' then
    for k, lim in select * from jsonb_each(coalesce(e -> 'limits', '{}'::jsonb)) loop
      if coalesce(e -> 'grants', '[]'::jsonb) ? k then continue; end if;
      select * into per from public.ll_period(lim ->> 'per', e ->> 'tz', e -> 'start', e -> 'expiresAt');
      select public.ll_num(data -> 'n') into n from public."usage" where id = (e ->> 'uid') || '__' || k || '__' || per.key;
      u := u || jsonb_build_object(k, jsonb_build_object('used', coalesce(n, 0), 'limit', (lim ->> 'n')::int, 'per', lim ->> 'per', 'resetAt', per.reset_ms));
    end loop;
  end if;
  return e || jsonb_build_object('usage', u);
end $$;

revoke all on function public.ll_count(text, int, int, text, jsonb) from public, anon, authenticated;
revoke all on function public.ll_log(jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.ll_use(text, int, text) from public, anon;
grant execute on function public.ll_use(text, int, text) to authenticated;
grant execute on function public.ll_entitlements() to anon, authenticated;
grant execute on function public.ll_can(text) to anon, authenticated;

-- Learners may edit their own profile, but not status / role / level / email
create or replace function public.ll_users_protect() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if public.ll_can_support() then return new; end if;
  foreach k in array array['status','role','level','email'] loop
    if old.data ? k then new.data := jsonb_set(new.data, array[k], old.data -> k);
    else new.data := new.data - k; end if;
  end loop;
  return new;
end $$;
drop trigger if exists ll_users_protect on public.users;
create trigger ll_users_protect before update on public.users
  for each row execute function public.ll_users_protect();

-- --------------------------------------------------------
-- 3. Remove every existing policy on these tables
-- --------------------------------------------------------
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public' and tablename = any (array[
             'users','admins','adminNotes','access','plans','subscriptions','settings',
             'lessons','patterns','grammar','vocabulary','dialogues','quizzes','audio','paths','releases','lexicon',
             'videos','tones','culture','characters','dictionary',
             'bundles','progress','reviews','bookmarks','notes','activity','usage','accessLogs','vocab','saved'])
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- --------------------------------------------------------
-- 4. Policies
-- --------------------------------------------------------

-- Content: admins read, editors write (per menu). Learners never read these; they read bundles.
do $$
declare t text;
begin
  foreach t in array array['lessons','patterns','grammar','vocabulary','dialogues','quizzes','audio','paths','releases','lexicon',
                           'videos','tones','culture','characters','dictionary'] loop
    execute format('create policy "ll admin read" on public.%I for select using (public.ll_is_admin())', t);
    execute format('create policy "ll edit insert" on public.%I for insert with check (public.ll_can_edit(%L))', t, t);
    execute format('create policy "ll edit update" on public.%I for update using (public.ll_can_edit(%L)) with check (public.ll_can_edit(%L))', t, t, t);
    execute format('create policy "ll edit delete" on public.%I for delete using (public.ll_can_edit(%L))', t, t);
  end loop;
end $$;

-- Published bundles: everyone reads "meta"; parts only up to the reader's tier
create policy "ll read meta or own tier" on public.bundles for select
  using (id = 'meta' or coalesce((data ->> 'tier')::int, 0) <= public.ll_my_tier());
create policy "ll publish insert" on public.bundles for insert with check (public.ll_can_publish());
create policy "ll publish update" on public.bundles for update using (public.ll_can_publish()) with check (public.ll_can_publish());
create policy "ll publish delete" on public.bundles for delete using (public.ll_can_publish());

-- Plans: public read, Super Admin writes
create policy "ll public read" on public.plans for select using (true);
create policy "ll super insert" on public.plans for insert with check (public.ll_is_super());
create policy "ll super update" on public.plans for update using (public.ll_is_super()) with check (public.ll_is_super());
create policy "ll super delete" on public.plans for delete using (public.ll_is_super());

-- Settings: public read (app name, registration, promotions); Super Admin writes; editors may update the publish state
create policy "ll public read" on public.settings for select using (true);
create policy "ll write insert" on public.settings for insert
  with check (public.ll_is_super() or (id = 'bundle' and public.ll_can_publish()));
create policy "ll write update" on public.settings for update
  using (public.ll_is_super() or (id = 'bundle' and public.ll_can_publish()))
  with check (public.ll_is_super() or (id = 'bundle' and public.ll_can_publish()));
create policy "ll super delete" on public.settings for delete using (public.ll_is_super());

-- Users: own row or admins; self-registration only as an active learner while registration is open
create policy "ll own or admin read" on public.users for select using (id = auth.uid()::text or public.ll_is_admin());
create policy "ll insert" on public.users for insert with check (
  public.ll_can_support()
  or (id = auth.uid()::text and (
        exists (select 1 from public.users u where u.id = auth.uid()::text)   -- upsert of an existing own row
        or (data ->> 'role' = 'learner' and data ->> 'status' = 'active' and public.ll_registration_open()))));
create policy "ll own or support update" on public.users for update
  using (id = auth.uid()::text or public.ll_can_support())
  with check (id = auth.uid()::text or public.ll_can_support());
create policy "ll support delete" on public.users for delete using (public.ll_can_support());

-- Admins: any admin reads; Super Admin writes (the owner bootstraps as Super Admin)
create policy "ll own or admin read" on public.admins for select using (id = auth.uid()::text or public.ll_is_admin());
create policy "ll super insert" on public.admins for insert with check (public.ll_is_super());
create policy "ll super update" on public.admins for update using (public.ll_is_super()) with check (public.ll_is_super());
create policy "ll super delete" on public.admins for delete using (public.ll_is_super());

-- Private notes about learners
create policy "ll support all" on public."adminNotes" for all using (public.ll_can_support()) with check (public.ll_can_support());

-- Access: learner reads own; support writes; self-registration may create one entitlement on the default plan
-- (the plan id is checked because access is resolved from the plan: otherwise a learner could register as "premium")
create policy "ll own or admin read" on public.access for select using (id = auth.uid()::text or public.ll_is_admin());
create policy "ll insert" on public.access for insert with check (
  public.ll_can_support()
  or (id = auth.uid()::text and public.ll_registration_open()
      and data ->> 'tier' = '1' and data ->> 'source' = 'registration' and data ->> 'status' = 'active'
      and coalesce(data ->> 'planId', '') = coalesce(nullif((select s.data ->> 'defaultPlanId' from public.settings s where s.id = 'app'), ''), 'free')
      and not (data ? 'grants') and coalesce(jsonb_typeof(data -> 'expiresAt'), 'null') = 'null'
      and not exists (select 1 from public.access x where x.id = auth.uid()::text)));
create policy "ll support update" on public.access for update using (public.ll_can_support()) with check (public.ll_can_support());
create policy "ll support delete" on public.access for delete using (public.ll_can_support());

-- Usage counters: the learner reads their own; only ll_use() writes (no insert/update policy for anyone)
create policy "ll own or admin read" on public."usage" for select
  using (split_part(id, '__', 1) = auth.uid()::text or public.ll_is_admin());
create policy "ll super delete" on public."usage" for delete using (public.ll_is_super());

-- Access logs: written only by ll_use(); learner support and Super Admin read
create policy "ll support read" on public."accessLogs" for select using (public.ll_can_support());
create policy "ll super delete" on public."accessLogs" for delete using (public.ll_is_super());

-- Subscription history
create policy "ll own or admin read" on public.subscriptions for select using (public.ll_is_admin() or data ->> 'uid' = auth.uid()::text);
create policy "ll support insert" on public.subscriptions for insert with check (public.ll_can_support());
create policy "ll support update" on public.subscriptions for update using (public.ll_can_support()) with check (public.ll_can_support());
create policy "ll support delete" on public.subscriptions for delete using (public.ll_can_support());

-- Progress: own rows ("{uid}" and "{uid}__events__{id}"); admins read
create policy "ll own or admin read" on public.progress for select
  using (split_part(id, '__', 1) = auth.uid()::text or public.ll_is_admin());
create policy "ll own insert" on public.progress for insert with check (split_part(id, '__', 1) = auth.uid()::text);
create policy "ll own update" on public.progress for update
  using (split_part(id, '__', 1) = auth.uid()::text) with check (split_part(id, '__', 1) = auth.uid()::text);
create policy "ll own or super delete" on public.progress for delete
  using (split_part(id, '__', 1) = auth.uid()::text or public.ll_is_super());

-- Review cards, bookmarks, learner notes: own rows only ("{uid}__items__{id}")
do $$
declare t text;
begin
  foreach t in array array['reviews','bookmarks','notes'] loop
    execute format('create policy "ll own all" on public.%I for all using (split_part(id, ''__'', 1) = auth.uid()::text) with check (split_part(id, ''__'', 1) = auth.uid()::text)', t);
  end loop;
end $$;

-- Activity feed: anyone signed in adds entries about themselves; admins read
create policy "ll admin read" on public.activity for select using (public.ll_is_admin());
create policy "ll own insert" on public.activity for insert with check (auth.uid() is not null and data ->> 'uid' = auth.uid()::text);
create policy "ll super delete" on public.activity for delete using (public.ll_is_super());

-- Legacy tables: Super Admin only
create policy "ll super all" on public.vocab for all using (public.ll_is_super()) with check (public.ll_is_super());
create policy "ll super all" on public.saved for all using (public.ll_is_super()) with check (public.ll_is_super());

-- --------------------------------------------------------
-- 5. Atomic updates: apply field changes to one row in a single locked step.
--    p_ops: [{ "path": ["skills","reading","t"], "inc": 1 }, { "path": ["days","2026-10-02"], "set": 1 }, { "path": ["patterns","5"], "del": true }]
--    Runs with the caller's permissions, so the row-level security policies above still apply.
-- --------------------------------------------------------
create or replace function public.ll_apply(p_table text, p_id text, p_ops jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare doc jsonb; op jsonb; p text[]; i int; cur jsonb;
begin
  if p_table not in ('users','admins','adminNotes','access','plans','subscriptions','settings',
                     'lessons','patterns','grammar','vocabulary','dialogues','quizzes','audio','paths','releases','lexicon',
                     'videos','tones','culture','characters','dictionary','bundles','progress','reviews','bookmarks','notes','activity') then
    raise exception 'll_apply: table % is not allowed', p_table;
  end if;
  execute format('select data from public.%I where id = $1 for update', p_table) into doc using p_id;
  doc := coalesce(doc, '{}'::jsonb);
  for op in select * from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb)) loop
    p := array(select jsonb_array_elements_text(op -> 'path'));
    if coalesce(array_length(p, 1), 0) = 0 then continue; end if;
    for i in 1 .. array_length(p, 1) - 1 loop            -- create missing parent objects
      if jsonb_typeof(doc #> p[1:i]) is distinct from 'object' then doc := jsonb_set(doc, p[1:i], '{}'::jsonb, true); end if;
    end loop;
    if op ? 'del' then
      doc := doc #- p;
    elsif op ? 'inc' then
      cur := doc #> p;
      doc := jsonb_set(doc, p, to_jsonb(coalesce(case when jsonb_typeof(cur) = 'number' then (cur #>> '{}')::numeric end, 0) + (op ->> 'inc')::numeric), true);
    else
      doc := jsonb_set(doc, p, coalesce(op -> 'set', 'null'::jsonb), true);
    end if;
  end loop;
  execute format('insert into public.%I (id, data, updated_at) values ($1, $2, now())
                  on conflict (id) do update set data = excluded.data, updated_at = now()', p_table) using p_id, doc;
end $$;
revoke all on function public.ll_apply(text, text, jsonb) from public, anon;
grant execute on function public.ll_apply(text, text, jsonb) to authenticated;

-- self-test (runs as the SQL Editor's admin role on a temporary row; any mismatch aborts and rolls back this whole script)
do $$
declare d jsonb;
begin
  perform public.ll_apply('settings', '__ll_selftest', '[{"path":["a","b"],"set":1},{"path":["n"],"inc":2},{"path":["n"],"inc":3},{"path":["x"],"set":true},{"path":["x"],"del":true}]'::jsonb);
  select data into d from public.settings where id = '__ll_selftest';
  if d is distinct from '{"a":{"b":1},"n":5}'::jsonb then raise exception 'll_apply self-test failed: %', d; end if;
  delete from public.settings where id = '__ll_selftest';
end $$;

-- self-test of the access functions (limit 2: two uses pass, the third is refused; a repeated ref is not counted again)
do $$
declare r jsonb; e jsonb; p record;
begin
  delete from public."usage" where id like '\_\_ll\_selftest%';
  r := public.ll_count('__ll_selftest__f__d', 2, 1, null, null); if not (r ->> 'allowed')::boolean then raise exception 'access self-test 1: %', r; end if;
  r := public.ll_count('__ll_selftest__f__d', 2, 1, 'a', null);  if not (r ->> 'allowed')::boolean then raise exception 'access self-test 2: %', r; end if;
  r := public.ll_count('__ll_selftest__f__d', 2, 1, 'a', null);  if r ->> 'reason' <> 'already_counted' then raise exception 'access self-test 3: %', r; end if;
  r := public.ll_count('__ll_selftest__f__d', 2, 1, null, null); if (r ->> 'allowed')::boolean or (r ->> 'used')::int <> 2 then raise exception 'access self-test 4: %', r; end if;
  r := public.ll_count('__ll_selftest__f__d', 2, 0, null, null); if (r ->> 'allowed')::boolean then raise exception 'access self-test 5: %', r; end if;
  delete from public."usage" where id like '\_\_ll\_selftest%';
  select * into p from public.ll_period('day', 'Asia/Vientiane', null, null);
  if p.key !~ '^d\d{4}-\d{2}-\d{2}$' or p.reset_ms <= extract(epoch from now()) * 1000 then raise exception 'access self-test period: % %', p.key, p.reset_ms; end if;
  e := '{"role":"learner","status":"none","all":false,"features":{"a":true},"grants":["b"],"off":["c"]}'::jsonb;
  if public.ll_decide(e, 'a') <> 'plan_allows_feature' or public.ll_decide(e, 'b') <> 'granted'
     or public.ll_decide(e, 'c') <> 'feature_disabled' or public.ll_decide(e, 'd') <> 'feature_not_in_plan' then
    raise exception 'access self-test decide';
  end if;
  if public.ll_resolve() ->> 'role' <> 'guest' then raise exception 'access self-test: the SQL editor must resolve as a guest'; end if;
end $$;

-- --------------------------------------------------------
-- 6. Storage: public bucket for audio / images, uploads by content admins
-- --------------------------------------------------------
insert into storage.buckets (id, name, public) values ('laolao-assets', 'laolao-assets', true)
  on conflict (id) do update set public = true;

drop policy if exists "ll assets insert" on storage.objects;
drop policy if exists "ll assets update" on storage.objects;
drop policy if exists "ll assets delete" on storage.objects;
create policy "ll assets insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'laolao-assets' and public.ll_can_publish());
create policy "ll assets update" on storage.objects for update to authenticated
  using (bucket_id = 'laolao-assets' and public.ll_can_publish())
  with check (bucket_id = 'laolao-assets' and public.ll_can_publish());
create policy "ll assets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'laolao-assets' and public.ll_can_publish());

commit;

-- Information: accounts that have no learner profile and are not administrators. After this script they only
-- see public content. If any of them are real learners, add them in Admin → Learners, or uncomment the insert below.
select u.email, u.created_at from auth.users u
 where not exists (select 1 from public.users p where p.id = u.id::text)
   and not exists (select 1 from public.admins a where a.id = u.id::text)
 order by u.created_at;
-- insert into public.users (id, data)
--   select u.id::text, jsonb_build_object('email', u.email, 'name', '', 'status', 'active', 'level', 1, 'role', 'learner', 'prefs', '{}'::jsonb)
--   from auth.users u where not exists (select 1 from public.users p where p.id = u.id::text)
--                       and not exists (select 1 from public.admins a where a.id = u.id::text);
