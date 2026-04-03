#!/bin/bash
# =============================================================================
# One-time cleanup: delete log_details rows older than N days
#
# Use this to perform the initial bulk cleanup when first deploying
# the archival system. After the first run, the daily cron job in
# archive-logs.sh handles incremental cleanup automatically.
#
# Usage:
#   ./cleanup-old-details.sh              # default: delete > 3 days old
#   RETENTION_DAYS=7 ./cleanup-old-details.sh  # delete > 7 days old
#
# This script is safe to run while the application is serving traffic.
# It deletes in small batches to avoid long-running transactions.
# =============================================================================

set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-postgres}"
PG_USER="${PG_USER:-root}"
PG_DB="${PG_DB:-new-api}"
RETENTION_DAYS="${RETENTION_DAYS:-3}"
BATCH_SIZE="${BATCH_SIZE:-50000}"

CUTOFF=$(date -d "${RETENTION_DAYS} days ago" +%s)
echo "Cleaning log_details older than $(date -d @$CUTOFF '+%Y-%m-%d %H:%M') (${RETENTION_DAYS} days ago)"

# Count rows to delete
COUNT=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tA -c \
    "SELECT count(*) FROM log_details WHERE created_at < ${CUTOFF};")
echo "Rows to delete: ${COUNT}"

if [ "$COUNT" -eq 0 ]; then
    echo "Nothing to clean up."
    exit 0
fi

TOTAL=0
BATCH=0

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

    TOTAL=$((TOTAL + DELETED))
    BATCH=$((BATCH + 1))

    if [ $((BATCH % 10)) -eq 0 ]; then
        PCT=$((TOTAL * 100 / COUNT))
        echo "$(date '+%H:%M:%S') progress: ${TOTAL}/${COUNT} (${PCT}%) batch=${BATCH}"
    fi
done

echo "$(date '+%H:%M:%S') Done. Deleted ${TOTAL} rows in ${BATCH} batches."
echo ""
echo "Tip: Run VACUUM ANALYZE on the table to reclaim disk space:"
echo "  docker exec $PG_CONTAINER psql -U $PG_USER -d $PG_DB -c 'VACUUM ANALYZE log_details;'"
