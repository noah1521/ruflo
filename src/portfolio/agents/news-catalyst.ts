import type { AgentFinding, TradeSignal } from '../types.js';
import {
  generateMockCatalysts,
  toSignal as catalystToSignal,
  type Catalyst,
} from '../strategies/catalyst.js';
import type { CandidateStock } from '../types.js';

export interface NewsBundle {
  catalysts: Catalyst[];
  signals: TradeSignal[];
  findings: AgentFinding[];
}

// ─── Mock stock price approximation ──────────────────────────────────────────
// In production this would come from a market data feed.

function mockStockData(symbol: string): CandidateStock {
  const seed = symbol.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const price = 50 + (seed % 450);
  const sma = price * 0.97;
  return {
    symbol,
    name: symbol,
    price,
    volume: 5_000_000,
    avgVolume: 3_000_000,
    volumeRatio: 1.67,
    marketCap: price * 500_000_000,
    sector: 'Technology',
    rsi: 55,
    sma20: sma,
    sma50: sma * 0.97,
    sma200: sma * 0.92,
    atr: price * 0.02,
    high52w: price * 1.15,
    low52w: price * 0.78,
    momentumScore: 6,
    technicalScore: 5,
    fundamentalScore: 5,
    sentimentScore: 5,
  };
}

// ─── News scoring ─────────────────────────────────────────────────────────────

function catalystToFinding(catalyst: Catalyst, signal: TradeSignal): AgentFinding {
  return {
    agentId: 'news-catalyst',
    symbol: catalyst.symbol,
    signal: signal.action,
    confidence: signal.confidence,
    reasoning: `${catalyst.type} (${catalyst.daysAgo}d ago): ${catalyst.headline}. Magnitude ${catalyst.magnitude}/10.`,
    data: {
      catalystType: catalyst.type,
      daysAgo: catalyst.daysAgo,
      magnitude: catalyst.magnitude,
      riskReward: signal.riskReward,
    },
    timestamp: new Date().toISOString(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze news catalysts for the given universe.
 * Returns catalysts, trade signals, and agent findings.
 * Falls back to mock data when live news feed is unavailable.
 */
export async function analyzeNews(universe: string): Promise<NewsBundle> {
  const symbols = universe.includes(',')
    ? universe.split(',').map((s) => s.trim())
    : ['NVDA', 'META', 'AAPL', 'MSFT', 'AMZN'];

  // Generate catalysts (mock — replace with live feed integration)
  const catalysts = generateMockCatalysts(symbols);

  const signals: TradeSignal[] = [];
  const findings: AgentFinding[] = [];

  for (const catalyst of catalysts) {
    const stock = mockStockData(catalyst.symbol);
    const signal = catalystToSignal(catalyst, stock);
    signals.push(signal);
    findings.push(catalystToFinding(catalyst, signal));
  }

  return { catalysts, signals, findings };
}

/**
 * Check if any catalyst is still actionable for a given symbol.
 */
export function hasFreshCatalyst(catalysts: Catalyst[], symbol: string): boolean {
  return catalysts.some(
    (c) => c.symbol === symbol && c.daysAgo <= 5,
  );
}
