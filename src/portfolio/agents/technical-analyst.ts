import type { AgentFinding, CandidateStock } from '../types.js';
import { scanMarket } from './market-scanner.js';

// ─── Indicator helpers ────────────────────────────────────────────────────────

function calcRsi(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcMacd(prices: number[]): { macd: number; signal: number; histogram: number } {
  if (prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };

  const ema = (data: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const result: number[] = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  };

  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  const macdLine = ema12.map((v, i) => v - (ema26[i] ?? 0));
  const signalLine = ema(macdLine, 9);
  const lastMacd = macdLine[macdLine.length - 1] ?? 0;
  const lastSignal = signalLine[signalLine.length - 1] ?? 0;

  return {
    macd: lastMacd,
    signal: lastSignal,
    histogram: lastMacd - lastSignal,
  };
}

// ─── Support / resistance ─────────────────────────────────────────────────────

interface Level {
  price: number;
  type: 'support' | 'resistance';
  strength: number;  // 1–3
}

function findLevels(candidate: CandidateStock): Level[] {
  const levels: Level[] = [];
  levels.push({ price: candidate.sma20, type: 'support', strength: 1 });
  levels.push({ price: candidate.sma50, type: 'support', strength: 2 });
  levels.push({ price: candidate.sma200, type: 'support', strength: 3 });
  levels.push({ price: candidate.high52w, type: 'resistance', strength: 3 });
  return levels;
}

// ─── Technical scoring ────────────────────────────────────────────────────────

function calcTechnicalScore(candidate: CandidateStock): { score: number; notes: string[] } {
  let points = 0;
  const notes: string[] = [];

  // Trend alignment (3 pts)
  if (candidate.price > candidate.sma20) { points++; notes.push('Price > 20 SMA'); }
  if (candidate.price > candidate.sma50) { points++; notes.push('Price > 50 SMA'); }
  if (candidate.price > candidate.sma200) { points++; notes.push('Price > 200 SMA — confirmed uptrend'); }

  // RSI zone (2 pts)
  if (candidate.rsi >= 50 && candidate.rsi < 70) {
    points += 2;
    notes.push(`RSI ${candidate.rsi.toFixed(0)} — bullish momentum zone`);
  } else if (candidate.rsi < 30) {
    points += 1;
    notes.push(`RSI ${candidate.rsi.toFixed(0)} — oversold, potential reversal`);
  } else if (candidate.rsi >= 70) {
    points -= 1;
    notes.push(`RSI ${candidate.rsi.toFixed(0)} — overbought caution`);
  }

  // Volume (2 pts)
  if (candidate.volumeRatio >= 2.0) { points++; notes.push(`Volume ${candidate.volumeRatio.toFixed(1)}x avg`); }
  if (candidate.volumeRatio >= 3.0) { points++; notes.push('Extreme volume spike'); }

  // Breakout proximity (2 pts)
  const pctFromHigh = (candidate.high52w - candidate.price) / candidate.high52w;
  if (pctFromHigh <= 0.01) { points += 2; notes.push('At 52-week high — breakout'); }
  else if (pctFromHigh <= 0.05) { points++; notes.push('Near 52-week high'); }

  // Penalize small caps
  if (candidate.marketCap < 1_000_000_000) { points--; notes.push('Micro/small-cap penalty'); }

  return { score: Math.max(1, Math.min(10, points)), notes };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run technical analysis on the universe and return agent findings.
 * Each finding represents a per-symbol technical score with supporting notes.
 */
export async function analyzeTechnicals(universe: string): Promise<AgentFinding[]> {
  const candidates = await scanMarket(universe, 30);
  const findings: AgentFinding[] = [];

  for (const candidate of candidates) {
    const { score, notes } = calcTechnicalScore(candidate);
    const levels = findLevels(candidate);
    const action = score >= 7 ? 'buy' : score >= 5 ? 'watch' : 'hold';

    findings.push({
      agentId: 'technical-analyst',
      symbol: candidate.symbol,
      signal: action,
      confidence: score,
      reasoning: notes.join('; '),
      data: {
        rsi: candidate.rsi,
        sma20: candidate.sma20,
        sma50: candidate.sma50,
        sma200: candidate.sma200,
        volumeRatio: candidate.volumeRatio,
        levels,
        distFromHigh52w: ((candidate.high52w - candidate.price) / candidate.high52w * 100).toFixed(1) + '%',
      },
      timestamp: new Date().toISOString(),
    });
  }

  return findings;
}

/**
 * Single-symbol technical analysis for ad-hoc queries.
 */
export function analyzeSingleTechnical(candidate: CandidateStock): AgentFinding {
  const { score, notes } = calcTechnicalScore(candidate);
  return {
    agentId: 'technical-analyst',
    symbol: candidate.symbol,
    signal: score >= 7 ? 'buy' : score >= 5 ? 'watch' : 'hold',
    confidence: score,
    reasoning: notes.join('; '),
    data: { rsi: candidate.rsi, volumeRatio: candidate.volumeRatio },
    timestamp: new Date().toISOString(),
  };
}

// Export indicator helpers for use in backtester
export { calcRsi, calcMacd };
