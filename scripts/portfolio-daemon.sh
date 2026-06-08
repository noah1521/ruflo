#!/bin/bash
# Portfolio Manager Daemon
#
# Usage:
#   ./scripts/portfolio-daemon.sh start    — start scheduler in background
#   ./scripts/portfolio-daemon.sh stop     — stop scheduler
#   ./scripts/portfolio-daemon.sh restart  — restart scheduler
#   ./scripts/portfolio-daemon.sh status   — check if running
#   ./scripts/portfolio-daemon.sh run-now  — run pipeline immediately (foreground)
#   ./scripts/portfolio-daemon.sh logs     — tail logs
#   ./scripts/portfolio-daemon.sh brief    — show last weekly brief

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PIDFILE="$REPO_ROOT/data/portfolio/scheduler.pid"
LOGFILE="$REPO_ROOT/data/portfolio/scheduler.log"

cd "$REPO_ROOT"
mkdir -p data/portfolio

case "${1:-help}" in
  start)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "Portfolio scheduler already running (PID $(cat "$PIDFILE"))"
      echo "Use './scripts/portfolio-daemon.sh restart' to restart."
      exit 1
    fi
    nohup tsx src/portfolio/scheduler-run.ts >> "$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    echo "✓ Portfolio scheduler started (PID $!)"
    echo "  Logs: ./scripts/portfolio-daemon.sh logs"
    echo "  Next market-open run: 9:30 AM ET (Mon-Fri)"
    ;;

  stop)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      kill "$(cat "$PIDFILE")"
      rm -f "$PIDFILE"
      echo "✓ Portfolio scheduler stopped"
    else
      echo "Portfolio scheduler is not running"
      rm -f "$PIDFILE"
    fi
    ;;

  restart)
    "$0" stop || true
    sleep 1
    "$0" start
    ;;

  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "✓ Running (PID $(cat "$PIDFILE"))"
      echo "  Log file: $LOGFILE"
      if [ -f "$LOGFILE" ]; then
        echo "  Last log entry: $(tail -1 "$LOGFILE")"
      fi
    else
      echo "✗ Not running"
      rm -f "$PIDFILE"
    fi
    ;;

  run-now)
    echo "Running portfolio pipeline (foreground)..."
    tsx src/portfolio/run.ts
    ;;

  logs)
    if [ -f "$LOGFILE" ]; then
      tail -f "$LOGFILE"
    else
      echo "No log file found at $LOGFILE"
      echo "Start the scheduler first: ./scripts/portfolio-daemon.sh start"
    fi
    ;;

  brief)
    if [ -f "data/portfolio/memory.json" ]; then
      node -e "
        const fs = require('fs');
        const mem = JSON.parse(fs.readFileSync('data/portfolio/memory.json', 'utf8'));
        const briefs = mem.weeklyBriefs || [];
        if (!briefs.length) { console.log('No briefs yet.'); process.exit(0); }
        const last = briefs[briefs.length - 1];
        console.log('=== Last Weekly Brief ===');
        console.log('Date:', last.date);
        console.log('Macro:', last.macroContext?.marketPhase, '| VIX:', last.macroContext?.vixLevel, '|', last.macroContext?.riskOnOff);
        console.log('Risk mode:', last.riskMode);
        console.log('Top ideas:');
        (last.topIdeas || []).forEach((idea, i) => {
          console.log('  ' + (i+1) + '. ' + idea.symbol + ' [' + idea.strategy + '] Score ' + idea.compositeScore + '/10 | Entry \$' + idea.entryPrice + ' | Stop \$' + idea.stopLoss + ' | Target \$' + idea.target);
        });
      "
    else
      echo "No memory file found. Run the pipeline first: ./scripts/portfolio-daemon.sh run-now"
    fi
    ;;

  help|*)
    echo "Portfolio Manager Daemon"
    echo ""
    echo "Usage: $0 {start|stop|restart|status|run-now|logs|brief}"
    echo ""
    echo "Commands:"
    echo "  start     Start the scheduler daemon (runs at 9:30 AM ET Mon-Fri)"
    echo "  stop      Stop the scheduler daemon"
    echo "  restart   Restart the scheduler daemon"
    echo "  status    Check if the scheduler is running"
    echo "  run-now   Run the portfolio pipeline immediately (foreground)"
    echo "  logs      Tail the scheduler log file"
    echo "  brief     Show the last weekly brief"
    echo ""
    echo "Environment variables:"
    echo "  FMP_API_KEY        Enable live FMP market data"
    echo "  BIGDATA_API_KEY    Enable live Bigdata.com news data"
    echo "  ACCOUNT_SIZE       Account size in USD (default: 10000)"
    echo "  RISK_PER_TRADE     Risk per trade as decimal (default: 0.02)"
    echo "  MAX_POSITIONS      Max concurrent positions (default: 8)"
    echo "  PRE_MARKET_SCAN=1  Also scan at 8:00 AM ET"
    ;;
esac
