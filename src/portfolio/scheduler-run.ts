/**
 * Portfolio Scheduler — persistent process entry point
 *
 * Run:  tsx src/portfolio/scheduler-run.ts
 *       node --import tsx/esm src/portfolio/scheduler-run.ts
 *
 * Env vars:
 *   ACCOUNT_SIZE=10000       Starting account size in USD
 *   RISK_PER_TRADE=0.02      Risk per trade as decimal (2%)
 *   MAX_POSITIONS=8          Max concurrent positions
 *   MARKET_OPEN_HOUR=9       ET hour to run (default 9)
 *   MARKET_OPEN_MINUTE=30    ET minute to run (default 30)
 *   PRE_MARKET_SCAN=1        Also run a scan at 8:00 AM ET
 *   FMP_API_KEY=...          Enable live market data
 *   BIGDATA_API_KEY=...      Enable live news/catalyst data
 */

import { PortfolioScheduler } from './scheduler.js';

const scheduler = new PortfolioScheduler({
  marketOpenHour: parseInt(process.env['MARKET_OPEN_HOUR'] ?? '9', 10),
  marketOpenMinute: parseInt(process.env['MARKET_OPEN_MINUTE'] ?? '30', 10),
  preMarketScan: process.env['PRE_MARKET_SCAN'] === '1',
});

process.on('SIGINT', () => {
  console.log('\n[Portfolio] Shutting down scheduler...');
  scheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  scheduler.stop();
  process.exit(0);
});

const dataMode = process.env['FMP_API_KEY'] ? 'LIVE (FMP)' : 'MOCK';
console.log(`[Portfolio] Data mode: ${dataMode}`);
console.log(`[Portfolio] Account: $${process.env['ACCOUNT_SIZE'] ?? '10,000'}`);

scheduler.start();
console.log(`[Portfolio] Scheduler running. Next run: ${scheduler.nextRunAt()}`);
console.log('[Portfolio] Press Ctrl+C to stop.');
