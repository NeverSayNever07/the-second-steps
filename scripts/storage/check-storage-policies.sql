-- Read-only. Paste into the Supabase SQL editor for the project that holds
-- the zayto-documents bucket. Zayto reaches Storage only with the server key,
-- so no Storage policy should apply to anonymous or signed-in users
-- (ADR-008). Expect no rows. Any row is a policy that could let a Supabase
-- token reach objects directly and must be reviewed before uploads begin.
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (
    roles && ARRAY['public', 'anon', 'authenticated']::name[]
  );
