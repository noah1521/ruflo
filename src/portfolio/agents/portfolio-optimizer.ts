import type { TradeSignal, WorkflowConfig } from '../types.js';

// ─── Kelly criterion ──────────────────────────────────────────────────────────

/**
 * Kelly criterion: f = (bp - q) / b
 *   b = odds (risk:reward ratio)
 *   p = win probability
 *   q = 1 - p
 * Returns full Kelly fraction (uncapped).
 */
export function kelly(winRate: number, riskReward: number): number {
  if (winRate <= 0 || riskReward <= 0) return 0;
  const p = winRate;
  const q = 1 - p;
  const b = riskReward;
  return (b * p - q) / b;
}

/**
 * Half-Kelly for safety: 50% of full Kelly.
 * Capped at maxPositionPct of portfolio.
 */
export function halfKelly(winRate: number, riskReward: number, maxPositionPct = 0.10): number {
  const full = kelly(winRate, riskReward);
  const half = full / 2;
  return Math.max(0, Math.min(maxPositionPct, half));
}

// ─── Sector correlation check ─────────────────────────────────────────────────

const SECTOR_MAP: Record<string, string> = {
  AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Technology', GOOGL: 'Technology',
  META: 'Technology', AMZN: 'Consumer Discretionary', TSLA: 'Consumer Discretionary',
  AVGO: 'Technology', JPM: 'Financials', LLY: 'Healthcare', UNH: 'Healthcare',
  V: 'Financials', XOM: 'Energy', MA: 'Financials', HD: 'Consumer Discretionary',
  PG: 'Consumer Staples', COST: 'Consumer Staples', JNJ: 'Healthcare',
  ABBV: 'Healthcare', CRM: 'Technology', BAC: 'Financials', MRK: 'Healthcare',
  ORCL: 'Technology', AMD: 'Technology', ACN: 'Technology', CVX: 'Energy',
  ADBE: 'Technology', NFLX: 'Technology', TMO: 'Healthcare', PEP: 'Consumer Staples',
};

const MAX_SECTOR_POSITIONS = 3;

function getSector(symbol: string): string {
  return SECTOR_MAP[symbol] ?? 'Other';
}

/**
 * Filter signals to respect max-per-sector rule.
 * Returns allowed symbols.
 */
function applySectorFilter(signals: TradeSignal[]): TradeSignal[] {
  const sectorCounts: Record<string, number> = {};
  const allowed: TradeSignal[] = [];

  // Sort by confidence descending so we keep the best per sector
  const sorted = [...signals].sort((a, b) => b.confidence - a.confidence);

  for (const signal of sorted) {
    const sector = getSector(signal.symbol);
    const count = sectorCounts[sector] ?? 0;
    if (count < MAX_SECTOR_POSITIONS) {
      allowed.push(signal);
      sectorCounts[sector] = count + 1;
    }
  }

  return allowed;
}

// ─── MPT-inspired weighting ───────────────────────────────────────────────────
// Simplified: weight by confidence score, then normalize to sum ≤ 1.

function buildRawWeights(signals: TradeSignal[], maxPositions: number): Map<string, number> {
  const weights = new Map<string, number>();
  const total = signals.slice(0, maxPositions).reduce((s, sig) => s + sig.confidence, 0);
  if (total === 0) return weights;

  for (const sig of signals.slice(0, maxPositions)) {
    weights.set(sig.symbol, sig.confidence / total);
  }

  return weights;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Optimize portfolio allocation using half-Kelly + sector diversification.
 * Returns allocation map: symbol → fraction of portfolio (0–0.10).
 *
 * @param riskMultiplier - Scale all allocations down (e.g., 0.5 in risk-off)
 */
export async function optimizePortfolio(
  signals: TradeSignal[],
  config: WorkflowConfig,
  riskMultiplier = 1.0,
): Promise<Record<string, number>> {
  await Promise.resolve();

  // Filter actionable buy signals
  const buySignals = signals.filter((s) => s.action === 'buy' || s.action === 'watch');
  if (buySignals.length === 0) return {};

  // Apply sector diversification
  const sectorFiltered = applySectorFilter(buySignals);

  // Build raw weights from confidence
  const rawWeights = buildRawWeights(sectorFiltered, config.maxPositions);

  // Compute Kelly-based sizes
  const allocationMap: Record<string, number> = {};
  const MAX_POSITION = 0.10; // hard cap per position
  const riskPerTrade = config.riskPerTrade; // e.g. 0.02

  let totalAllocated = 0;

  for (const [symbol, _weight] of rawWeights) {
    const signal = buySignals.find((s) => s.symbol === symbol);
    if (!signal) continue;

    // Approximate win rate from confidence (50–75% range)
    const winRateEstimate = 0.45 + (signal.confidence / 10) * 0.30;
    const rr = signal.riskReward ?? 2.0;

    let allocation = halfKelly(winRateEstimate, rr, MAX_POSITION);

    // Risk-per-trade cap: don't risk more than config.riskPerTrade of portfolio
    // position_size * stop_loss_pct <= riskPerTrade
    const stopPct = 0.07; // aligned with 7% hard stop
    const maxByRisk = riskPerTrade / stopPct;
    allocation = Math.min(allocation, maxByRisk);

    // Apply macro risk multiplier
    allocation *= riskMultiplier;

    if (allocation > 0.005 && totalAllocated + allocation <= 0.95) {
      allocationMap[symbol] = Math.round(allocation * 1000) / 1000;
      totalAllocated += allocation;
    }
  }

  return allocationMap;
}
