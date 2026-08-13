# Backup and disaster recovery

LifeMarkAI uses project snapshots plus verified PostgreSQL backups.

## Project recovery

Project files are revisioned through snapshots and restore operations. Create a
snapshot before destructive generation, migration, import, or restore operations.

## Database backup

Install PostgreSQL client tools and configure `DATABASE_URL`. Run:

```bash
BACKUP_DIRECTORY=/secure/backups npm run backup:database
```

The command creates a custom-format `pg_dump` and a SHA-256 checksum. Store both
outside the application host in encrypted, versioned object storage.

## Isolated restore drill

Provision a disposable PostgreSQL database, set `RECOVERY_DATABASE_URL`, and run:

```bash
RECOVERY_DATABASE_URL=postgres://... npm run recovery:drill -- /secure/backups/lifemarkai-....dump
```

The drill verifies the checksum, refuses to use `DATABASE_URL` as its target,
restores with `pg_restore`, performs a public-schema sanity query, and writes a
JSON evidence record. Destroy the recovery database after evidence is retained.

## Production requirements

1. Enable daily managed backups and point-in-time recovery.
2. Keep at least 30 days of recovery points.
3. Replicate uploaded assets to a separate bucket or region.
4. Export deployment configuration and encrypted secret metadata.
5. Run the restore drill quarterly and after material schema changes.
6. Record RPO, RTO, operator, duration, row/object counts, and integrity results.
7. Never restore a drill into the live database.

The strict infrastructure preflight requires both production and isolated
recovery connection configuration. A release is production-ready only after the
latest drill evidence is reviewed.
