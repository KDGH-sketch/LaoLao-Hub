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
    'places','festivals','offers','resources',          -- the public welcome page (docs/WELCOME.md)
    'bundles','progress','reviews','bookmarks','notes','activity',
    'usage','accessLogs','orders','payments',
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

-- --------------------------------------------------------
-- Payments: plan → order (price snapshot) → verified payment → access (see docs/PAYMENTS.md)
-- Orders and payments are written only by these functions. The ones that mark money as received
-- (ll_activate_order, ll_refund_order, ll_fail_order, ll_order_checkout) run only with the service key,
-- i.e. from the payments Edge Function after it has verified the provider's signed message.
-- js/shared/billing.js mirrors ll_plan_price / ll_cycle_end / ll_quote / ll_activate_order for demo mode; keep them identical.
-- --------------------------------------------------------

-- Price of a plan for a billing cycle (month / year) in a currency (LAK / USD); null = not sold that way
create or replace function public.ll_plan_price(p jsonb, cycle text, cur text) returns numeric
language plpgsql immutable as $$
declare v numeric;
begin
  if p is null then return null; end if;
  if jsonb_typeof(p -> 'prices') = 'object' then
    v := public.ll_num(p -> 'prices' -> cycle -> upper(cur));
  elsif upper(coalesce(p ->> 'currency', '')) = upper(cur) and coalesce(p ->> 'billingPeriod', '') = cycle then
    v := public.ll_num(p -> 'price');                    -- plans saved before per-cycle prices existed
  end if;
  return case when v > 0 then v end;
end $$;

-- End of a billing period that starts at from_ms: one calendar month or year later (UTC; 31 Jan + 1 month = 28/29 Feb)
create or replace function public.ll_cycle_end(from_ms numeric, cycle text) returns numeric
language sql immutable as $$
  select round(extract(epoch from (((to_timestamp(from_ms / 1000.0) at time zone 'UTC')
    + case when cycle = 'year' then interval '1 year' else interval '1 month' end) at time zone 'UTC')) * 1000)
$$;

-- Which currency a payment method charges in (Settings → Payments); cards default to USD, QR to LAK
create or replace function public.ll_method_currency(s jsonb, method text) returns text
language sql immutable as $$
  select upper(coalesce(nullif(s -> 'payments' -> 'currency' ->> method, ''), case when method in ('onepay', 'laoqr') then 'LAK' else 'USD' end))
$$;

-- What buying a plan would do for this account: price, new / renew / upgrade, credited days, new end date.
-- Internal (takes the uid): learners use ll_my_quote().
create or replace function public.ll_quote(p_uid text, p_plan text, p_cycle text, p_currency text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  now_ms numeric := round(extract(epoch from now()) * 1000);
  p jsonb; cur_p jsonb; u jsonb; a jsonb; def_id text; st text := 'none'; exp numeric;
  amount numeric; new_tier int; cur_tier int := 0; cur_active boolean := false; kind text := 'new';
  credit int := 0; old_cycle text; old_price numeric; ends numeric; cur text := upper(coalesce(p_currency, ''));
begin
  if p_cycle is null or p_cycle not in ('month', 'year') then return '{"ok":false,"reason":"bad_cycle"}'::jsonb; end if;
  if cur not in ('LAK', 'USD') then return '{"ok":false,"reason":"bad_currency"}'::jsonb; end if;
  select x.data || jsonb_build_object('id', x.id) into p from public.plans x where x.id = p_plan;
  if p is null or coalesce(p ->> 'active', 'true') = 'false' then return '{"ok":false,"reason":"plan_unavailable"}'::jsonb; end if;
  amount := public.ll_plan_price(p, p_cycle, cur);
  if amount is null then return '{"ok":false,"reason":"not_for_sale"}'::jsonb; end if;
  if exists (select 1 from public.admins where id = p_uid) then return '{"ok":false,"reason":"admin_account"}'::jsonb; end if;
  select data into u from public.users where id = p_uid;
  if u is null then return '{"ok":false,"reason":"no_profile"}'::jsonb; end if;
  if coalesce(u ->> 'status', 'active') <> 'active' then return '{"ok":false,"reason":"account_disabled"}'::jsonb; end if;
  select coalesce(nullif(data ->> 'defaultPlanId', ''), 'free') into def_id from public.settings where id = 'app';
  def_id := coalesce(def_id, 'free');
  new_tier := greatest(1, coalesce(floor(public.ll_num(p -> 'tier'))::int, 1));
  select data into a from public.access where id = p_uid;
  if a is not null then
    st := coalesce(a ->> 'status', 'none'); exp := public.ll_ms(a -> 'expiresAt');
    if st = 'suspended' then return '{"ok":false,"reason":"account_suspended"}'::jsonb; end if;
    if st in ('active', 'trial') and coalesce(a ->> 'planId', def_id) <> def_id and (exp is null or exp > now_ms) then
      cur_active := true;
      select x.data || jsonb_build_object('id', x.id) into cur_p from public.plans x where x.id = a ->> 'planId';
      cur_tier := greatest(1, coalesce(floor(public.ll_num(coalesce(cur_p -> 'tier', a -> 'tier')))::int, 1));
    end if;
  end if;
  if cur_active then
    if a ->> 'planId' = p_plan then
      if st = 'trial' then kind := 'new';
      elsif exp is null then return '{"ok":false,"reason":"already_unlimited"}'::jsonb;
      else kind := 'renew'; end if;
    elsif new_tier > cur_tier then kind := 'upgrade';
    else
      return jsonb_build_object('ok', false, 'reason', 'downgrade_at_period_end', 'currentPlan', a ->> 'planId', 'until', exp);
    end if;
  end if;
  if kind = 'renew' then
    ends := public.ll_cycle_end(greatest(exp, now_ms), p_cycle);
  else
    -- Upgrade policy "immediate, days credited": the unused value of a paid period becomes extra days on the new plan
    if kind = 'upgrade' and st = 'active' and coalesce(a ->> 'source', '') = 'payment' and exp is not null then
      old_cycle := coalesce(nullif(a ->> 'billingCycle', ''), 'month');
      select public.ll_num(o.data -> 'amount') into old_price from public.orders o
        where o.id = a ->> 'orderId' and upper(o.data ->> 'currency') = cur and o.data ->> 'cycle' = old_cycle;
      old_price := coalesce(old_price, public.ll_plan_price(cur_p, old_cycle, cur));
      if old_price is not null then
        credit := floor(((exp - now_ms) / 86400000.0) * (old_price / case when old_cycle = 'year' then 365 else 30 end)
                        / (amount / case when p_cycle = 'year' then 365 else 30 end));
        credit := least(greatest(credit, 0), floor((exp - now_ms) / 86400000.0)::int);
      end if;
    end if;
    ends := public.ll_cycle_end(now_ms, p_cycle) + credit * 86400000;
  end if;
  return jsonb_build_object('ok', true, 'planId', p_plan, 'planName', coalesce(p -> 'name', to_jsonb(p_plan)), 'tier', new_tier,
    'cycle', p_cycle, 'currency', cur, 'amount', amount, 'kind', kind, 'fromPlan', case when cur_active then a ->> 'planId' end,
    'creditDays', credit, 'endsAt', ends);
end $$;

create or replace function public.ll_my_quote(p_plan text, p_cycle text, p_method text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s jsonb;
begin
  if auth.uid() is null then return '{"ok":false,"reason":"not_signed_in"}'::jsonb; end if;
  select data into s from public.settings where id = 'app';
  return public.ll_quote(auth.uid()::text, p_plan, p_cycle, public.ll_method_currency(coalesce(s, '{}'::jsonb), p_method))
         || jsonb_build_object('method', p_method);
end $$;

-- Start a purchase. The browser sends only plan, cycle, method and where to return; the price, currency and
-- account come from the database. Repeated clicks reuse the open order with the same terms.
create or replace function public.ll_create_order(p_plan text, p_cycle text, p_method text, p_return text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text; now_ms numeric := round(extract(epoch from now()) * 1000);
  s jsonb; q jsonb; cur text; ex record; n int; o_id text; ret text; d jsonb;
begin
  if v_uid is null then return '{"ok":false,"reason":"not_signed_in"}'::jsonb; end if;
  perform pg_advisory_xact_lock(hashtext('ll_order:' || v_uid));     -- one order creation at a time per account
  select data into s from public.settings where id = 'app';
  s := coalesce(s, '{}'::jsonb);
  if coalesce(s -> 'payments' ->> 'enabled', 'false') <> 'true' then return '{"ok":false,"reason":"payments_disabled"}'::jsonb; end if;
  if jsonb_typeof(s -> 'payments' -> 'methods') <> 'array' or not (s -> 'payments' -> 'methods' ? p_method) then
    return '{"ok":false,"reason":"method_unavailable"}'::jsonb;
  end if;
  cur := public.ll_method_currency(s, p_method);
  q := public.ll_quote(v_uid, p_plan, p_cycle, cur);
  if not (q ->> 'ok')::boolean then return q; end if;
  -- checkouts left open for an hour expire (a payment that still arrives later is honoured by ll_activate_order)
  update public.orders set data = data || jsonb_build_object('status', 'expired',
      'history', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now_ms, 'status', 'expired'))), updated_at = now()
    where data ->> 'uid' = v_uid and data ->> 'status' in ('created', 'pending') and public.ll_num(data -> 'createdAt') < now_ms - 3600000;
  select o.id, o.data into ex from public.orders o
    where o.data ->> 'uid' = v_uid and o.data ->> 'status' in ('created', 'pending') and o.data ->> 'planId' = p_plan
      and o.data ->> 'cycle' = p_cycle and o.data ->> 'method' = p_method and o.data ->> 'currency' = cur
      and public.ll_num(o.data -> 'amount') = (q ->> 'amount')::numeric and o.data ->> 'kind' = q ->> 'kind'
    order by o.created_at desc limit 1;
  if found then return ex.data || jsonb_build_object('id', ex.id, 'ok', true, 'reused', true); end if;
  select count(*) into n from public.orders where data ->> 'uid' = v_uid and created_at > now() - interval '1 hour';
  if n >= 20 then return '{"ok":false,"reason":"too_many_orders"}'::jsonb; end if;
  -- where to go after paying: an app view name with simple parameters only, never a URL
  ret := case when p_return ~ '^[A-Za-z_]{1,30}(\?[A-Za-z0-9_=&.-]{0,160})?$' then p_return end;
  o_id := 'LLH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  d := jsonb_build_object('uid', v_uid, 'planId', p_plan, 'planName', q -> 'planName', 'tier', q -> 'tier', 'cycle', p_cycle,
    'method', p_method, 'currency', cur, 'amount', q -> 'amount', 'kind', q -> 'kind', 'fromPlan', q -> 'fromPlan',
    'creditDays', q -> 'creditDays', 'endsAt', q -> 'endsAt', 'status', 'created', 'returnTo', ret, 'createdAt', now_ms,
    'history', jsonb_build_array(jsonb_build_object('at', now_ms, 'status', 'created')));
  insert into public.orders (id, data) values (o_id, d);
  return d || jsonb_build_object('id', o_id, 'ok', true);
end $$;

-- The checkout page was opened at the provider (service key)
create or replace function public.ll_order_checkout(p_order text, p_provider text, p_ref jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare now_ms numeric := round(extract(epoch from now()) * 1000); d jsonb;
begin
  update public.orders set data = data || jsonb_build_object('status', 'pending', 'provider', p_provider, 'checkoutRef', p_ref,
      'history', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now_ms, 'status', 'pending', 'provider', p_provider))),
      updated_at = now()
    where id = p_order and data ->> 'status' in ('created', 'pending')
    returning data into d;
  return case when d is null then '{"ok":false,"reason":"order_not_open"}'::jsonb else d || jsonb_build_object('id', p_order, 'ok', true) end;
end $$;

-- A verified payment (service key, after the provider's signed message was checked):
-- checks the amount and currency against the order's snapshot, records the payment once, and extends the account.
-- Calling it again with the same transaction does nothing (providers repeat callbacks).
create or replace function public.ll_activate_order(p_order text, p_pay jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  now_ms numeric := round(extract(epoch from now()) * 1000);
  o jsonb; a jsonb; p jsonb; prev jsonb; pid text; v_uid text; kind text; st text; exp numeric;
  ends numeric; start_ms numeric; credit int := 0; bad text; pay jsonb;
begin
  if coalesce(p_pay ->> 'provider', '') = '' or coalesce(p_pay ->> 'txnId', '') = '' then
    return '{"ok":false,"reason":"missing_transaction"}'::jsonb;
  end if;
  pid := lower(p_pay ->> 'provider') || '__' || (p_pay ->> 'txnId');
  select data into o from public.orders where id = p_order for update;
  if o is null then return '{"ok":false,"reason":"order_not_found"}'::jsonb; end if;
  select data into prev from public.payments where id = pid;
  if prev is not null then
    return jsonb_build_object('ok', prev ->> 'orderId' = p_order and prev ->> 'status' = 'paid', 'already', true,
      'reason', case when prev ->> 'orderId' = p_order then 'already_processed' else 'transaction_reused' end);
  end if;
  v_uid := o ->> 'uid';
  -- only what the provider reported, never card numbers: brand and the last 4 digits at most
  pay := jsonb_build_object('orderId', p_order, 'uid', v_uid, 'provider', lower(p_pay ->> 'provider'), 'txnId', p_pay ->> 'txnId',
    'method', left(coalesce(p_pay ->> 'method', o ->> 'method'), 20), 'brand', left(coalesce(p_pay ->> 'brand', ''), 24),
    'last4', right(regexp_replace(coalesce(p_pay ->> 'last4', ''), '\D', '', 'g'), 4),
    'amount', public.ll_num(p_pay -> 'amount'), 'currency', upper(coalesce(p_pay ->> 'currency', '')),
    'paidAt', coalesce(public.ll_ms(p_pay -> 'paidAt'), now_ms), 'verification', coalesce(p_pay -> 'verification', '{}'::jsonb), 'at', now_ms);
  bad := case
    when o ->> 'status' in ('paid', 'refunded') then 'order_already_paid'
    when public.ll_num(p_pay -> 'amount') is distinct from public.ll_num(o -> 'amount') then 'amount_mismatch'
    when upper(coalesce(p_pay ->> 'currency', '')) <> upper(o ->> 'currency') then 'currency_mismatch'
  end;
  if bad is not null then
    -- money may have moved but must not unlock anything: keep it for an admin to review (and refund)
    insert into public.payments (id, data) values (pid, pay || jsonb_build_object('status', case when bad = 'order_already_paid' then 'duplicate' else 'mismatch' end, 'reason', bad));
    update public.orders set data = data || jsonb_build_object('needsReview', true,
        'history', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now_ms, 'status', o ->> 'status', 'note', bad, 'payment', pid))),
        updated_at = now() where id = p_order;
    return jsonb_build_object('ok', false, 'reason', bad);
  end if;

  perform 1 from public.access where id = v_uid for update;
  select data into a from public.access where id = v_uid;
  select x.data || jsonb_build_object('id', x.id) into p from public.plans x where x.id = o ->> 'planId';
  kind := o ->> 'kind'; st := coalesce(a ->> 'status', 'none'); exp := public.ll_ms(a -> 'expiresAt');
  if kind = 'renew' and a ->> 'planId' = o ->> 'planId' and st = 'active' and exp > now_ms then
    start_ms := coalesce(public.ll_ms(a -> 'start'), now_ms);
    ends := public.ll_cycle_end(exp, o ->> 'cycle');
  else
    if kind = 'renew' then kind := 'new'; end if;           -- the plan ended before the payment arrived: a fresh period
    if kind = 'upgrade' and a ->> 'planId' = o ->> 'fromPlan' and st = 'active' and exp > now_ms then
      credit := coalesce(public.ll_num(o -> 'creditDays'), 0)::int;
    end if;
    start_ms := now_ms;
    ends := public.ll_cycle_end(now_ms, o ->> 'cycle') + credit * 86400000;
  end if;
  insert into public.access (id, data) values (v_uid, '{}'::jsonb) on conflict (id) do nothing;
  update public.access set data = data || jsonb_build_object('planId', o ->> 'planId', 'tier', coalesce(p -> 'tier', o -> 'tier', '1'::jsonb),
      'status', 'active', 'start', start_ms, 'expiresAt', ends, 'billingCycle', o ->> 'cycle', 'source', 'payment', 'orderId', p_order,
      'cancelAtPeriodEnd', false, 'scheduledPlanId', null, 'updatedAt', now_ms, 'updatedBy', 'payment'), updated_at = now()
    where id = v_uid;
  insert into public.payments (id, data) values (pid, pay || '{"status":"paid"}'::jsonb);
  insert into public.subscriptions (id, data) values (v_uid || '-' || now_ms::bigint || '-' || p_order,
    jsonb_build_object('uid', v_uid, 'planId', o ->> 'planId', 'fromPlan', a ->> 'planId', 'action', kind, 'start', start_ms, 'expiresAt', ends,
      'status', 'active', 'source', 'payment', 'orderId', p_order, 'amount', o -> 'amount', 'currency', o -> 'currency', 'creditDays', credit,
      'by', 'payment', 'at', now_ms))
    on conflict (id) do nothing;
  update public.orders set data = data || jsonb_build_object('status', 'paid', 'paidAt', pay -> 'paidAt', 'paymentId', pid, 'activatedUntil', ends,
      'history', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now_ms, 'status', 'paid', 'payment', pid))),
      updated_at = now() where id = p_order;
  return jsonb_build_object('ok', true, 'planId', o ->> 'planId', 'expiresAt', ends, 'kind', kind);
end $$;

-- Payment declined / cancelled at checkout / expired (service key). A paid order is never changed here.
create or replace function public.ll_fail_order(p_order text, p_status text, p_info jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare now_ms numeric := round(extract(epoch from now()) * 1000); d jsonb;
begin
  if p_status not in ('failed', 'cancelled', 'expired') then return '{"ok":false,"reason":"bad_status"}'::jsonb; end if;
  update public.orders set data = data || jsonb_build_object('status', p_status, 'failReason', left(coalesce(p_info ->> 'reason', ''), 60),
      'history', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now_ms, 'status', p_status, 'note', left(coalesce(p_info ->> 'reason', ''), 60)))),
      updated_at = now()
    where id = p_order and data ->> 'status' in ('created', 'pending')
    returning data into d;
  return case when d is null then '{"ok":false,"reason":"order_not_open"}'::jsonb else d || jsonb_build_object('id', p_order, 'ok', true) end;
end $$;

-- The learner closes a checkout they did not finish
create or replace function public.ll_cancel_my_order(p_order text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.orders where id = p_order and data ->> 'uid' = auth.uid()::text) then
    return '{"ok":false,"reason":"order_not_found"}'::jsonb;
  end if;
  return public.ll_fail_order(p_order, 'cancelled', '{"reason":"learner_cancelled"}'::jsonb);
end $$;

-- Refund confirmed by the provider (service key). Policy: the plan bought with this order ends now.
create or replace function public.ll_refund_order(p_order text, p_info jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare now_ms numeric := round(extract(epoch from now()) * 1000); o jsonb; a jsonb; v_uid text; ended boolean := false;
begin
  select data into o from public.orders where id = p_order for update;
  if o is null then return '{"ok":false,"reason":"order_not_found"}'::jsonb; end if;
  if o ->> 'status' = 'refunded' then return '{"ok":true,"already":true}'::jsonb; end if;
  if o ->> 'status' <> 'paid' then return '{"ok":false,"reason":"order_not_paid"}'::jsonb; end if;
  v_uid := o ->> 'uid';
  update public.payments set data = data || jsonb_build_object('status', 'refunded', 'refundedAt', now_ms), updated_at = now()
    where data ->> 'orderId' = p_order and data ->> 'status' = 'paid';
  select data into a from public.access where id = v_uid for update;
  if a ->> 'orderId' = p_order then
    update public.access set data = data || jsonb_build_object('expiresAt', now_ms, 'cancelAtPeriodEnd', false, 'scheduledPlanId', null,
        'updatedAt', now_ms, 'updatedBy', 'refund'), updated_at = now() where id = v_uid;
    ended := true;
  end if;
  update public.orders set data = data || jsonb_build_object('status', 'refunded', 'refundedAt', now_ms,
      'refundRef', left(coalesce(p_info ->> 'ref', ''), 80), 'refundReason', left(coalesce(p_info ->> 'reason', ''), 300), 'refundedBy', p_info ->> 'by',
      'history', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now_ms, 'status', 'refunded', 'by', p_info ->> 'by'))),
      updated_at = now() where id = p_order;
  insert into public.subscriptions (id, data) values (v_uid || '-' || now_ms::bigint || '-refund',
    jsonb_build_object('uid', v_uid, 'planId', o ->> 'planId', 'action', 'refund', 'status', case when ended then 'ended' else 'unchanged' end,
      'source', 'payment', 'orderId', p_order, 'reason', left(coalesce(p_info ->> 'reason', ''), 300), 'by', coalesce(p_info ->> 'by', 'refund'), 'at', now_ms))
    on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'accessEnded', ended);
end $$;

-- Learner: cancel at period end (the plan stays until it ends and is not renewed), or undo that
create or replace function public.ll_set_cancel(p_cancel boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; now_ms numeric := round(extract(epoch from now()) * 1000); a jsonb;
begin
  select data into a from public.access where id = v_uid for update;
  if a is null or a ->> 'status' <> 'active' or coalesce(a ->> 'source', '') <> 'payment' or coalesce(public.ll_ms(a -> 'expiresAt'), 0) <= now_ms then
    return '{"ok":false,"reason":"no_paid_plan"}'::jsonb;
  end if;
  update public.access set data = data || jsonb_build_object('cancelAtPeriodEnd', coalesce(p_cancel, false), 'updatedAt', now_ms, 'updatedBy', v_uid), updated_at = now() where id = v_uid;
  insert into public.subscriptions (id, data) values (v_uid || '-' || now_ms::bigint || '-cancel',
    jsonb_build_object('uid', v_uid, 'planId', a ->> 'planId', 'action', case when p_cancel then 'cancel_at_period_end' else 'reactivate' end,
      'expiresAt', a -> 'expiresAt', 'status', 'active', 'source', 'learner', 'by', v_uid, 'at', now_ms))
    on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'cancelAtPeriodEnd', coalesce(p_cancel, false));
end $$;

-- Learner: switch to a lower plan when the current paid period ends (null = keep the current plan)
create or replace function public.ll_schedule_plan(p_plan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; now_ms numeric := round(extract(epoch from now()) * 1000); a jsonb; p jsonb; cur_tier int; exp numeric;
begin
  select data into a from public.access where id = v_uid for update;
  exp := public.ll_ms(a -> 'expiresAt');
  if a is null or a ->> 'status' <> 'active' or coalesce(a ->> 'source', '') <> 'payment' or coalesce(exp, 0) <= now_ms then
    return '{"ok":false,"reason":"no_paid_plan"}'::jsonb;
  end if;
  if p_plan is not null then
    select x.data into p from public.plans x where x.id = p_plan;
    select coalesce(floor(public.ll_num(x.data -> 'tier'))::int, 1) into cur_tier from public.plans x where x.id = a ->> 'planId';
    if p is null or coalesce(p ->> 'active', 'true') = 'false' or coalesce(floor(public.ll_num(p -> 'tier'))::int, 1) >= coalesce(cur_tier, 1) then
      return '{"ok":false,"reason":"not_a_downgrade"}'::jsonb;
    end if;
  end if;
  update public.access set data = data || jsonb_build_object('scheduledPlanId', p_plan, 'scheduledFrom', case when p_plan is null then null else exp end,
      'updatedAt', now_ms, 'updatedBy', v_uid), updated_at = now() where id = v_uid;
  insert into public.subscriptions (id, data) values (v_uid || '-' || now_ms::bigint || '-schedule',
    jsonb_build_object('uid', v_uid, 'planId', a ->> 'planId', 'fromPlan', a ->> 'planId', 'nextPlan', p_plan,
      'action', case when p_plan is null then 'schedule_cleared' else 'schedule_downgrade' end, 'expiresAt', exp, 'status', 'active',
      'source', 'learner', 'by', v_uid, 'at', now_ms))
    on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'scheduledPlanId', p_plan, 'from', exp);
end $$;

revoke all on function public.ll_quote(text, text, text, text) from public, anon, authenticated;
revoke all on function public.ll_order_checkout(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ll_activate_order(text, jsonb) from public, anon, authenticated;
revoke all on function public.ll_fail_order(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ll_refund_order(text, jsonb) from public, anon, authenticated;
grant execute on function public.ll_quote(text, text, text, text) to service_role;
grant execute on function public.ll_order_checkout(text, text, jsonb) to service_role;
grant execute on function public.ll_activate_order(text, jsonb) to service_role;
grant execute on function public.ll_fail_order(text, text, jsonb) to service_role;
grant execute on function public.ll_refund_order(text, jsonb) to service_role;
revoke all on function public.ll_my_quote(text, text, text) from public, anon;
revoke all on function public.ll_create_order(text, text, text, text) from public, anon;
revoke all on function public.ll_cancel_my_order(text) from public, anon;
revoke all on function public.ll_set_cancel(boolean) from public, anon;
revoke all on function public.ll_schedule_plan(text) from public, anon;
grant execute on function public.ll_my_quote(text, text, text) to authenticated;
grant execute on function public.ll_create_order(text, text, text, text) to authenticated;
grant execute on function public.ll_cancel_my_order(text) to authenticated;
grant execute on function public.ll_set_cancel(boolean) to authenticated;
grant execute on function public.ll_schedule_plan(text) to authenticated;

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
             'videos','tones','culture','characters','dictionary','places','festivals','offers','resources',
             'bundles','progress','reviews','bookmarks','notes','activity','usage','accessLogs','orders','payments','vocab','saved'])
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- --------------------------------------------------------
-- 4. Policies
-- --------------------------------------------------------

-- Content: admins read, editors write (per menu). Learners never read these; they read bundles.
do $$
declare t text; m text;
begin
  foreach t in array array['lessons','patterns','grammar','vocabulary','dialogues','quizzes','audio','paths','releases','lexicon',
                           'videos','tones','culture','characters','dictionary','places','festivals','offers','resources'] loop
    m := case t when 'offers' then 'promotions' else t end;      -- admin menu id that grants editing
    execute format('create policy "ll admin read" on public.%I for select using (public.ll_is_admin())', t);
    execute format('create policy "ll edit insert" on public.%I for insert with check (public.ll_can_edit(%L))', t, m);
    execute format('create policy "ll edit update" on public.%I for update using (public.ll_can_edit(%L)) with check (public.ll_can_edit(%L))', t, m, m);
    execute format('create policy "ll edit delete" on public.%I for delete using (public.ll_can_edit(%L))', t, m);
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

-- Settings: public read (app name, registration, the published welcome page), except the welcome-page draft (admins only);
-- Super Admin writes; editors may update the publish state; editors of the "welcome" menu write the welcome page
create policy "ll public read" on public.settings for select using (id <> 'welcomeDraft' or public.ll_is_admin());
create policy "ll write insert" on public.settings for insert
  with check (public.ll_is_super() or (id = 'bundle' and public.ll_can_publish())
              or (id in ('welcome', 'welcomeDraft') and public.ll_can_edit('welcome')));
create policy "ll write update" on public.settings for update
  using (public.ll_is_super() or (id = 'bundle' and public.ll_can_publish()) or (id in ('welcome', 'welcomeDraft') and public.ll_can_edit('welcome')))
  with check (public.ll_is_super() or (id = 'bundle' and public.ll_can_publish()) or (id in ('welcome', 'welcomeDraft') and public.ll_can_edit('welcome')));
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

-- Orders and payments: the learner reads their own, support reads all. Nobody writes them directly:
-- only the payment functions above do (no insert / update / delete policy, so not even admins can mark an order paid by hand).
create policy "ll own or support read" on public.orders for select using (data ->> 'uid' = auth.uid()::text or public.ll_can_support());
create policy "ll own or support read" on public.payments for select using (data ->> 'uid' = auth.uid()::text or public.ll_can_support());

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
                     'videos','tones','culture','characters','dictionary','places','festivals','offers','resources',
                     'bundles','progress','reviews','bookmarks','notes','activity') then
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

-- self-test of the payment helpers (calendar periods and prices)
do $$
begin
  if public.ll_cycle_end(extract(epoch from timestamptz '2026-01-31 10:00:00+00') * 1000, 'month') <> extract(epoch from timestamptz '2026-02-28 10:00:00+00') * 1000
     or public.ll_cycle_end(extract(epoch from timestamptz '2028-02-29 00:00:00+00') * 1000, 'year') <> extract(epoch from timestamptz '2029-02-28 00:00:00+00') * 1000 then
    raise exception 'payments self-test: ll_cycle_end';
  end if;
  if public.ll_plan_price('{"prices":{"month":{"LAK":90000,"USD":0}}}', 'month', 'lak') <> 90000
     or public.ll_plan_price('{"prices":{"month":{"LAK":90000,"USD":0}}}', 'month', 'USD') is not null
     or public.ll_plan_price('{"price":5,"currency":"USD","billingPeriod":"year"}', 'year', 'USD') <> 5 then
    raise exception 'payments self-test: ll_plan_price';
  end if;
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
