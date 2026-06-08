import type { AgentFinding } from '../types.js';

// ─── Options flow types ───────────────────────────────────────────────────────

export interface OptionsFlowSignal {
  symbol: string;
  type: 'unusual_calls' | 'unusual_puts' | 'large_call_sweep' | 'large_put_sweep' | 'call_wall' | 'put_wall';
  strikePrice: number;
  expiry: string;           // e.g. "2026-06-20"
  premium: number;          // total dollar premium (e.g. 2_500_000 = $2.5M)
  openInterest: number;
  impliedVolatility: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  urgency: number;          // 1-10, higher = more unusual vs avg
  daysToExpiry: number;
}

export interface OptionsFlowBundle {
  signals: OptionsFlowSignal[];
  findings: AgentFinding[];
  topBullishSymbols: string[];
  topBearishSymbols: string[];
}

// ─── Mock generator ───────────────────────────────────────────────────────────

function seededRand(seed: number, offset: number): number {
  return Math.abs(Math.sin(seed * 17 + offset));
}

function symbolSeed(symbol: string): number {
  return symbol.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
}

function generateMockExpiry(daysOut: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOut);
  // Snap to next Friday
  const day = d.getDay();
  const daysToFriday = day <= 5 ? 5 - day : 6;
  d.setDate(d.getDate() + daysToFriday);
  return d.toISOString().slice(0, 10);
}

function generateSignalsForSymbol(symbol: string): OptionsFlowSignal[] {
  const seed = symbolSeed(symbol);
  const r = (o: number) => seededRand(seed, o);
  const signals: OptionsFlowSignal[] = [];

  // ~30% of symbols have unusual call activity
  const hasUnusualCalls = r(0) < 0.30;
  // ~15% have unusual puts
  const hasUnusualPuts = r(1) < 0.15;

  const price = 50 + r(2) * 950; // mock underlying price

  if (hasUnusualCalls) {
    const daysToExpiry = Math.round(7 + r(3) * 60);
    const premium = 100_000 + r(4) * 4_900_000;
    const openInterest = Math.round(500 + r(5) * 9500);
    const iv = 0.20 + r(6) * 0.80;

    // Urgency scoring
    let urgency = 4;
    if (premium > 1_000_000 && daysToExpiry < 30) urgency = 8 + Math.round(r(7) * 2);
    else if (premium > 250_000) urgency = 5 + Math.round(r(8) * 2);

    signals.push({
      symbol,
      type: premium > 1_000_000 ? 'large_call_sweep' : 'unusual_calls',
      strikePrice: Math.round(price * (1 + r(9) * 0.15) * 100) / 100,
      expiry: generateMockExpiry(daysToExpiry),
      premium,
      openInterest,
      impliedVolatility: Math.round(iv * 1000) / 1000,
      sentiment: 'bullish',
      urgency: Math.min(10, urgency),
      daysToExpiry,
    });
  }

  if (hasUnusualPuts) {
    const daysToExpiry = Math.round(14 + r(10) * 45);
    const premium = 50_000 + r(11) * 2_000_000;
    const openInterest = Math.round(200 + r(12) * 5000);
    const iv = 0.25 + r(13) * 0.75;

    let urgency = 3;
    if (premium > 1_000_000) urgency = 7 + Math.round(r(14) * 2);
    else if (premium > 250_000) urgency = 5 + Math.round(r(15) * 1);

    signals.push({
      symbol,
      type: premium > 500_000 ? 'large_put_sweep' : 'unusual_puts',
      strikePrice: Math.round(price * (1 - r(16) * 0.15) * 100) / 100,
      expiry: generateMockExpiry(daysToExpiry),
      premium,
      openInterest,
      impliedVolatility: Math.round(iv * 1000) / 1000,
      sentiment: 'bearish',
      urgency: Math.min(10, urgency),
      daysToExpiry,
    });
  }

  return signals;
}

function formatPremium(premium: number): string {
  if (premium >= 1_000_000) return `$${(premium / 1_000_000).toFixed(1)}M`;
  if (premium >= 1_000) return `$${(premium / 1_000).toFixed(0)}k`;
  return `$${premium.toFixed(0)}`;
}

// ─── FMP fetch (optional) ─────────────────────────────────────────────────────

async function fetchFmpOptionsFlow(symbol: string, apiKey: string): Promise<OptionsFlowSignal[]> {
  const url = `https://financialmodelingprep.com/api/v4/options/unusual-activity/${symbol}?apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json() as Array<{
    symbol?: string;
    type?: string;
    strike?: number;
    expiry?: string;
    premium?: number;
    openInterest?: number;
    impliedVolatility?: number;
    daysToExpiry?: number;
  }>;
  if (!Array.isArray(data) || data.length === 0) return [];

  return data.slice(0, 3).map((row) => {
    const isCalls = (row.type ?? '').toLowerCase().includes('call');
    const premium = row.premium ?? 0;
    const dte = row.daysToExpiry ?? 30;

    let urgency = 3;
    if (premium > 1_000_000 && dte < 30) urgency = 9;
    else if (premium > 250_000) urgency = 6;

    return {
      symbol,
      type: isCalls
        ? (premium > 1_000_000 ? 'large_call_sweep' : 'unusual_calls')
        : (premium > 500_000 ? 'large_put_sweep' : 'unusual_puts'),
      strikePrice: row.strike ?? 0,
      expiry: row.expiry ?? '',
      premium,
      openInterest: row.openInterest ?? 0,
      impliedVolatility: row.impliedVolatility ?? 0,
      sentiment: isCalls ? 'bullish' : 'bearish',
      urgency,
      daysToExpiry: dte,
    } satisfies OptionsFlowSignal;
  });
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function symbolScore(signals: OptionsFlowSignal[]): number {
  let score = 0;
  for (const s of signals) {
    if (s.sentiment === 'bullish') score += s.urgency;
    else if (s.sentiment === 'bearish') score -= s.urgency;
  }
  return score;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scans for unusual options activity as a smart-money leading indicator.
 * Uses FMP API when FMP_API_KEY is set, otherwise falls back to deterministic mock.
 */
export async function scanOptionsFlow(symbols: string[]): Promise<OptionsFlowBundle> {
  const apiKey = process.env['FMP_API_KEY'];
  const allSignals: OptionsFlowSignal[] = [];

  await Promise.all(
    symbols.map(async (symbol) => {
      let signals: OptionsFlowSignal[] = [];
      if (apiKey) {
        try {
          signals = await fetchFmpOptionsFlow(symbol, apiKey);
        } catch {
          signals = generateSignalsForSymbol(symbol);
        }
      } else {
        signals = generateSignalsForSymbol(symbol);
      }
      allSignals.push(...signals);
    }),
  );

  // Build AgentFindings from signals
  const findings: AgentFinding[] = allSignals.map((s) => {
    const direction = s.sentiment === 'bullish' ? 'calls' : 'puts';
    const reasoning = `${formatPremium(s.premium)} in ${direction}, OI ${s.openInterest.toLocaleString()}, expiry ${s.expiry} (${s.daysToExpiry}d) — smart money positioning`;
    return {
      agentId: 'options-flow-scanner',
      symbol: s.symbol,
      signal: s.sentiment === 'bullish' ? 'buy' : 'sell',
      confidence: s.urgency,
      reasoning,
      data: {
        type: s.type,
        strikePrice: s.strikePrice,
        premium: s.premium,
        openInterest: s.openInterest,
        impliedVolatility: s.impliedVolatility,
        daysToExpiry: s.daysToExpiry,
      },
      timestamp: new Date().toISOString(),
    };
  });

  // Rank symbols by net score
  const scoreMap: Map<string, number> = new Map();
  for (const symbol of symbols) {
    const symsignals = allSignals.filter((s) => s.symbol === symbol);
    scoreMap.set(symbol, symbolScore(symsignals));
  }

  const sorted = [...scoreMap.entries()].sort((a, b) => b[1] - a[1]);
  const topBullishSymbols = sorted.filter(([, score]) => score > 0).slice(0, 5).map(([sym]) => sym);
  const topBearishSymbols = sorted.filter(([, score]) => score < 0).reverse().slice(0, 5).map(([sym]) => sym);

  return { signals: allSignals, findings, topBullishSymbols, topBearishSymbols };
}
