-- ========================================================
--  LaoLao: pay by bank transfer (BCEL One QR) with a slip that an admin approves (docs/PAYMENTS.md → Bank transfer).
--  Run in the Supabase SQL Editor after supabase-schema.sql. Safe to run again. Additive: one table ("slips"), its
--  policy, and the order functions below; changes no rows.
--  Then: Admin → Payments → Settings → Bank transfer (QR, account, instructions) and switch it on.
-- ========================================================
begin;

-- 1. Slips: the transfer slip a learner uploads for an order (id = order id). Private: the learner and support /
--    admin / super admin read it; nobody writes it directly (only ll_submit_slip).
create table if not exists public.slips (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.slips enable row level security;
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'slips' loop
    execute format('drop policy %I on public.slips', r.policyname);
  end loop;
end $$;
create policy "ll own or support read" on public.slips for select using (data ->> 'uid' = auth.uid()::text or public.ll_can_support());

-- @@TRANSFER-FUNCTIONS@@
-- 2. A transfer is charged in LAK unless Settings say otherwise (like the QR methods)
create or replace function public.ll_method_currency(s jsonb, method text) returns text
language sql immutable as $$
  select upper(coalesce(nullif(s -> 'payments' -> 'currency' ->> method, ''), case when method in ('onepay', 'laoqr', 'transfer') then 'LAK' else 'USD' end))
$$;

-- 3. Orders: "transfer" is offered when Settings → Payments → Bank transfer is on, even without an online provider.
--    A transfer order waits for its slip for 3 days (cards: 1 hour); one under review or rejected is reused.
create or replace function public.ll_create_order(p_plan text, p_cycle text, p_method text, p_return text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text; now_ms numeric := round(extract(epoch from now()) * 1000);
  s jsonb; q jsonb; cur text; ex record; n int; o_id text; ret text; d jsonb; open_st text[];
begin
  if v_uid is null then return '{"ok":false,"reason":"not_signed_in"}'::jsonb; end if;
  perform pg_advisory_xact_lock(hashtext('ll_order:' || v_uid));     -- one order creation at a time per account
  select data into s from public.settings where id = 'app';
  s := coalesce(s, '{}'::jsonb);
  if p_method = 'transfer' then
    if coalesce(s -> 'payments' -> 'transfer' ->> 'enabled', 'false') <> 'true' then return '{"ok":false,"reason":"method_unavailable"}'::jsonb; end if;
  else
    if coalesce(s -> 'payments' ->> 'enabled', 'false') <> 'true' then return '{"ok":false,"reason":"payments_disabled"}'::jsonb; end if;
    if jsonb_typeof(s -> 'payments' -> 'methods') <> 'array' or not (s -> 'payments' -> 'methods' ? p_method) then
      return '{"ok":false,"reason":"method_unavailable"}'::jsonb;
    end if;
  end if;
  cur := public.ll_method_currency(s, p_method);
  q := public.ll_quote(v_uid, p_plan, p_cycle, cur);
  if not (q ->> 'ok')::boolean then return q; end if;
  -- checkouts left open for an hour expire (a payment that still arrives later is honoured by ll_activate_order);
  -- a transfer with no slip after 3 days too. A transfer under review never expires.
  update public.orders set data = data || jsonb_build_object('status', 'expired',
      'history', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now_ms, 'status', 'expired'))), updated_at = now()
    where data ->> 'uid' = v_uid and (
      (data ->> 'status' in ('created', 'pending') and coalesce(data ->> 'method', '') <> 'transfer' and public.ll_num(data -> 'createdAt') < now_ms - 3600000)
      or (data ->> 'status' = 'created' and data ->> 'method' = 'transfer' and public.ll_num(data -> 'createdAt') < now_ms - 259200000));
  open_st := case when p_method = 'transfer' then array['created', 'review', 'rejected'] else array['created', 'pending'] end;
  select o.id, o.data into ex from public.orders o
    where o.data ->> 'uid' = v_uid and o.data ->> 'status' = any(open_st) and o.data ->> 'planId' = p_plan
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

-- 4. The learner uploads the slip of a transfer order (a photo or screenshot, sent as a small data: image).
--    The order goes to "review"; a new slip replaces the old one. The same image on another order is flagged.
create or replace function public.ll_submit_slip(p_order text, p_slip jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text; now_ms numeric := round(extract(epoch from now()) * 1000);
  o jsonb; img text; hsh text; dup text; n int; d jsonb;
begin
  if v_uid is null then return '{"ok":false,"reason":"not_signed_in"}'::jsonb; end if;
  select data into o from public.orders where id = p_order for update;
  if o is null or o ->> 'uid' <> v_uid then return '{"ok":false,"reason":"order_not_found"}'::jsonb; end if;
  if coalesce(o ->> 'method', '') <> 'transfer' then return '{"ok":false,"reason":"not_a_transfer"}'::jsonb; end if;
  if o ->> 'status' not in ('created', 'review', 'rejected') then return '{"ok":false,"reason":"order_not_open"}'::jsonb; end if;
  img := p_slip ->> 'image';
  if img is null or length(img) > 3000000 or img !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' then
    return '{"ok":false,"reason":"slip_invalid"}'::jsonb;
  end if;
  select coalesce(public.ll_num(data -> 'count'), 0)::int into n from public.slips where id = p_order;
  if coalesce(n, 0) >= 10 then return '{"ok":false,"reason":"too_many_slips"}'::jsonb; end if;
  hsh := md5(img);
  select s.id into dup from public.slips s where s.data ->> 'hash' = hsh and s.id <> p_order limit 1;
  insert into public.slips (id, data) values (p_order, jsonb_build_object('uid', v_uid, 'orderId', p_order, 'image', img, 'hash', hsh,
      'ref', left(regexp_replace(coalesce(p_slip ->> 'ref', ''), '[^A-Za-z0-9 _./-]', '', 'g'), 60),
      'paidAt', public.ll_ms(p_slip -> 'paidAt'), 'note', left(coalesce(p_slip ->> 'note', ''), 300), 'at', now_ms,
      'count', coalesce(n, 0) + 1, 'dupOf', dup))
    on conflict (id) do update set data = excluded.data, updated_at = now();
  update public.orders set data = (data - 'rejectReason') || jsonb_build_object('status', 'review', 'slipAt', now_ms,
      'slipRef', left(regexp_replace(coalesce(p_slip ->> 'ref', ''), '[^A-Za-z0-9 _./-]', '', 'g'), 60), 'slipDupOf', dup,
      'history', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now_ms, 'status', 'review', 'note', 'slip'))),
      updated_at = now()
    where id = p_order returning data into d;
  return d || jsonb_build_object('id', p_order, 'ok', true);
end $$;

-- 5. Support / admin / super admin approve or reject a slip. Approving goes through ll_activate_order like a verified
--    card payment (the bank reference is the transaction id, so one transfer cannot pay two orders; the amount must
--    match the order). Rejecting asks the learner for a new slip.
create or replace function public.ll_review_slip(p_order text, p_approve boolean, p_info jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text; now_ms numeric := round(extract(epoch from now()) * 1000);
  o jsonb; sl jsonb; r jsonb; txn text; amt numeric;
begin
  if not public.ll_can_support() then return '{"ok":false,"reason":"forbidden"}'::jsonb; end if;
  select data into o from public.orders where id = p_order for update;
  if o is null then return '{"ok":false,"reason":"order_not_found"}'::jsonb; end if;
  if coalesce(o ->> 'method', '') <> 'transfer' then return '{"ok":false,"reason":"not_a_transfer"}'::jsonb; end if;
  if o ->> 'status' <> 'review' then return '{"ok":false,"reason":"order_not_in_review"}'::jsonb; end if;
  select data into sl from public.slips where id = p_order;
  if coalesce(p_approve, false) then
    txn := regexp_replace(coalesce(nullif(trim(p_info ->> 'ref'), ''), nullif(sl ->> 'ref', ''), p_order), '[^A-Za-z0-9_.-]', '', 'g');
    if coalesce(txn, '') = '' then txn := p_order; end if;
    amt := coalesce(public.ll_num(p_info -> 'amount'), public.ll_num(o -> 'amount'));
    r := public.ll_activate_order(p_order, jsonb_build_object('provider', 'transfer', 'txnId', left(txn, 60), 'amount', amt, 'currency', o ->> 'currency',
      'method', 'transfer', 'paidAt', coalesce(sl -> 'paidAt', to_jsonb(now_ms)),
      'verification', jsonb_build_object('approvedBy', v_uid, 'approvedAt', now_ms, 'slipHash', sl ->> 'hash', 'note', left(coalesce(p_info ->> 'note', ''), 300))));
    if coalesce((r ->> 'ok')::boolean, false) then
      update public.orders set data = data || jsonb_build_object('approvedBy', v_uid, 'approvedAt', now_ms), updated_at = now() where id = p_order;
    end if;
    return r;
  end if;
  update public.orders set data = data || jsonb_build_object('status', 'rejected', 'rejectReason', left(coalesce(p_info ->> 'reason', ''), 300),
      'rejectedBy', v_uid, 'rejectedAt', now_ms,
      'history', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now_ms, 'status', 'rejected', 'by', v_uid,
        'note', left(coalesce(p_info ->> 'reason', ''), 120)))),
      updated_at = now() where id = p_order;
  return jsonb_build_object('ok', true, 'status', 'rejected');
end $$;
revoke all on function public.ll_submit_slip(text, jsonb) from public, anon;
revoke all on function public.ll_review_slip(text, boolean, jsonb) from public, anon;
grant execute on function public.ll_submit_slip(text, jsonb) to authenticated;
grant execute on function public.ll_review_slip(text, boolean, jsonb) to authenticated;
-- @@END-TRANSFER-FUNCTIONS@@

commit;
