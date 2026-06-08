import type { AgentFinding, TradeSignal } from '../types.js';
import {
  generateMockCatalysts,
  toSignal as catalystToSignal,
  type Catalyst,
  type CatalystType,
} from '../strategies/catalyst.js';
import type { CandidateStock } from '../types.js';
import { BigdataClient, BigdataUnavailableError } from '../data/bigdata-client.js';

export interface NewsBundle {
  catalysts: Catalyst[];
  signals: TradeSignal[];
  findings: AgentFinding[];
}

// ─── Mock stock price approximation ──────────────────────────────────────────

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

// ─── Bigdata.com result → Catalyst ───────────────────────────────────────────

const CATALYST_KEYWORDS: Record<CatalystType, string[]> = {
  earnings_beat: ['earnings beat', 'eps beat', 'revenue beat', 'topped estimates', 'beat expectations'],
  analyst_upgrade: ['upgrade', 'price target raised', 'outperform', 'buy rating', 'strong buy'],
  index_inclusion: ['s&p 500', 'index inclusion', 'added to', 'joining the'],
  merger_acquisition: ['merger', 'acquisition', 'takeover', 'buyout', 'deal'],
  fda_approval: ['fda approved', 'fda approval', 'cleared', 'pdufa'],
  strategic_partnership: ['partnership', 'collaboration', 'strategic agreement', 'invested in'],
  government_contract: ['government contract', 'defense contract', 'awarded contract', 'dod'],
  short_squeeze: ['short squeeze', 'short interest', 'heavily shorted'],
};

function classifyCatalyst(headline: string, text: string): CatalystType | null {
  const combined = (headline + ' ' + text).toLowerCase();
  for (const [type, keywords] of Object.entries(CATALYST_KEYWORDS)) {
    if (keywords.some((kw) => combined.includes(kw))) {
      return type as CatalystType;
    }
  }
  return null;
}

function bigdataResultToCatalyst(
  result: { headline: string; timestamp: string; chunks: { text: string }[]; url: string },
  symbol: string,
): Catalyst | null {
  const text = result.chunks.map((c) => c.text).join(' ');
  const type = classifyCatalyst(result.headline, text);
  if (!type) return null;

  const pubDate = new Date(result.timestamp);
  const daysAgo = Math.floor((Date.now() - pubDate.getTime()) / 86_400_000);

  const magnitudeMap: Record<CatalystType, number> = {
    earnings_beat: 8, analyst_upgrade: 6, index_inclusion: 9,
    merger_acquisition: 10, fda_approval: 9, strategic_partnership: 7,
    government_contract: 6, short_squeeze: 7,
  };

  return {
    symbol,
    type,
    headline: result.headline,
    magnitude: magnitudeMap[type] ?? 6,
    daysAgo,
    source: 'bigdata',
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
 * Uses Bigdata.com live news when BIGDATA_API_KEY is set; falls back to mock.
 */
export async function analyzeNews(universe: string): Promise<NewsBundle> {
  const symbols = universe.includes(',')
    ? universe.split(',').map((s) => s.trim())
    : ['NVDA', 'META', 'AAPL', 'MSFT', 'AMZN', 'INTC', 'MRVL', 'AMD', 'MU', 'AVGO'];

  let catalysts: Catalyst[];

  try {
    const client = new BigdataClient();
    const results = await client.searchCatalysts(symbols, 7);
    console.log(`[news-catalyst] Using live Bigdata.com data (${results.length} results)`);

    const liveCatalysts: Catalyst[] = [];
    for (const result of results) {
      // Try to match result to a symbol
      for (const symbol of symbols) {
        const combined = (result.headline + result.chunks.map((c) => c.text).join(' ')).toUpperCase();
        if (combined.includes(symbol)) {
          const cat = bigdataResultToCatalyst(result, symbol);
          if (cat) liveCatalysts.push(cat);
          break;
        }
      }
    }

    // Supplement with mock if live returned few results
    catalysts = liveCatalysts.length >= 3
      ? liveCatalysts
      : [...liveCatalysts, ...generateMockCatalysts(symbols).slice(0, 5 - liveCatalysts.length)];

  } catch (err) {
    if (err instanceof BigdataUnavailableError) {
      console.log('[news-catalyst] Mock mode (BIGDATA_API_KEY not set)');
    } else {
      console.warn('[news-catalyst] Bigdata.com error, falling back to mock:', (err as Error).message);
    }
    catalysts = generateMockCatalysts(symbols);
  }

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
