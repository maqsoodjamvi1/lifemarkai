-- Daily backups are written with the service-role client, but the Cloud status
-- route reads them with the user's RLS-scoped client. Preserve server-only
-- writes while allowing project owners to list their own backup metadata.
DROP POLICY IF EXISTS deny_client_access
  ON public.lifemark_cloud_auto_backups;

REVOKE ALL ON public.lifemark_cloud_auto_backups FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.lifemark_cloud_auto_backups FROM authenticated;
GRANT SELECT ON public.lifemark_cloud_auto_backups TO authenticated;

DROP POLICY IF EXISTS lifemark_cloud_auto_backups_owner_read
  ON public.lifemark_cloud_auto_backups;

CREATE POLICY lifemark_cloud_auto_backups_owner_read
ON public.lifemark_cloud_auto_backups
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.projects
     WHERE projects.id = lifemark_cloud_auto_backups.project_id
       AND projects.user_id = (SELECT auth.uid())
  )
);
