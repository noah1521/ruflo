import type { CandidateStock, TradeSignal } from '../types.js';

// ─── Candlestick pattern detection ───────────────────────────────────────────

export interface Bar {
  open: number;
  high: number;
  close: number;
  low: number;
}

/**
 * Detect a bullish engulfing candle pattern.
 * Current bar's body fully engulfs the prior bar's body.
 */
export function isBullishEngulfing(prev: Bar, curr: Bar): boolean {
  const prevBearish = prev.close < prev.open;
  const currBullish = curr.close > curr.open;
  return (
    prevBearish &&
    currBullish &&
    curr.open < prev.close &&
    curr.close > prev.open
  );
}

/**
 * Detect a hammer candle:
 * Lower shadow >= 2x body, small upper shadow.
 */
export function isHammer(bar: Bar): boolean {
  const body = Math.abs(bar.close - bar.open);
  const lowerShadow = Math.min(bar.open, bar.close) - bar.low;
  const upperShadow = bar.high - Math.max(bar.open, bar.close);
  if (body === 0) return false;
  return lowerShadow >= 2 * body && upperShadow <= 0.5 * body;
}

// ─── Reversal scoring ────────────────────────────────────────────────────────

/**
 * Score a technical reversal setup (1–10).
 *
 * Criteria:
 * - RSI < 30 (oversold) → +3 pts
 * - Price at 20-day low in uptrend (price > 200 SMA) → +2 pts
 * - Volume spike on reversal day → +2 pts
 * - Near-term support (sma50 proximity) → +1 pt
 * - Market-cap filter → penalty for micro-cap
 */
export function score(candidate: CandidateStock): number {
  let points = 0;

  // Primary oversold condition
  if (candidate.rsi < 30) {
    points += 3;
  } else if (candidate.rsi < 40) {
    points += 1;
  }

  // Uptrend confirmation: price above 200 SMA
  if (candidate.price > candidate.sma200) {
    points += 2;
  }

  // Near 20-day low
  const distFromLow = (candidate.price - candidate.low52w) / candidate.low52w;
  if (distFromLow <= 0.05) {
    points += 2; // at recent low
  } else if (distFromLow <= 0.10) {
    points += 1;
  }

  // Volume: reversal is more valid with volume
  if (candidate.volumeRatio >= 1.5) {
    points += 1;
  }

  // SMA50 as support: price above sma50 is preferred even in oversold
  if (candidate.price > candidate.sma50) {
    points += 1;
  } else {
    // Below sma50 in oversold — less reliable
    points -= 1;
  }

  // Market-cap penalty for illiquid micro-caps
  if (candidate.marketCap < 1_000_000_000) {
    points -= 1;
  }

  return Math.max(1, Math.min(10, points));
}

/**
 * Returns true if the stock passes the minimum reversal filter.
 * RSI must be under 40 AND stock must be in a longer-term uptrend.
 */
export function passesFilter(candidate: CandidateStock): boolean {
  return candidate.rsi < 40 && candidate.price > candidate.sma200;
}

/**
 * Convert an oversold candidate into a technical-reversal TradeSignal.
 * Target: return to the 20-day SMA (proxy for mean reversion target).
 */
export function toSignal(candidate: CandidateStock, reversalScore: number): TradeSignal {
  // Entry: at current price (oversold — enter on confirmation bar)
  const entryLow = candidate.price;
  const entryHigh = candidate.price * 1.01; // 1% above for limit order

  // Stop: below recent low (2% below current price as proxy)
  const hardStop = entryLow * (1 - 0.07);
  const stopLoss = Math.round(Math.max(hardStop, candidate.low52w * 0.98) * 100) / 100;

  // Target: mean reversion to 20-day SMA
  const target = candidate.sma20;
  const risk = entryLow - stopLoss;
  const rr = risk > 0 ? Math.round(((target - entryLow) / risk) * 10) / 10 : 2.0;

  return {
    symbol: candidate.symbol,
    action: rr >= 1.5 ? 'buy' : 'watch',
    confidence: reversalScore,
    catalyst: `Technical reversal: RSI ${candidate.rsi.toFixed(0)}, near 52w low, uptrend intact (price > 200 SMA)`,
    riskReward: Math.max(rr, 1.5),
    strategy: 'technical-reversal',
    entryZone: [entryLow, entryHigh],
    stopLoss,
    target: Math.round(target * 100) / 100,
    agentSource: 'technical-analyst',
  };
}
