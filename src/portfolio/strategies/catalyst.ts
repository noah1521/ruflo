import type { TradeSignal, CandidateStock } from '../types.js';

export type CatalystType =
  | 'sp500-inclusion'
  | 'earnings-beat'
  | 'analyst-upgrade'
  | 'ma-announcement'
  | 'index-rebalance'
  | 'short-squeeze'
  | 'buyback-announcement';

export interface Catalyst {
  type: CatalystType;
  symbol: string;
  headline: string;
  date: string;         // ISO date of catalyst event
  magnitude: number;    // estimated impact score 1–10
  daysAgo: number;      // how many days since catalyst
}

// Urgency decay: signal strength reduces over time after the catalyst
const URGENCY_HALF_LIFE: Record<CatalystType, number> = {
  'sp500-inclusion': 5,         // days until urgency halved
  'earnings-beat': 3,
  'analyst-upgrade': 7,
  'ma-announcement': 10,
  'index-rebalance': 4,
  'short-squeeze': 2,
  'buyback-announcement': 14,
};

// Base importance weight per catalyst type
const BASE_WEIGHT: Record<CatalystType, number> = {
  'sp500-inclusion': 9,
  'earnings-beat': 8,
  'analyst-upgrade': 5,
  'ma-announcement': 9,
  'index-rebalance': 7,
  'short-squeeze': 6,
  'buyback-announcement': 4,
};

/**
 * Score a catalyst event (1–10), accounting for time decay.
 */
export function score(catalyst: Catalyst): number {
  const base = BASE_WEIGHT[catalyst.type];
  const halfLife = URGENCY_HALF_LIFE[catalyst.type];
  // Exponential time decay
  const decay = Math.pow(0.5, catalyst.daysAgo / halfLife);
  const raw = base * decay * (catalyst.magnitude / 10);
  return Math.max(1, Math.min(10, Math.round(raw)));
}

/**
 * True if the catalyst is still actionable (urgency > 2).
 */
export function isActionable(catalyst: Catalyst): boolean {
  return score(catalyst) >= 3;
}

/**
 * Convert a catalyst + stock into a TradeSignal.
 */
export function toSignal(catalyst: Catalyst, stock: CandidateStock): TradeSignal {
  const catalystScore = score(catalyst);

  // Entry: same-day or next-day pullback to 8-day EMA approximation
  // Approximate 8-day EMA as price * 0.985 (slight pullback from gap)
  const entryLow = stock.price * 0.98;
  const entryHigh = stock.price * 1.01;

  const stopLoss = entryLow * 0.93;                          // 7% hard stop
  const risk = entryLow - stopLoss;
  const rrMultiple = catalyst.type === 'sp500-inclusion' ? 3.0 : 2.0;
  const target = entryLow + risk * rrMultiple;

  return {
    symbol: stock.symbol,
    action: 'buy',
    confidence: catalystScore,
    catalyst: `${catalyst.type}: ${catalyst.headline}`,
    riskReward: rrMultiple,
    strategy: catalyst.type === 'sp500-inclusion' ? 'index-inclusion' : 'catalyst',
    entryZone: [entryLow, entryHigh],
    stopLoss,
    target,
    agentSource: 'news-catalyst',
  };
}

/**
 * Mock catalyst generator for testing without live news feed.
 * Returns plausible catalysts for provided symbols.
 */
export function generateMockCatalysts(symbols: string[]): Catalyst[] {
  const types: CatalystType[] = [
    'earnings-beat',
    'analyst-upgrade',
    'sp500-inclusion',
    'buyback-announcement',
  ];

  return symbols.slice(0, 5).map((symbol, i) => ({
    type: types[i % types.length],
    symbol,
    headline: `${symbol}: ${types[i % types.length].replace(/-/g, ' ')} reported`,
    date: new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10),
    magnitude: 6 + (i % 4),
    daysAgo: i,
  }));
}
