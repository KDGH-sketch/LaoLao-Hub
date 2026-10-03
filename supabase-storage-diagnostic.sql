-- Isolated storage-policy fix. Safe to run on its own, separate from the full supabase-schema.sql.
--
-- Root cause found: the app's upload helper passed upsert:true, which makes Postgres evaluate the
-- write as "insert ... on conflict do update" -- checked against BOTH the insert AND the update
-- policy even when no conflict actually happens. The insert policy already allowed a learner's own
-- payment-proof upload, but the update policy (admin-publish-rights only) silently blocked it
-- anyway. This version widens the update policy to match, and the app code has also been changed to
-- stop passing upsert:true (it was never actually needed -- every upload path is already unique).

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

-- Confirms what's actually active after running the above.
select policyname, cmd, with_check from pg_policies
where tablename = 'objects' and schemaname = 'storage'
order by policyname;
