-- Read-only. Shows the literal condition currently attached to the upload policy, so we can
-- confirm it's actually the new version (with the payment-proof carve-out) and not a stale one.
select with_check from pg_policies
where tablename = 'objects' and schemaname = 'storage' and policyname = 'll assets insert';
