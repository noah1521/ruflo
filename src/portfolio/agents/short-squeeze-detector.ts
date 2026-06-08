import type { AgentFinding } from '../types.js';

// ─── Short squeeze types ──────────────────────────────────────────────────────

export interface ShortSqueezeSetup {
  symbol: string;
  shortInterestPct: number;   // % of float shorted, e.g. 0.25 = 25%
  daysTocover: number;        // short interest / avg daily volume
  shortInterestRatio: number; // SI / avg volume
  catalystPresent: boolean;   // has a fresh catalyst (from news-catalyst)
  borrowCost: number;         // annualized borrow rate %, higher = more pain
  squeezeScore: number;       // 1-10 composite score
  setupQuality: 'A' | 'B' | 'C';
  triggers: string[];         // what could ignite the squeeze
}

export interface ShortSqueezeBundle {
  setups: ShortSqueezeSetup[];
  findings: AgentFinding[];
  topSetups: ShortSqueezeSetup[];  // top 5 ranked by squeezeScore
}

// ─── Mock data generator ──────────────────────────────────────────────────────

// Symbols with GME-like characteristics
const HIGH_SI_SYMBOLS = new Set(['GME', 'AMC', 'BBBY', 'MEME', 'SPCE', 'CLOV', 'WISH', 'PLTR']);

function symbolSeed(symbol: string): number {
  return symbol.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
}

function seededRand(seed: number, offset: number): number {
  return Math.abs(Math.sin(seed * 19 + offset));
}

function generateMockSetup(symbol: string, catalystPresent: boolean): ShortSqueezeSetup {
  const seed = symbolSeed(symbol);
  const r = (o: number) => seededRand(seed, o);

  const isHighSI = HIGH_SI_SYMBOLS.has(symbol);
  const baseSI = isHighSI ? 0.25 + r(0) * 0.40 : r(0) * 0.22;
  const shortInterestPct = Math.round(baseSI * 1000) / 1000;

  const dtcBase = isHighSI ? 4 + r(1) * 8 : 0.5 + r(1) * 5;
  const daysTocover = Math.round(dtcBase * 10) / 10;

  const shortInterestRatio = Math.round((shortInterestPct / (0.005 + r(2) * 0.02)) * 100) / 100;
  const borrowCost = isHighSI ? 30 + r(3) * 120 : r(3) * 40;

  // Scoring algorithm
  let score = 0;
  const triggersList: string[] = [];

  if (shortInterestPct > 0.30) {
    score += 5;
    triggersList.push(`Very high SI ${(shortInterestPct * 100).toFixed(0)}% of float`);
  } else if (shortInterestPct > 0.20) {
    score += 3;
    triggersList.push(`High SI ${(shortInterestPct * 100).toFixed(0)}% of float`);
  }

  if (daysTocover > 7) {
    score += 3;
    triggersList.push(`High DTC ${daysTocover.toFixed(1)} days`);
  } else if (daysTocover > 3) {
    score += 2;
    triggersList.push(`Elevated DTC ${daysTocover.toFixed(1)} days`);
  }

  if (catalystPresent) {
    score += 3;
    triggersList.push('Fresh catalyst present');
  }

  if (borrowCost > 50) {
    score += 1;
    triggersList.push(`Painful borrow cost ${borrowCost.toFixed(0)}% p.a.`);
  }

  const squeezeScore = Math.min(10, Math.max(1, score));
  const setupQuality: 'A' | 'B' | 'C' =
    squeezeScore >= 8 ? 'A' : squeezeScore >= 5 ? 'B' : 'C';

  return {
    symbol,
    shortInterestPct,
    daysTocover,
    shortInterestRatio,
    catalystPresent,
    borrowCost: Math.round(borrowCost * 10) / 10,
    squeezeScore,
    setupQuality,
    triggers: triggersList,
  };
}

// ─── FMP fetch (optional) ─────────────────────────────────────────────────────

interface FmpShortData {
  symbol?: string;
  shortInterest?: number;
  shortInterestRatio?: number;
  daysTocover?: number;
  borrowCostRate?: number;
}

async function fetchFmpShortData(symbol: string, apiKey: string): Promise<FmpShortData | null> {
  try {
    const url = `https://financialmodelingprep.com/api/v4/short-float/${symbol}?apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as FmpShortData[] | FmpShortData;
    return Array.isArray(data) ? (data[0] ?? null) : data;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detects short squeeze setups — high short interest + catalyst = explosive upside potential.
 */
export async function detectShortSqueezes(
  symbols: string[],
  catalystSymbols: string[],
): Promise<ShortSqueezeBundle> {
  const apiKey = process.env['FMP_API_KEY'];
  const catalystSet = new Set(catalystSymbols);

  const setups: ShortSqueezeSetup[] = await Promise.all(
    symbols.map(async (symbol): Promise<ShortSqueezeSetup> => {
      const catalystPresent = catalystSet.has(symbol);

      if (apiKey) {
        try {
          const raw = await fetchFmpShortData(symbol, apiKey);
          if (raw) {
            const shortInterestPct = raw.shortInterestRatio
              ? Math.min(1, raw.shortInterestRatio / 100)
              : 0;
            const daysTocover = raw.daysTocover ?? 1;
            const borrowCost = raw.borrowCostRate ?? 0;

            let score = 0;
            const triggersList: string[] = [];

            if (shortInterestPct > 0.30) { score += 5; triggersList.push(`SI ${(shortInterestPct * 100).toFixed(0)}%`); }
            else if (shortInterestPct > 0.20) { score += 3; triggersList.push(`SI ${(shortInterestPct * 100).toFixed(0)}%`); }
            if (daysTocover > 7) { score += 3; triggersList.push(`DTC ${daysTocover.toFixed(1)}d`); }
            else if (daysTocover > 3) { score += 2; triggersList.push(`DTC ${daysTocover.toFixed(1)}d`); }
            if (catalystPresent) { score += 3; triggersList.push('Catalyst present'); }
            if (borrowCost > 50) { score += 1; triggersList.push(`Borrow ${borrowCost.toFixed(0)}%`); }

            const squeezeScore = Math.min(10, Math.max(1, score));
            return {
              symbol,
              shortInterestPct,
              daysTocover,
              shortInterestRatio: raw.shortInterestRatio ?? 0,
              catalystPresent,
              borrowCost,
              squeezeScore,
              setupQuality: squeezeScore >= 8 ? 'A' : squeezeScore >= 5 ? 'B' : 'C',
              triggers: triggersList,
            };
          }
        } catch {
          // fall through to mock
        }
      }

      return generateMockSetup(symbol, catalystPresent);
    }),
  );

  const findings: AgentFinding[] = setups
    .filter((s) => s.squeezeScore >= 4)
    .map((s) => ({
      agentId: 'short-squeeze-detector',
      symbol: s.symbol,
      signal: s.squeezeScore >= 7 ? 'buy' : 'watch',
      confidence: s.squeezeScore,
      reasoning: `Grade-${s.setupQuality} squeeze setup: ${s.triggers.join(', ')}`,
      data: {
        shortInterestPct: (s.shortInterestPct * 100).toFixed(1) + '%',
        daysTocover: s.daysTocover,
        borrowCost: s.borrowCost.toFixed(1) + '%',
        catalystPresent: s.catalystPresent,
        setupQuality: s.setupQuality,
      },
      timestamp: new Date().toISOString(),
    }));

  const topSetups = [...setups]
    .sort((a, b) => b.squeezeScore - a.squeezeScore)
    .slice(0, 5);

  return { setups, findings, topSetups };
}
