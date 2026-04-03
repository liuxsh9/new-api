#!/bin/bash
# =============================================================================
# Daily detail-log archival & DB cleanup
#
# What it does (runs once per day via cron):
#   1. Compress yesterday's detail log file with xz -9e (extreme, multi-threaded)
#   2. Move the .xz archive to a monthly subdirectory
#   3. Delete the original log file after successful compression
#   4. Clean DB log_details rows older than 3 days (data already in .xz archive)
#
# Prerequisites:
#   - xz, bc, numfmt installed on the host
#   - Docker container "postgres" running with user "root" and database "new-api"
#   - DETAIL_LOG_ENABLED=true in the new-api container environment
#
# Crontab entry (add with: crontab -e):
#   0 7 * * * /path/to/archive-logs.sh >> /path/to/archive.log 2>&1
#
# Environment overrides:
#   LOG_DIR       - detail log directory (default: /mnt/data/new-api/logs/details)
#   ARCHIVE_DIR   - archive output directory (default: /mnt/data/new-api/log-archive)
#   PG_CONTAINER  - postgres container name (default: postgres)
#   PG_USER       - postgres user (default: root)
#   PG_DB         - postgres database (default: new-api)
#   RETENTION_DAYS - days to keep in DB (default: 3)
#   BATCH_SIZE    - rows per delete batch (default: 50000)
# =============================================================================

set -euo pipefail

LOG_DIR="${LOG_DIR:-/mnt/data/new-api/logs/details}"
ARCHIVE_DIR="${ARCHIVE_DIR:-/mnt/data/new-api/log-archive}"
PG_CONTAINER="${PG_CONTAINER:-postgres}"
PG_USER="${PG_USER:-root}"
PG_DB="${PG_DB:-new-api}"
RETENTION_DAYS="${RETENTION_DAYS:-3}"
BATCH_SIZE="${BATCH_SIZE:-50000}"

YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)
YEAR_MONTH=$(date -d "yesterday" +%Y-%m)
LOG_FILE="detail-${YESTERDAY}.log"
SRC="${LOG_DIR}/${LOG_FILE}"

# ---------------------------------------------------------------------------
# Phase 1: Compress & archive yesterday's log file
# ---------------------------------------------------------------------------

mkdir -p "${ARCHIVE_DIR}/${YEAR_MONTH}"

if [ ! -f "$SRC" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [SKIP] No log file found for ${YESTERDAY}"
else
    ORIGINAL_SIZE=$(stat -c%s "$SRC")
    if [ "$ORIGINAL_SIZE" -eq 0 ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') [SKIP] Log file for ${YESTERDAY} is empty"
        rm -f "$SRC"
    else
        DEST="${ARCHIVE_DIR}/${YEAR_MONTH}/${LOG_FILE}.xz"

        # Compress with xz -9e -T0 (extreme mode, all available CPU cores)
        xz -9e -T0 -c "$SRC" > "${DEST}.tmp"
        mv "${DEST}.tmp" "$DEST"

        COMPRESSED_SIZE=$(stat -c%s "$DEST")
        RATIO=$(echo "scale=1; (1 - $COMPRESSED_SIZE / $ORIGINAL_SIZE) * 100" | bc)
        LINES=$(wc -l < "$SRC")

        echo "$(date '+%Y-%m-%d %H:%M:%S') [OK] ${LOG_FILE}: ${LINES} entries, $(numfmt --to=iec $ORIGINAL_SIZE) -> $(numfmt --to=iec $COMPRESSED_SIZE) (${RATIO}% reduced) -> ${DEST}"

        rm -f "$SRC"
    fi
fi

# ---------------------------------------------------------------------------
# Phase 2: Clean DB log_details older than RETENTION_DAYS
# ---------------------------------------------------------------------------

CUTOFF=$(date -d "${RETENTION_DAYS} days ago" +%s)
TOTAL_DELETED=0

while true; do
    DELETED=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tA -c "
        WITH d AS (
            DELETE FROM log_details
            WHERE id IN (
                SELECT id FROM log_details
                WHERE created_at < ${CUTOFF}
                ORDER BY id
                LIMIT ${BATCH_SIZE}
            ) RETURNING 1
        ) SELECT count(*) FROM d;
    " | tr -cd '0-9')

    if [ -z "$DELETED" ] || [ "$DELETED" -eq 0 ]; then
        break
    fi

    TOTAL_DELETED=$((TOTAL_DELETED + DELETED))
done

if [ "$TOTAL_DELETED" -gt 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [DB] Deleted ${TOTAL_DELETED} log_details rows older than $(date -d @${CUTOFF} '+%Y-%m-%d %H:%M')"
fi
