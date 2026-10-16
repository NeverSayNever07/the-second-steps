-- The contacts list shows a workspace's contacts newest change first.
CREATE INDEX "contacts_status_updated_idx"
ON "contacts"("workspace_id", "status", "updated_at" DESC, "id");

-- Audit events are append-only. The row-level security policies already refuse
-- updates and deletes; revoking the privileges as well means a later policy
-- mistake cannot open them up.
REVOKE UPDATE, DELETE ON TABLE "audit_events" FROM "zayto_app";
