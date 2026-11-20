-- ========================================================
--  LaoLao: the Lao life calendar for a live project (adds the "events" table that supabase-schema.sql now has).
--  Run in the Supabase SQL Editor after supabase-schema.sql (and supabase-welcome-migration.sql). Safe to run again.
--  Additive: creates one table and its policies, changes no rows.
--  Then: Admin → Website & Welcome → Life Calendar (or Settings → Import starter content) and Publish now.
-- ========================================================
begin;

-- 1. The table (same shape as every content table: id text, data jsonb)
create table if not exists public.events (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.events enable row level security;

-- 2. Policies: admins read; editors of the "events" menu (Life Calendar) write. Visitors never read the table:
--    published public events reach them through the tier-0 bundle, like festivals.
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'events' loop
    execute format('drop policy %I on public.events', r.policyname);
  end loop;
end $$;
create policy "ll admin read" on public.events for select using (public.ll_is_admin());
create policy "ll edit insert" on public.events for insert with check (public.ll_can_edit('events'));
create policy "ll edit update" on public.events for update using (public.ll_can_edit('events')) with check (public.ll_can_edit('events'));
create policy "ll edit delete" on public.events for delete using (public.ll_can_edit('events'));

-- 3. Atomic updates may target the new table (same function as in supabase-schema.sql)
create or replace function public.ll_apply(p_table text, p_id text, p_ops jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare doc jsonb; op jsonb; p text[]; i int; cur jsonb;
begin
  if p_table not in ('users','admins','adminNotes','access','plans','subscriptions','settings',
                     'lessons','patterns','grammar','vocabulary','dialogues','quizzes','audio','paths','releases','lexicon',
                     'videos','tones','culture','characters','dictionary','places','festivals','events','offers','resources','pronunciation',
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
