# Z&N adVentures — Strategy Rules

> The living rulebook. Rules are added when we learn something, never deleted unless superseded.
> ZN-Risk enforces these. ZN-Chief cannot override them. Last updated: 2026-06-09.

---

## Fund Identity

| Field | Value |
|-------|-------|
| Name | Z&N adVentures |
| Account | Robinhood #521437343 |
| Founded | June 8, 2026 |
| Goal | Maximum growth, high risk/high reward |
| Time Horizon | 1-3 years |
| Phase 1 | Equity accumulation + manual options swing trades |
| Phase 2 | Full covered call + swing trade engine (pending Robinhood upgrade) |

---

## Hard Rules — ZN-Risk Enforces, No Override

1. **No crypto. Ever.**
2. **No stocks under $1.00.** No OTC/pink sheets.
3. **Only NYSE, NASDAQ, AMEX** — all sectors, all market caps, ETFs, leveraged ETFs, IPOs, SPACs.
4. **Always run 72hr news sweep before any execution** — no exceptions. (Lesson: META equity offering June 5 missed because sweep was skipped.)
5. **PDT Protection**: Never exceed 3 day trades in any rolling 5-day window. Account under $25,000 — PDT rules fully in effect.
6. **Session deploy cap**: Never deploy more than 60% of buying power in a single session.
7. **Cash reserve floor**: Always maintain minimum $10.00 cash. Floor takes precedence over session cap.
8. **Stop-loss flag**: Any position down >20% from entry is immediately flagged to ZN-Chief for review.
9. **Stagger options exits**: Never place a single all-in limit. Always ladder exits.
10. **Read mistake_log.md before every recommendation**: ZN-Risk runs this check. ZN-Chief confirms.

---

## Options Rules

- Maximum entry premium: $0.15 per contract (OTM call playbook)
- Maximum contracts per trade: 4
- Exit ladder: 1/4 at +36%, 2/4 at +82%, remainder trail or hold if deep ITM
- P/C ratio threshold: Only enter bullish plays when put/call < 0.50
- Catalyst required: Must have identifiable news driver within 14 days
- 72hr sweep: Always, before any options entry

---

## Scanning Rules (ZN-Scout)

- Scan entire market daily — no sector restrictions
- Sources: Yahoo Finance, Finviz, Unusual Whales, Barchart, SEC Edgar, Fintel, Google News, FDA calendar, earnings calendar
- Flag for ZN-Alpha: OTM call setups, unusual options activity, 52wk high proximity, pre-earnings momentum, sector rotation signals, short squeeze candidates, analyst upgrades, activist filings, M&A rumors, macro catalyst plays, FDA binary events, IPO day-one plays
- 72hr negative sweep on EVERY ticker before passing to analyst

---

## Scoring Rules (ZN-Alpha)

- Only pass score 7.0+/10 to ZN-Chief
- Score dimensions: catalyst strength (30%), options premium value (20%), risk/reward (20%), time horizon fit (15%), news cleanliness (15%)
- Minimum risk/reward ratio: 3:1 to qualify

---

## Morning Brief Protocol (ZN-Scheduler triggers at 8:30am EST)

Format ZN-Chief uses every day:
```
Z&N adVentures Brief — [DATE]
Portfolio P&L: [vs yesterday]
Top Opportunity: [specific trade with entry price]
Risk Flags: [any alerts]
Catalysts This Week: [upcoming events]
```

---

## Learning Loop (after every session)

1. ZN-Chief writes session outcome to portfolio_state.json
2. ZN-Scout updates watchlist signals in morning_brief.md
3. ZN-Risk checks for rule violations → logs to mistake_log.md
4. ZN-Memory embeds trade outcome with full context for pattern matching
5. ZN-Improve extracts pattern if win, identifies miss if loss, updates playbook

---

## Performance Targets

- Beat S&P 500 annual return every calendar month
- Stretch goal: 10% weekly return on deployed capital
- Track: equity P&L + options P&L separately, net P&L vs inception

---

## Rules Created from Mistakes

| Rule | Source |
|------|--------|
| 72hr news sweep mandatory | Mistake #1 — META equity offering missed |
| Never promise unverified data | Mistake #2 — Greeks without confirmed feed |
| Confirm live buying power before allocation | Mistake #3 — wrong capital figures referenced |
| Always include options history in portfolio review | Mistake #4 — incomplete portfolio picture |
