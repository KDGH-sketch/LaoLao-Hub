-- Read-only. Shows exactly what the database currently has on record for admin recognition,
-- independent of any auth session quirks in the SQL Editor (which runs as the project's elevated
-- role, not as your signed-in app user -- auth.uid() would show null here regardless).
--
-- ll_can_publish() (used by the storage upload policy) requires the signed-in account to be the
-- "owner" or have an admins row with role in (super/owner/editor/content/admin/custom). If the
-- data below doesn't show that for your account, that -- not the storage policy -- is the bug.

-- 1. Who the database currently considers the "owner" account (first-time-setup bootstrap record)
select id, data from public.settings where id = 'bootstrap';

-- 2. Every admin account on record: email, role, status
select id, data->>'email' as email, data->>'role' as role, data->>'status' as status,
       data->>'createdAt' as created_at
from public.admins
order by data->>'createdAt';

-- 3. Cross-check: find your real auth UID here, then confirm it matches an id above.
--    (Supabase Dashboard -> Authentication -> Users also shows this, next to your email.)
select id, email, created_at from auth.users order by created_at;
