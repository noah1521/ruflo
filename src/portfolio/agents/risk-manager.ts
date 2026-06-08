import type { PortfolioState, RiskAssessment, RiskMode, TradeSignal } from '../types.js';

const MAX_PORTFOLIO_DRAWDOWN = 0.15;   // 15% triggers de-risk mode
const HARD_STOP_PCT = 0.07;            // 7% individual stop loss
const MAX_POSITION_PCT = 0.10;         // 10% max single position
const MAX_SECTOR_CORRELATION = 3;      // max positions in same sector

// ─── Sector mapping ───────────────────────────────────────────────────────────

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

function getSector(symbol: string): string {
  return SECTOR_MAP[symbol] ?? 'Other';
}

// ─── VaR calculation ──────────────────────────────────────────────────────────

/**
 * Parametric VaR (95% confidence, 1-week horizon).
 * Assumes daily returns are normally distributed with 1.5% daily vol.
 * VaR_weekly = portfolio_value * z * daily_vol * sqrt(5)
 */
function calcVar95(portfolioValue: number, positionCount: number): number {
  const z95 = 1.645;
  const dailyVol = 0.015 + positionCount * 0.001; // vol increases with concentration
  const weeklyVol = dailyVol * Math.sqrt(5);
  return portfolioValue * z95 * weeklyVol;
}

// ─── Correlation check ────────────────────────────────────────────────────────

function checkCorrelation(
  existingSymbols: string[],
  newSignals: TradeSignal[],
): string[] {
  const warnings: string[] = [];

  // Count existing positions per sector
  const sectorCounts: Record<string, number> = {};
  for (const sym of existingSymbols) {
    const sector = getSector(sym);
    sectorCounts[sector] = (sectorCounts[sector] ?? 0) + 1;
  }

  // Check new signals against sector limits
  for (const signal of newSignals) {
    const sector = getSector(signal.symbol);
    const count = sectorCounts[sector] ?? 0;
    if (count >= MAX_SECTOR_CORRELATION) {
      warnings.push(
        `${signal.symbol} would put ${sector} at ${count + 1} positions — correlation risk`,
      );
    }
  }

  return warnings;
}

// ─── Position adjustment calculation ─────────────────────────────────────────

function calcPositionAdjustments(
  signals: TradeSignal[],
  riskMode: RiskMode,
  drawdown: number,
): Record<string, number> {
  const adjustments: Record<string, number> = {};
  const scaleFactor = riskMode === 'de-risk' ? 0.5 : riskMode === 'defensive' ? 0.25 : 1.0;

  for (const signal of signals) {
    // High-confidence signals get full size; lower ones get scaled
    const confidenceFactor = signal.confidence / 10;
    adjustments[signal.symbol] = scaleFactor * (0.5 + confidenceFactor * 0.5);
  }

  return adjustments;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Assess portfolio risk and return a RiskAssessment with go/no-go decision.
 * Checks drawdown, VaR, correlation, and position sizing.
 */
export async function assessRisk(
  state: PortfolioState,
  newSignals: TradeSignal[],
): Promise<RiskAssessment> {
  await Promise.resolve();

  const { drawdown, totalValue, positions } = state;
  const existingSymbols = positions.map((p) => p.symbol);
  const positionCount = positions.length;

  // Determine risk mode
  let riskMode: RiskMode = 'normal';
  if (drawdown >= MAX_PORTFOLIO_DRAWDOWN) {
    riskMode = 'de-risk';
  } else if (drawdown >= MAX_PORTFOLIO_DRAWDOWN * 0.7) {
    riskMode = 'defensive';
  }

  // VaR
  const portfolioVar95 = calcVar95(totalValue, positionCount + newSignals.length);

  // Correlation check
  const correlationWarnings = checkCorrelation(existingSymbols, newSignals);

  // Position size violations
  const sizeViolations = newSignals.filter(
    (s) => (s.confidence / 10) > MAX_POSITION_PCT * 1.5,
  );

  // Decision: approve if drawdown is manageable
  const approved = riskMode !== 'de-risk' || newSignals.length === 0;

  // Position adjustments
  const positionAdjustments = calcPositionAdjustments(newSignals, riskMode, drawdown);

  const messages: string[] = [];
  if (riskMode === 'de-risk') messages.push(`DRAWDOWN ALERT: ${(drawdown * 100).toFixed(1)}% — de-risking portfolio`);
  if (riskMode === 'defensive') messages.push(`Defensive mode: drawdown ${(drawdown * 100).toFixed(1)}%`);
  if (sizeViolations.length > 0) messages.push(`Size adjustment applied to ${sizeViolations.map((s) => s.symbol).join(', ')}`);
  if (messages.length === 0) messages.push('Risk parameters within normal bounds');

  return {
    approved,
    riskMode,
    portfolioVar95: portfolioVar95 / totalValue, // as decimal
    currentDrawdown: drawdown,
    correlationWarnings,
    positionAdjustments,
    message: messages.join(' | '),
  };
}

// Export constants for use in trade-planner
export { HARD_STOP_PCT, MAX_POSITION_PCT };
