-- Isolated storage-policy check/fix. Safe to run on its own, separate from the full
-- supabase-schema.sql. Tells us immediately whether the full schema script has ever
-- successfully run: if this errors with "function public.ll_can_publish() does not exist",
-- that confirms the helper functions (and likely the rest of supabase-schema.sql) were
-- never applied, and the full script needs to be run instead -- this one won't work alone.

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
create policy "ll assets update" on storage.objects for update to authenticated
  using (bucket_id = 'laolao-assets' and public.ll_can_publish())
  with check (bucket_id = 'laolao-assets' and public.ll_can_publish());
create policy "ll assets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'laolao-assets' and public.ll_can_publish());

-- Confirms what's actually active after running the above.
select policyname, cmd, with_check from pg_policies
where tablename = 'objects' and schemaname = 'storage'
order by policyname;
