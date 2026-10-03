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
    'users','admins','adminNotes','access','plans','subscriptions','orders','settings',
    'lessons','patterns','grammar','vocabulary','dialogues','quizzes','audio','paths','releases','lexicon',
    'videos','tones','culture','characters','dictionary',
    'bundles','progress','reviews','bookmarks','notes','activity',
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

-- Effective tier (mirrors tierFor() in js/shared/content.js): 0 public, 1 free, 2+ paid, 99 admin
create or replace function public.ll_my_tier() returns int
language plpgsql stable security definer set search_path = public as $$
declare u jsonb; a jsonb; exp_ms numeric;
begin
  if auth.uid() is null then return 0; end if;
  if public.ll_is_admin() then return 99; end if;
  -- no learner profile = not a learner (e.g. an account created directly through the Supabase API while registration is closed)
  select data into u from public.users where id = auth.uid()::text;
  if u is null or coalesce(u ->> 'status', 'active') <> 'active' then return 0; end if;
  select data into a from public.access where id = auth.uid()::text;
  if a is null or coalesce(a ->> 'status', '') <> 'active' then return 1; end if;
  if jsonb_typeof(a -> 'expiresAt') = 'number' then
    exp_ms := (a ->> 'expiresAt')::numeric;
  elsif jsonb_typeof(a -> 'expiresAt') = 'string' then
    exp_ms := extract(epoch from (a ->> 'expiresAt')::timestamptz) * 1000;
  end if;
  if exp_ms is not null and exp_ms <= extract(epoch from now()) * 1000 then return 1; end if;
  return greatest(1, coalesce((a ->> 'tier')::int, 1));
exception when others then
  return 1;
end $$;

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
             'users','admins','adminNotes','access','plans','subscriptions','orders','settings',
             'lessons','patterns','grammar','vocabulary','dialogues','quizzes','audio','paths','releases','lexicon',
             'videos','tones','culture','characters','dictionary',
             'bundles','progress','reviews','bookmarks','notes','activity','vocab','saved'])
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

-- Access: learner reads own; support writes; self-registration may create a free entitlement once
create policy "ll own or admin read" on public.access for select using (id = auth.uid()::text or public.ll_is_admin());
create policy "ll insert" on public.access for insert with check (
  public.ll_can_support()
  or (id = auth.uid()::text and public.ll_registration_open()
      and data ->> 'tier' = '1' and data ->> 'source' = 'registration'
      and not exists (select 1 from public.access x where x.id = auth.uid()::text)));
create policy "ll support update" on public.access for update using (public.ll_can_support()) with check (public.ll_can_support());
create policy "ll support delete" on public.access for delete using (public.ll_can_support());

-- Subscription history
create policy "ll own or admin read" on public.subscriptions for select using (public.ll_is_admin() or data ->> 'uid' = auth.uid()::text);
create policy "ll support insert" on public.subscriptions for insert with check (public.ll_can_support());
create policy "ll support update" on public.subscriptions for update using (public.ll_can_support()) with check (public.ll_can_support());
create policy "ll support delete" on public.subscriptions for delete using (public.ll_can_support());

-- Orders: a learner's own plan-upgrade payment requests (manual QR transfer + proof screenshot).
-- A learner may create and read their own; only support/admin may read all, decide (update) or delete.
create policy "ll own or support read" on public.orders for select
  using (data ->> 'uid' = auth.uid()::text or public.ll_can_support());
create policy "ll own insert" on public.orders for insert
  with check (data ->> 'uid' = auth.uid()::text and coalesce(data ->> 'status', 'pending') = 'pending');
create policy "ll support update" on public.orders for update using (public.ll_can_support()) with check (public.ll_can_support());
create policy "ll support delete" on public.orders for delete using (public.ll_can_support());

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

-- --------------------------------------------------------
-- 6. Storage: public bucket for audio / images, uploads by content admins, plus a narrow carve-out
--    so any signed-in learner can upload their own plan-upgrade payment-proof image (js/learner/
--    payments.js) without needing publish rights -- scoped to their own uid-prefixed filename, so
--    they can't write anywhere else in the bucket or touch another learner's file.
-- --------------------------------------------------------
insert into storage.buckets (id, name, public) values ('laolao-assets', 'laolao-assets', true)
  on conflict (id) do update set public = true;

drop policy if exists "ll assets insert" on storage.objects;
drop policy if exists "ll assets update" on storage.objects;
drop policy if exists "ll assets delete" on storage.objects;
create policy "ll assets insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'laolao-assets' and (
    public.ll_can_publish()
    or name like 'payment-proof/' || auth.uid()::text || '-%'
  ));
-- Mirrors the insert policy's carve-out (defense in depth): an "insert ... on conflict do update"
-- -- which is what upsert:true produces -- is checked against BOTH the insert and the update
-- policy even when no conflict occurs, so if upsert is ever reintroduced for this path, it still
-- won't silently break for learners the way it did before (see js/api/supabase.js storage.upload).
create policy "ll assets update" on storage.objects for update to authenticated
  using (bucket_id = 'laolao-assets' and (
    public.ll_can_publish()
    or name like 'payment-proof/' || auth.uid()::text || '-%'
  ))
  with check (bucket_id = 'laolao-assets' and (
    public.ll_can_publish()
    or name like 'payment-proof/' || auth.uid()::text || '-%'
  ));
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
