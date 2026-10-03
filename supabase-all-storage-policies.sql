-- Read-only. Lists every policy on storage.objects (not just mine), including whether each is
-- PERMISSIVE (any one passing is enough) or RESTRICTIVE (ALL restrictive ones must pass too --
-- if an unexpected restrictive policy exists here, it could silently block inserts my policy
-- otherwise allows, which the earlier filtered check wouldn't have revealed).
select policyname, cmd, permissive, roles, with_check
from pg_policies
where tablename = 'objects' and schemaname = 'storage'
order by cmd, policyname;
