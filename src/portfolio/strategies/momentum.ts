import type { CandidateStock, TradeSignal } from '../types.js';

export interface MomentumFilters {
  minRsi: number;
  maxRsi: number;
  minVolumeRatio: number;
  requireAbove50Sma: boolean;
  requireAbove200Sma: boolean;
}

const DEFAULT_FILTERS: MomentumFilters = {
  minRsi: 50,
  maxRsi: 70,
  minVolumeRatio: 2.0,
  requireAbove50Sma: true,
  requireAbove200Sma: false,
};

/**
 * Score a candidate stock on momentum quality (1–10).
 * Higher score = stronger momentum setup.
 */
export function score(candidate: CandidateStock, filters: MomentumFilters = DEFAULT_FILTERS): number {
  let points = 0;

  // Price relative to moving averages (max 3 pts)
  if (candidate.price > candidate.sma20) points += 1;
  if (candidate.price > candidate.sma50) points += 1;
  if (candidate.price > candidate.sma200) points += 1;

  // Volume breakout quality (max 2 pts)
  if (candidate.volumeRatio >= filters.minVolumeRatio) points += 1;
  if (candidate.volumeRatio >= 3.0) points += 1;

  // RSI in sweet spot — not overbought, has momentum (max 2 pts)
  if (candidate.rsi >= filters.minRsi && candidate.rsi <= filters.maxRsi) points += 2;
  else if (candidate.rsi >= 40 && candidate.rsi < filters.minRsi) points += 1;

  // Near 52-week high breakout (max 2 pts)
  const distanceFromHigh = (candidate.high52w - candidate.price) / candidate.high52w;
  if (distanceFromHigh <= 0.02) points += 2;       // within 2% of 52w high
  else if (distanceFromHigh <= 0.05) points += 1;  // within 5%

  // Penalize thin markets
  if (candidate.marketCap < 500_000_000) points -= 1;

  return Math.max(1, Math.min(10, points));
}

/**
 * Returns true if candidate passes basic momentum filters.
 */
export function passesFilter(candidate: CandidateStock, filters: MomentumFilters = DEFAULT_FILTERS): boolean {
  if (filters.requireAbove50Sma && candidate.price < candidate.sma50) return false;
  if (filters.requireAbove200Sma && candidate.price < candidate.sma200) return false;
  if (candidate.volumeRatio < filters.minVolumeRatio) return false;
  return true;
}

/**
 * Convert a scored candidate into a TradeSignal.
 */
export function toSignal(candidate: CandidateStock, momentumScore: number): TradeSignal {
  // Entry zone: current price to 0.5% above (breakout confirmation)
  const entryLow = candidate.price;
  const entryHigh = candidate.price * 1.005;

  // Stop: 7% below entry or below 20-day SMA, whichever is tighter
  const hardStop = entryLow * 0.93;
  const smaStop = candidate.sma20 * 0.98;
  const stopLoss = Math.max(hardStop, smaStop);

  // Target: 2:1 minimum R:R
  const risk = entryLow - stopLoss;
  const target = entryLow + risk * 2.5;

  return {
    symbol: candidate.symbol,
    action: 'buy',
    confidence: momentumScore,
    catalyst: `Momentum breakout: ${candidate.volumeRatio.toFixed(1)}x volume, RSI ${candidate.rsi.toFixed(0)}`,
    riskReward: 2.5,
    strategy: 'momentum',
    entryZone: [entryLow, entryHigh],
    stopLoss,
    target,
    agentSource: 'market-scanner',
  };
}

/**
 * Simple moving-average crossover strategy for backtesting baseline.
 * Returns 1 (buy signal), -1 (sell signal), 0 (neutral).
 */
export function smaCrossoverSignal(prices: number[], fastPeriod = 10, slowPeriod = 20): 0 | 1 | -1 {
  if (prices.length < slowPeriod + 1) return 0;

  const calcSma = (arr: number[], period: number, offset = 0): number => {
    const slice = arr.slice(arr.length - period - offset, arr.length - offset);
    return slice.reduce((s, v) => s + v, 0) / period;
  };

  const fastNow = calcSma(prices, fastPeriod);
  const slowNow = calcSma(prices, slowPeriod);
  const fastPrev = calcSma(prices, fastPeriod, 1);
  const slowPrev = calcSma(prices, slowPeriod, 1);

  if (fastPrev <= slowPrev && fastNow > slowNow) return 1;   // golden cross
  if (fastPrev >= slowPrev && fastNow < slowNow) return -1;  // death cross
  return 0;
}
