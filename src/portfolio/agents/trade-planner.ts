import type { TradePlan, TradeSignal, WorkflowConfig } from '../types.js';
import { HARD_STOP_PCT } from './risk-manager.js';

// ─── ATR-based entry helpers ──────────────────────────────────────────────────

/**
 * Approximate ATR from signal data.
 * Uses entry zone width as ATR proxy; falls back to price * 2%.
 */
function estimateAtr(signal: TradeSignal): number {
  const [entryLow, entryHigh] = signal.entryZone;
  const spread = entryHigh - entryLow;
  if (spread > 0) return spread * 5; // zone spread ≈ 1-day range / 5
  return entryLow * 0.02;
}

// ─── Entry strategy selection ─────────────────────────────────────────────────

function determineEntryType(signal: TradeSignal): TradePlan['entryType'] {
  if (signal.strategy === 'momentum' || signal.strategy === 'index-inclusion') {
    // Momentum: buy breakout confirmation
    return 'breakout';
  }
  if (signal.strategy === 'technical-reversal' || signal.strategy === 'mean-reversion') {
    // Reversal: buy on pullback to EMA
    return 'pullback';
  }
  if (signal.strategy === 'catalyst' || signal.strategy === 'earnings-beat') {
    // Catalyst: market order same day to capture full move
    return 'market';
  }
  return 'pullback';
}

function calcEntryPrice(signal: TradeSignal, entryType: TradePlan['entryType']): number {
  const [entryLow, entryHigh] = signal.entryZone;
  switch (entryType) {
    case 'breakout':
      // Enter on breakout: slightly above the high of the entry zone
      return Math.round(entryHigh * 1.001 * 100) / 100;
    case 'pullback':
      // Enter on pullback: at or below zone low (approximate 8-day EMA)
      return Math.round(entryLow * 100) / 100;
    case 'market':
      // Market order: midpoint of entry zone
      return Math.round(((entryLow + entryHigh) / 2) * 100) / 100;
  }
}

// ─── Stop loss logic ──────────────────────────────────────────────────────────

function calcStop(entryPrice: number, signal: TradeSignal, atr: number): number {
  // Hard stop: 7% below entry
  const hardStop = entryPrice * (1 - HARD_STOP_PCT);
  // ATR stop: 2x ATR below entry
  const atrStop = entryPrice - 2 * atr;
  // Use the more conservative (higher) stop
  const stop = Math.max(hardStop, atrStop);
  // Never override explicit signal stop if it's tighter
  const signalStop = signal.stopLoss;
  return Math.round(Math.max(stop, signalStop > 0 ? signalStop : 0) * 100) / 100;
}

// ─── Profit target calculation ────────────────────────────────────────────────

function calcTarget(entryPrice: number, stopLoss: number, signal: TradeSignal): { target: number; rr: number } {
  const risk = entryPrice - stopLoss;
  if (risk <= 0) return { target: entryPrice * 1.15, rr: 2.0 };

  // Prefer 3:1 for high-confidence signals, 2:1 minimum
  const preferredRR = signal.confidence >= 7 ? 3.0 : 2.0;
  const target = entryPrice + risk * preferredRR;

  // Cap target at signal's explicit target if lower
  const cappedTarget = signal.target > 0 && signal.target < target ? signal.target : target;

  return {
    target: Math.round(cappedTarget * 100) / 100,
    rr: Math.round(((cappedTarget - entryPrice) / risk) * 10) / 10,
  };
}

// ─── Position sizing ──────────────────────────────────────────────────────────

function calcPositionSize(
  entryPrice: number,
  stopLoss: number,
  config: WorkflowConfig,
): { shares: number; dollarRisk: number; allocationPct: number } {
  const riskDollars = config.accountSize * config.riskPerTrade;
  const riskPerShare = entryPrice - stopLoss;
  if (riskPerShare <= 0) return { shares: 0, dollarRisk: 0, allocationPct: 0 };

  const shares = Math.floor(riskDollars / riskPerShare);
  const dollarAllocation = shares * entryPrice;
  const allocationPct = dollarAllocation / config.accountSize;

  // Hard cap at 10% of portfolio
  if (allocationPct > 0.10) {
    const maxShares = Math.floor((config.accountSize * 0.10) / entryPrice);
    const cappedAlloc = (maxShares * entryPrice) / config.accountSize;
    return {
      shares: maxShares,
      dollarRisk: maxShares * riskPerShare,
      allocationPct: Math.round(cappedAlloc * 1000) / 1000,
    };
  }

  return {
    shares,
    dollarRisk: Math.round(shares * riskPerShare * 100) / 100,
    allocationPct: Math.round(allocationPct * 1000) / 1000,
  };
}

// ─── Entry / exit condition strings ──────────────────────────────────────────

function buildEntryConditions(signal: TradeSignal, entryType: TradePlan['entryType']): string[] {
  const conditions: string[] = [];
  switch (entryType) {
    case 'breakout':
      conditions.push(`Price closes above $${signal.entryZone[1].toFixed(2)} with 1.5x+ average volume`);
      conditions.push('RSI between 50–70 on entry bar');
      break;
    case 'pullback':
      conditions.push(`Price pulls back to 8-day EMA (approx $${signal.entryZone[0].toFixed(2)})`);
      conditions.push('No new 10-day lows on pullback');
      break;
    case 'market':
      conditions.push('Enter at market open after catalyst confirmation');
      conditions.push('Confirm no gap-fill of >50% pre-market');
      break;
  }
  return conditions;
}

function buildExitConditions(entryPrice: number, stopLoss: number, target: number): string[] {
  return [
    `Hard stop: close below $${stopLoss.toFixed(2)} (7% loss)`,
    `Trail stop to breakeven after +10% gain ($${(entryPrice * 1.10).toFixed(2)})`,
    `Primary target: $${target.toFixed(2)}`,
    'Close below 10-day low — trend broken',
  ];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert trade signals into concrete, actionable trade plans.
 * Each plan includes entry price, stop, target, sizing, and conditions.
 */
export async function buildTradePlans(
  signals: TradeSignal[],
  config: WorkflowConfig,
): Promise<TradePlan[]> {
  await Promise.resolve();

  const plans: TradePlan[] = [];

  for (const signal of signals) {
    if (signal.action !== 'buy' && signal.action !== 'watch') continue;

    const entryType = determineEntryType(signal);
    const entryPrice = calcEntryPrice(signal, entryType);
    const atr = estimateAtr(signal);
    const stopLoss = calcStop(entryPrice, signal, atr);
    const { target, rr } = calcTarget(entryPrice, stopLoss, signal);
    const { shares, dollarRisk, allocationPct } = calcPositionSize(entryPrice, stopLoss, config);

    plans.push({
      symbol: signal.symbol,
      strategy: signal.strategy,
      action: signal.action,
      entryPrice,
      entryType,
      stopLoss,
      target,
      riskReward: rr,
      positionSize: shares,
      dollarRisk,
      allocationPct,
      compositeScore: signal.confidence, // will be updated by coordinator
      catalysts: [signal.catalyst],
      agentVotes: [],
      entryConditions: buildEntryConditions(signal, entryType),
      exitConditions: buildExitConditions(entryPrice, stopLoss, target),
    });
  }

  // Sort by confidence descending, then by risk/reward
  plans.sort((a, b) => b.compositeScore - a.compositeScore || b.riskReward - a.riskReward);

  return plans.slice(0, config.maxPositions);
}
