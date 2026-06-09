#!/bin/bash

MEMORY_DIR="$(dirname "$0")/../memory"

show_menu() {
  echo ""
  echo "╔══════════════════════════════════════╗"
  echo "║       Z&N adVentures Dashboard       ║"
  echo "╠══════════════════════════════════════╣"
  echo "║  1. Morning Brief (today's trades)   ║"
  echo "║  2. Current Positions & P&L          ║"
  echo "║  3. Options Trade Log                ║"
  echo "║  4. Risk Flags & Rules               ║"
  echo "║  5. Trade Playbook                   ║"
  echo "║  6. Mistake Log                      ║"
  echo "║  7. This Week's Catalyst Calendar    ║"
  echo "║  q. Quit                             ║"
  echo "╚══════════════════════════════════════╝"
  echo ""
  printf "  Choose [1-7 or q]: "
}

view_morning_brief() {
  echo ""
  echo "━━━ MORNING BRIEF ━━━━━━━━━━━━━━━━━━━━"
  cat "$MEMORY_DIR/morning_brief.md"
}

view_positions() {
  echo ""
  echo "━━━ POSITIONS & P&L ━━━━━━━━━━━━━━━━━━"
  node -e "
    const fs = require('fs');
    const s = JSON.parse(fs.readFileSync('$MEMORY_DIR/portfolio_state.json'));
    const p = s.performance;
    console.log('');
    console.log('  Fund: ' + s.fund + ' | Account: ' + s.account_number);
    console.log('  Net P&L since inception: +\$' + p.net_pnl_inception.toFixed(2) + ' (+' + p.net_return_inception_pct + '%)');
    console.log('  Buying power: \$' + p.buying_power + ' | Deployable: \$' + p.safely_deployable);
    console.log('');
    console.log('  Ticker  Shares    Entry     Current   Change    Stop      Status');
    console.log('  ' + '─'.repeat(80));
    s.positions.forEach(pos => {
      const chg = pos.unrealized_pnl_pct.toFixed(2);
      const flag = pos.stop_status.includes('WATCH') ? ' ⚠️' : ' ✅';
      console.log('  ' +
        pos.symbol.padEnd(8) +
        String(pos.shares).padEnd(10) +
        ('\$' + pos.avg_cost).padEnd(10) +
        ('\$' + pos.current_price).padEnd(10) +
        ((chg > 0 ? '+' : '') + chg + '%').padEnd(10) +
        ('\$' + pos.stop_level_20pct).padEnd(10) +
        flag);
    });
  " 2>/dev/null || cat "$MEMORY_DIR/portfolio_state.json"
}

view_options_log() {
  echo ""
  echo "━━━ OPTIONS TRADE LOG ━━━━━━━━━━━━━━━━"
  cat "$MEMORY_DIR/options_log.md"
}

view_risk() {
  echo ""
  echo "━━━ RISK FLAGS & RULES ━━━━━━━━━━━━━━━"
  grep -A 4 "Risk Flags\|WATCH\|BREACH\|ZN-Risk Standing\|PDT\|Deployable" \
    "$MEMORY_DIR/morning_brief.md" | head -60
}

view_playbook() {
  echo ""
  echo "━━━ TRADE PLAYBOOK ━━━━━━━━━━━━━━━━━━━"
  cat "$MEMORY_DIR/trade_playbook.md"
}

view_mistakes() {
  echo ""
  echo "━━━ MISTAKE LOG ━━━━━━━━━━━━━━━━━━━━━━"
  cat "$MEMORY_DIR/mistake_log.md"
}

view_catalysts() {
  echo ""
  echo "━━━ CATALYST CALENDAR ━━━━━━━━━━━━━━━━"
  node -e "
    const fs = require('fs');
    const s = JSON.parse(fs.readFileSync('$MEMORY_DIR/portfolio_state.json'));
    console.log('');
    s.upcoming_catalysts.forEach(c => {
      console.log('  ' + c.date + '  ' + c.event.padEnd(28) + c.action);
    });
    console.log('');
  " 2>/dev/null || grep -A 40 "Catalyst Calendar" "$MEMORY_DIR/morning_brief.md" | head -40
}

while true; do
  show_menu
  read -r choice
  case "$choice" in
    1) view_morning_brief | less -R ;;
    2) view_positions ;;
    3) view_options_log | less -R ;;
    4) view_risk ;;
    5) view_playbook | less -R ;;
    6) view_mistakes | less -R ;;
    7) view_catalysts ;;
    q|Q) echo ""; echo "  Z&N adVentures — out."; echo ""; exit 0 ;;
    *) echo "  Invalid choice." ;;
  esac
  echo ""
  printf "  [Press Enter to return to menu]"
  read -r
done
