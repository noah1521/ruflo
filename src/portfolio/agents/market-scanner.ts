import type { CandidateStock } from '../types.js';
import { score as momentumScore, passesFilter } from '../strategies/momentum.js';
import { fetchTopMovers, fetchLiveQuotes } from '../data/live-quotes.js';
import { FmpUnavailableError } from '../data/fmp-client.js';

// ─── Mock market data generator ───────────────────────────────────────────────
// Generates realistic-looking candidates when live data is unavailable.

const SP500_SAMPLE = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'AVGO', 'JPM', 'LLY',
  'UNH', 'V', 'XOM', 'MA', 'HD', 'PG', 'COST', 'JNJ', 'ABBV', 'CRM',
  'BAC', 'MRK', 'ORCL', 'AMD', 'ACN', 'CVX', 'ADBE', 'NFLX', 'TMO', 'PEP',
];

const SECTORS: Record<string, string> = {
  AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Technology', GOOGL: 'Technology',
  META: 'Technology', AMZN: 'Consumer Discretionary', TSLA: 'Consumer Discretionary',
  AVGO: 'Technology', JPM: 'Financials', LLY: 'Healthcare', UNH: 'Healthcare',
  V: 'Financials', XOM: 'Energy', MA: 'Financials', HD: 'Consumer Discretionary',
  PG: 'Consumer Staples', COST: 'Consumer Staples', JNJ: 'Healthcare',
  ABBV: 'Healthcare', CRM: 'Technology', BAC: 'Financials', MRK: 'Healthcare',
  ORCL: 'Technology', AMD: 'Technology', ACN: 'Technology', CVX: 'Energy',
  ADBE: 'Technology', NFLX: 'Technology', TMO: 'Healthcare', PEP: 'Consumer Staples',
};

function pseudoRandom(seed: number): number {
  // Deterministic "random" using seed so tests are reproducible
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function generateCandidate(symbol: string, idx: number): CandidateStock {
  const r = (offset: number) => pseudoRandom(symbol.charCodeAt(0) + idx * 7 + offset);

  const basePrice = 50 + r(0) * 450;       // $50–$500
  const trendBias = r(1) > 0.5 ? 1 : -1;  // trending up or down
  const sma200 = basePrice * (0.85 + r(2) * 0.1);
  const sma50 = sma200 * (1.0 + trendBias * r(3) * 0.08);
  const sma20 = sma50 * (1.0 + trendBias * r(4) * 0.05);
  const price = sma20 * (1.0 + r(5) * 0.04 * trendBias);
  const high52w = Math.max(price, sma50) * (1.0 + r(6) * 0.15);
  const low52w = Math.min(price, sma200) * (0.85 + r(7) * 0.1);
  const avgVolume = 1_000_000 + r(8) * 50_000_000;
  const volumeSpike = r(9) > 0.7 ? (2.0 + r(10) * 3.0) : (0.5 + r(11) * 1.5);
  const volume = avgVolume * volumeSpike;
  const rsi = 30 + r(12) * 45;

  return {
    symbol,
    name: symbol,
    price: Math.round(price * 100) / 100,
    volume: Math.round(volume),
    avgVolume: Math.round(avgVolume),
    volumeRatio: Math.round(volumeSpike * 10) / 10,
    marketCap: Math.round(price * (100_000_000 + r(13) * 2_000_000_000)),
    sector: SECTORS[symbol] ?? 'Technology',
    rsi: Math.round(rsi * 10) / 10,
    sma20: Math.round(sma20 * 100) / 100,
    sma50: Math.round(sma50 * 100) / 100,
    sma200: Math.round(sma200 * 100) / 100,
    atr: Math.round(price * (0.01 + r(14) * 0.03) * 100) / 100,
    high52w: Math.round(high52w * 100) / 100,
    low52w: Math.round(low52w * 100) / 100,
    momentumScore: 0,   // filled in below
    technicalScore: 0,
    fundamentalScore: 0,
    sentimentScore: 0,
  };
}

// ─── Universe resolution ──────────────────────────────────────────────────────

function resolveUniverse(universe: string): string[] {
  if (universe === 'SP500_NASDAQ' || universe === 'SP500') return SP500_SAMPLE;
  // Allow comma-separated custom symbol lists
  if (universe.includes(',')) return universe.split(',').map((s) => s.trim().toUpperCase());
  return SP500_SAMPLE;
}

// ─── Anomaly detection helpers ────────────────────────────────────────────────

function is52wHighBreakout(c: CandidateStock): boolean {
  return (c.high52w - c.price) / c.high52w <= 0.02;
}

function isVolumeAnomaly(c: CandidateStock): boolean {
  return c.volumeRatio >= 3.0;
}

function isSectorLeader(candidates: CandidateStock[], c: CandidateStock): boolean {
  const sectorPeers = candidates.filter((x) => x.sector === c.sector);
  if (sectorPeers.length < 2) return true;
  // Leader = top 2 by momentum score in sector
  const sorted = [...sectorPeers].sort((a, b) => b.momentumScore - a.momentumScore);
  return sorted.indexOf(c) < 2;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan the given universe for momentum, breakout, and volume-anomaly candidates.
 * Returns up to `limit` candidates sorted by momentum score descending.
 */
export async function scanMarket(universe: string, limit = 20): Promise<CandidateStock[]> {
  const symbols = resolveUniverse(universe);

  // ─── Attempt live data via FMP ─────────────────────────────────────────────
  let candidates: CandidateStock[];
  try {
    // For default universes, prefer gainers/most-active (broader signal set)
    const isDefault = universe === 'SP500_NASDAQ' || universe === 'SP500';
    const liveData = await Promise.race([
      isDefault ? fetchTopMovers() : fetchLiveQuotes({ symbols }),
      new Promise<CandidateStock[]>((resolve) => setTimeout(() => resolve([]), 7000)),
    ]);

    if (liveData.length > 0) {
      console.log('[market-scanner] Using live FMP data');
      candidates = liveData;
    } else {
      console.log('[market-scanner] Using mock data (FMP returned empty)');
      candidates = symbols.map((sym, idx) => generateCandidate(sym, idx));
    }
  } catch (err) {
    if (err instanceof FmpUnavailableError) {
      console.log('[market-scanner] Using mock data (FMP unavailable)');
    } else {
      console.warn('[market-scanner] FMP error, falling back to mock:', (err as Error).message);
    }
    candidates = symbols.map((sym, idx) => generateCandidate(sym, idx));
  }

  // Score each candidate
  for (const c of candidates) {
    c.momentumScore = momentumScore(c);
  }

  // Filter: must pass at least basic momentum filter OR be a volume anomaly
  const filtered = candidates.filter(
    (c) => passesFilter(c) || isVolumeAnomaly(c) || is52wHighBreakout(c),
  );

  // Annotate sector leadership
  const annotated = filtered.map((c) => ({
    ...c,
    technicalScore: is52wHighBreakout(c) ? Math.min(10, c.momentumScore + 1) : c.momentumScore,
  }));

  // Sort by composite score
  annotated.sort((a, b) => {
    const aScore = a.momentumScore + (isVolumeAnomaly(a) ? 2 : 0) + (is52wHighBreakout(a) ? 1 : 0);
    const bScore = b.momentumScore + (isVolumeAnomaly(b) ? 2 : 0) + (is52wHighBreakout(b) ? 1 : 0);
    return bScore - aScore;
  });

  return annotated.slice(0, limit);
}

/**
 * Identify sector leaders from a pre-scanned candidate list.
 */
export function findSectorLeaders(candidates: CandidateStock[]): CandidateStock[] {
  return candidates.filter((c) => isSectorLeader(candidates, c));
}
