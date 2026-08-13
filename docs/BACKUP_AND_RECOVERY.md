# Backup and disaster recovery

LifeMarkAI uses two recovery layers.

## Project recovery

Project files are revisioned through snapshots and restore operations. Before a
destructive generation, migration, import, or restore, create a snapshot. Test
restoration against a non-production project during every release cycle.

## Database recovery

Production must use managed PostgreSQL/Supabase backups with point-in-time
recovery enabled. `DATABASE_URL` is required by the private-infrastructure
preflight so operators cannot mark disaster recovery ready without a database
recovery target.

Operational requirements:

1. Enable daily managed backups and point-in-time recovery.
2. Keep at least 30 days of database recovery points.
3. Replicate uploaded assets to a separate bucket or region.
4. Export deployment configuration and encrypted secret metadata.
5. Run a quarterly restore drill into an isolated recovery project.
6. Record recovery-point objective, recovery-time objective, operator, duration,
   row counts, object counts, and integrity-check results.
7. Never test restoration against the live database.

A release is not production-ready merely because snapshots exist. The strict
control-plane verifier confirms configuration, while the operator's most recent
restore-drill record proves recoverability.
