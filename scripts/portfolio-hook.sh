#!/bin/bash
# Ruflo session-start hook — runs portfolio scan at start of each session
# on trading days during market hours.
#
# Wire up in .claude/settings.json:
#   "hooks": {
#     "SessionStart": [
#       { "type": "command", "command": "EVENT_TYPE=session-start bash scripts/portfolio-hook.sh" }
#     ]
#   }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
LOG="$REPO_ROOT/data/portfolio/hook.log"

mkdir -p "$REPO_ROOT/data/portfolio"
cd "$REPO_ROOT"

EVENT="${EVENT_TYPE:-manual}"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "[$TIMESTAMP] Portfolio hook triggered: $EVENT" >> "$LOG"

# Skip on weekends
DAY="$(date +%u)"  # 1=Mon ... 7=Sun
if [ "$DAY" -ge 6 ] && [ "$EVENT" != "manual" ]; then
  echo "[$TIMESTAMP] Weekend — skipping portfolio scan" >> "$LOG"
  exit 0
fi

# Only run full cycle on session-start or manual trigger
if [ "$EVENT" = "session-start" ] || [ "$EVENT" = "manual" ]; then
  echo "[$TIMESTAMP] Running portfolio scan..." >> "$LOG"
  tsx src/portfolio/run.ts >> "$LOG" 2>&1
  STATUS=$?
  if [ $STATUS -eq 0 ]; then
    echo "[$TIMESTAMP] Portfolio scan complete (exit 0)" >> "$LOG"
  else
    echo "[$TIMESTAMP] Portfolio scan failed (exit $STATUS)" >> "$LOG"
  fi
fi
