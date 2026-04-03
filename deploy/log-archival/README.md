# Detail Log Archival & DB Cleanup

Automated system for managing new-api detail logs: compressing log files for long-term storage and cleaning the DB to keep it lean.

## Background

When `DETAIL_LOG_ENABLED=true`, new-api records full request/response payloads for every API call — both as flat log files and (optionally, with `DB_DETAIL_STORAGE=true`) as compressed rows in the `log_details` table.

The `log_details` table stores gzip-compressed binary data (~22KB/row average). At moderate traffic this grows **10-20GB per day** and will dominate your database size within a week. The same data exists in the daily log files, so there's no reason to keep old rows in the DB.

## Architecture

```
                        ┌─────────────────────┐
  API Request ─────────►│  new-api (Go app)    │
                        │                      │
                        │  detail_capture.go   │
                        │       │              │
                        │       ▼              │
                        │  RecordLogDetail()   │
                        │    │          │      │
                        │    ▼          ▼      │
                        │  Log File   DB Row   │
                        │  (daily)   (gzip'd)  │
                        └────┬──────────┬──────┘
                             │          │
    ┌────────────────────────┘          └──────────────────────┐
    ▼                                                          ▼
  /app/logs/details/                                     log_details table
  detail-YYYY-MM-DD.log                                  (PostgreSQL)
    │                                                          │
    │  ┌──────────────────────────────────────────────┐       │
    └──┤  archive-logs.sh (daily cron, 07:00)         ├───────┘
       │                                              │
       │  1. xz -9e compress yesterday's .log         │
       │  2. Move .xz to monthly archive dir          │
       │  3. Delete source .log                        │
       │  4. DELETE FROM log_details WHERE age > 3d    │
       └──────────────────┬───────────────────────────┘
                          ▼
                /log-archive/YYYY-MM/
                detail-YYYY-MM-DD.log.xz
                (permanent storage)
```

## What gets cleaned

| Data | Retention | Reason |
|------|-----------|--------|
| `log_details` DB rows | **3 days** | Dashboard detail view only needs recent data; older data lives in .xz archives |
| Detail log files (`.log`) | **1 day** | Compressed to .xz, original deleted |
| Archive files (`.xz`) | **Permanent** | Long-term audit trail (manage manually or add your own retention policy) |
| `logs` DB table | **Not touched** | Used by billing, statistics, monthly reports — do NOT auto-delete |

## What is NOT affected

The `log_details` table is **completely independent** of billing and statistics. It is only used for debugging (viewing full request/response in the admin UI). The `logs` table — which drives billing, quota, monthly stats, and CSV exports — is never touched by this cleanup.

## Setup

### 1. Install the cron job

```bash
# Copy the script to your preferred location
cp archive-logs.sh /mnt/data/new-api/archive-logs.sh
chmod +x /mnt/data/new-api/archive-logs.sh

# Add to crontab
crontab -e
# Add this line:
0 7 * * * /mnt/data/new-api/archive-logs.sh >> /mnt/data/new-api/log-archive/archive.log 2>&1
```

### 2. First-time bulk cleanup (if you have existing data)

```bash
# Default: delete rows older than 3 days
chmod +x cleanup-old-details.sh
./cleanup-old-details.sh

# Or specify a different retention:
RETENTION_DAYS=7 ./cleanup-old-details.sh
```

This can take hours for large tables (millions of rows with TOAST data). It runs in the background and is safe to run while the app is serving traffic.

### 3. Reclaim disk space after bulk cleanup

PostgreSQL doesn't return disk space to the OS after DELETE — you need VACUUM:

```bash
# Standard vacuum (reclaims space for reuse within PG, non-blocking):
docker exec postgres psql -U root -d new-api -c "VACUUM ANALYZE log_details;"

# Full vacuum (returns space to OS, but locks the table — run during low traffic):
docker exec postgres psql -U root -d new-api -c "VACUUM FULL log_details;"
```

## Configuration

All settings can be overridden via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_DIR` | `/mnt/data/new-api/logs/details` | Where new-api writes detail logs |
| `ARCHIVE_DIR` | `/mnt/data/new-api/log-archive` | Where .xz archives are stored |
| `PG_CONTAINER` | `postgres` | Docker container name for PostgreSQL |
| `PG_USER` | `root` | PostgreSQL user |
| `PG_DB` | `new-api` | PostgreSQL database |
| `RETENTION_DAYS` | `3` | Days to keep in DB before cleanup |
| `BATCH_SIZE` | `50000` | Rows per DELETE batch |

## Monitoring

Check the archive log for daily status:

```bash
tail -20 /mnt/data/new-api/log-archive/archive.log
```

Sample output:
```
2026-04-03 07:00:15 [OK] detail-2026-04-02.log: 847362 entries, 6.8G -> 1.1G (83.8% reduced) -> .../2026-04/detail-2026-04-02.log.xz
2026-04-03 07:02:43 [DB] Deleted 723841 log_details rows older than 2026-03-31 07:00
```

## Accessing archived logs

```bash
# List archives
ls -lh /mnt/data/new-api/log-archive/2026-04/

# View a specific archived log
xz -dc /mnt/data/new-api/log-archive/2026-04/detail-2026-04-01.log.xz | head -5

# Search for a specific request_id in archives
xz -dc /mnt/data/new-api/log-archive/2026-04/detail-2026-04-01.log.xz | grep "request_id_here"

# Each line is a JSON object:
# {"ts":1712345678,"rid":"abc123","uid":1,"req":"...","resp":"...","up_req":"...","up_resp":"..."}
```
