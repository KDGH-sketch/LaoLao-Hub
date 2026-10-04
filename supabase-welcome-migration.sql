-- ========================================================
--  LaoLao: welcome page upgrade for a live project (adds what supabase-schema.sql adds for the welcome page).
--  Run in the Supabase SQL Editor. Safe to run again. Additive: creates tables and policies, changes no rows,
--  drops only the policies it recreates. Requires supabase-schema.sql to have been run before (ll_* helpers).
--  Then: Admin → Settings → Import starter content (optional) and Publish now.
-- ========================================================
begin;

-- 1. New content types (same shape as every table: id text, data jsonb)
do $$
declare t text;
begin
  foreach t in array array['places','festivals','offers','resources'] loop
    execute format('create table if not exists public.%I (
      id text primary key,
      data jsonb not null default ''{}''::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 2. Policies: admins read; editors of the matching menu write (offers belong to the "promotions" menu).
--    Visitors never read these tables: published public items reach them through the tier-0 bundle.
do $$
declare t text; m text; r record;
begin
  foreach t in array array['places','festivals','offers','resources'] loop
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
    m := case t when 'offers' then 'promotions' else t end;
    execute format('create policy "ll admin read" on public.%I for select using (public.ll_is_admin())', t);
    execute format('create policy "ll edit insert" on public.%I for insert with check (public.ll_can_edit(%L))', t, m);
    execute format('create policy "ll edit update" on public.%I for update using (public.ll_can_edit(%L)) with check (public.ll_can_edit(%L))', t, m, m);
    execute format('create policy "ll edit delete" on public.%I for delete using (public.ll_can_edit(%L))', t, m);
  end loop;
end $$;

-- 3. Settings: the published welcome page is public; its draft (settings/welcomeDraft) is admin-only;
--    editors of the "welcome" menu may write both. Everything else is unchanged.
drop policy if exists "ll public read" on public.settings;
drop policy if exists "ll write insert" on public.settings;
drop policy if exists "ll write update" on public.settings;
create policy "ll public read" on public.settings for select using (id <> 'welcomeDraft' or public.ll_is_admin());
create policy "ll write insert" on public.settings for insert
  with check (public.ll_is_super() or (id = 'bundle' and public.ll_can_publish())
              or (id in ('welcome', 'welcomeDraft') and public.ll_can_edit('welcome')));
create policy "ll write update" on public.settings for update
  using (public.ll_is_super() or (id = 'bundle' and public.ll_can_publish()) or (id in ('welcome', 'welcomeDraft') and public.ll_can_edit('welcome')))
  with check (public.ll_is_super() or (id = 'bundle' and public.ll_can_publish()) or (id in ('welcome', 'welcomeDraft') and public.ll_can_edit('welcome')));

-- 4. Atomic updates may now target the new tables (same function as in supabase-schema.sql)
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

commit;
