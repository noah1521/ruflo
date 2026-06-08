/**
 * Unified quote fetcher.
 * Attempts FMP live data first; falls back to mock generators if FMP is unavailable.
 */

import type { CandidateStock } from '../types.js';
import { FmpClient, FmpUnavailableError } from './fmp-client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiveQuoteOptions {
  symbols: string[];
  includeTechnicals?: boolean;
}

export interface MacroData {
  vix: number;
  vixChange1d: number;
  tenYearYield: number;
  twoYearYield: number;
  spxChange1d: number;
  topSectors: string[];
  bottomSectors: string[];
}

// ─── FMP → CandidateStock mapper ──────────────────────────────────────────────

function fmpQuoteToCandidateStock(q: {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
  changesPercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  yearHigh: number;
  yearLow: number;
  exchange: string;
}): CandidateStock {
  const volumeRatio =
    q.avgVolume > 0 ? Math.round((q.volume / q.avgVolume) * 10) / 10 : 1;

  // Approximate moving averages from available data
  // (FMP quote does not include SMAs — those come from indicator endpoints)
  const sma20Approx = q.price * 0.97;
  const sma50Approx = sma20Approx * 0.97;
  const sma200Approx = sma50Approx * 0.95;

  return {
    symbol: q.symbol,
    name: q.name || q.symbol,
    price: q.price,
    volume: q.volume,
    avgVolume: q.avgVolume,
    volumeRatio,
    marketCap: q.marketCap,
    sector: 'Unknown',          // FMP quote doesn't include sector
    rsi: 50,                    // placeholder — overwritten by technical-analyst if live indicators fetched
    sma20: sma20Approx,
    sma50: sma50Approx,
    sma200: sma200Approx,
    atr: Math.abs(q.dayHigh - q.dayLow),
    high52w: q.yearHigh,
    low52w: q.yearLow,
    momentumScore: 0,
    technicalScore: 0,
    fundamentalScore: 0,
    sentimentScore: 0,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch live quotes for the given symbols from FMP.
 * Falls back to mock CandidateStock list if FMP is unavailable.
 */
export async function fetchLiveQuotes(
  options: LiveQuoteOptions,
): Promise<CandidateStock[]> {
  if (options.symbols.length === 0) return [];

  let client: FmpClient;
  try {
    client = new FmpClient();
  } catch (err) {
    if (err instanceof FmpUnavailableError) return [];
    throw err;
  }

  const quotes = await client.getBatchQuotes(options.symbols);
  return quotes.map(fmpQuoteToCandidateStock);
}

/**
 * Fetch top gainers and most-active from FMP.
 * Falls back to mock generator if FMP is unavailable.
 */
export async function fetchTopMovers(): Promise<CandidateStock[]> {
  let client: FmpClient;
  try {
    client = new FmpClient();
  } catch {
    return [];
  }

  const [gainers, active] = await Promise.all([
    client.getBiggestGainers(),
    client.getMostActive(),
  ]);

  // Deduplicate by symbol
  const seen = new Set<string>();
  const combined: typeof gainers = [];
  for (const item of [...gainers, ...active]) {
    if (!seen.has(item.symbol)) {
      seen.add(item.symbol);
      combined.push(item);
    }
  }

  if (combined.length === 0) return [];

  return combined.map((g) => ({
    symbol: g.symbol,
    name: g.name || g.symbol,
    price: g.price,
    volume: 0,
    avgVolume: 0,
    volumeRatio: 1,
    marketCap: 0,
    sector: 'Unknown',
    rsi: 50,
    sma20: g.price * 0.97,
    sma50: g.price * 0.94,
    sma200: g.price * 0.90,
    atr: g.price * 0.02,
    high52w: g.price * 1.10,
    low52w: g.price * 0.75,
    momentumScore: 0,
    technicalScore: 0,
    fundamentalScore: 0,
    sentimentScore: 0,
  }));
}

// ─── Sector performance symbols ───────────────────────────────────────────────

const SECTOR_ETFS: Record<string, string> = {
  Technology: 'XLK',
  Healthcare: 'XLV',
  Financials: 'XLF',
  Energy: 'XLE',
  'Consumer Discretionary': 'XLY',
  'Consumer Staples': 'XLP',
  Industrials: 'XLI',
  Materials: 'XLB',
  Utilities: 'XLU',
  'Real Estate': 'XLRE',
  'Communication Services': 'XLC',
};

/**
 * Fetch macro data: VIX level, yield curve, sector performance.
 * Uses FMP quotes for ^VIX, ^TNX, ^IRX, SPY, and sector ETFs.
 * Returns conservative mock values if FMP is unavailable.
 */
export async function fetchMacroData(): Promise<MacroData> {
  let client: FmpClient;
  try {
    client = new FmpClient();
  } catch {
    // Mock fallback
    return {
      vix: 18.5,
      vixChange1d: -1.6,
      tenYearYield: 4.35,
      twoYearYield: 4.10,
      spxChange1d: 0.3,
      topSectors: ['Technology', 'Consumer Discretionary'],
      bottomSectors: ['Energy', 'Utilities'],
    };
  }

  // Single batch call to reduce latency: ^VIX, ^TNX, ^IRX, SPY + top sector ETFs
  const allMacroSymbols = ['^VIX', '^TNX', '^IRX', 'SPY', 'XLK', 'XLV', 'XLF', 'XLE', 'XLY', 'XLP', 'XLI'];
  const allQuotes = await client.getBatchQuotes(allMacroSymbols);
  const macroQuotes = allQuotes.filter((q) => ['^VIX', '^TNX', '^IRX', 'SPY'].includes(q.symbol));
  const sectorQuotes = allQuotes.filter((q) => !macroQuotes.includes(q));

  const bySymbol = new Map(macroQuotes.map((q) => [q.symbol, q]));

  const vixQuote = bySymbol.get('^VIX');
  const tnxQuote = bySymbol.get('^TNX');
  const irxQuote = bySymbol.get('^IRX');
  const spyQuote = bySymbol.get('SPY');

  // Sector performance: sort by 1-day change
  const sectorByEtf = new Map(sectorQuotes.map((q) => [q.symbol, q]));
  const sectorChanges: Array<{ sector: string; change: number }> = [];
  for (const [sector, etf] of Object.entries(SECTOR_ETFS)) {
    const q = sectorByEtf.get(etf);
    if (q) {
      sectorChanges.push({ sector, change: q.changesPercentage ?? 0 });
    }
  }
  sectorChanges.sort((a, b) => b.change - a.change);

  const topSectors = sectorChanges.slice(0, 3).map((s) => s.sector);
  const bottomSectors = sectorChanges.slice(-3).map((s) => s.sector);

  return {
    vix: vixQuote?.price ?? 18.5,
    vixChange1d: vixQuote?.changesPercentage ?? 0,
    tenYearYield: tnxQuote?.price ?? 4.35,
    twoYearYield: irxQuote?.price ?? 4.10,
    spxChange1d: spyQuote?.changesPercentage ?? 0,
    topSectors: topSectors.length > 0 ? topSectors : ['Technology', 'Consumer Discretionary'],
    bottomSectors: bottomSectors.length > 0 ? bottomSectors : ['Energy', 'Utilities'],
  };
}
