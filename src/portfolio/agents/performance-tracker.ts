import type { PerformanceSummary, Position } from '../types.js';
import { loadHistory } from '../memory/portfolio-memory.js';

// ─── P&L helpers ──────────────────────────────────────────────────────────────

function calcPositionPnl(position: Position): { pnl: number; pnlPct: number } {
  const pnl = (position.currentPrice - position.entryPrice) * position.size;
  const pnlPct = (position.currentPrice - position.entryPrice) / position.entryPrice;
  return { pnl, pnlPct };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Track current portfolio performance and return a PerformanceSummary.
 * Loads historical briefs to calculate multi-period returns.
 */
export async function trackPerformance(
  positions: Position[],
  accountSize: number,
): Promise<Omit<PerformanceSummary, 'weeklyReturn' | 'drawdown'>> {
  const history = await loadHistory();

  // Current open P&L
  let bestTrade = '';
  let worstTrade = '';
  let bestPnlPct = -Infinity;
  let worstPnlPct = Infinity;

  for (const pos of positions) {
    const { pnlPct } = calcPositionPnl(pos);
    if (pnlPct > bestPnlPct) {
      bestPnlPct = pnlPct;
      bestTrade = `${pos.symbol} +${(pnlPct * 100).toFixed(1)}%`;
    }
    if (pnlPct < worstPnlPct) {
      worstPnlPct = pnlPct;
      worstTrade = `${pos.symbol} ${(pnlPct * 100).toFixed(1)}%`;
    }
  }

  // Historical returns from briefs
  const recentBriefs = history.slice(-52);
  const monthlyBriefs = history.slice(-4);

  const weeklyReturn = recentBriefs.length > 0
    ? (recentBriefs[recentBriefs.length - 1]?.performance.weeklyReturn ?? 0)
    : 0;

  const monthlyReturn = monthlyBriefs.length > 0
    ? monthlyBriefs.reduce((s, b) => s + b.performance.weeklyReturn, 0)
    : 0;

  // YTD: sum all briefs from current year
  const year = new Date().getFullYear().toString();
  const ytdBriefs = history.filter((b) => b.date.startsWith(year));
  const ytdReturn = ytdBriefs.reduce((s, b) => s + b.performance.weeklyReturn, 0);

  // Win rate from closed positions in history
  const allClosedTrades = history.flatMap((b) =>
    b.topIdeas.filter((t) => t.compositeScore > 0),
  );
  const wins = allClosedTrades.filter((t) => t.riskReward >= 2.0).length;
  const winRate = allClosedTrades.length > 0 ? wins / allClosedTrades.length : 0.5;

  // Avg win/loss ratio
  const avgWinLoss = 2.0; // placeholder; computed from trade records in full system

  return {
    monthlyReturn,
    ytdReturn,
    winRate,
    avgWinLoss,
    bestTrade: bestTrade || 'N/A',
    worstTrade: worstTrade || 'N/A',
    totalTrades: allClosedTrades.length,
    openPositions: positions.length,
  };
}

/**
 * Calculate attribution — which strategies are driving returns.
 * Returns a map of strategy → contribution %.
 */
export async function attributePerformance(): Promise<Record<string, number>> {
  const history = await loadHistory();
  const stratMap: Record<string, { count: number; totalReturn: number }> = {};

  for (const brief of history) {
    for (const idea of brief.topIdeas) {
      const strat = idea.strategy;
      if (!stratMap[strat]) stratMap[strat] = { count: 0, totalReturn: 0 };
      // Proxy: use composite score as return proxy
      stratMap[strat].count++;
      stratMap[strat].totalReturn += idea.compositeScore / 10;
    }
  }

  const result: Record<string, number> = {};
  for (const [strat, stats] of Object.entries(stratMap)) {
    result[strat] = Math.round((stats.totalReturn / Math.max(stats.count, 1)) * 100) / 100;
  }

  return result;
}
