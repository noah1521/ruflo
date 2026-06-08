import type { AgentFinding } from '../types.js';

// ─── Mock fundamental data ────────────────────────────────────────────────────
// In production: replace with financial data API (e.g., FMP, Alpha Vantage).

interface FundamentalData {
  symbol: string;
  peRatio: number;
  peGrowth: number;        // P/E to growth (PEG)
  revenueGrowthYoy: number; // YoY decimal
  grossMargin: number;      // decimal
  netMargin: number;        // decimal
  debtToEquity: number;
  currentRatio: number;
  roe: number;              // return on equity
  fcfYield: number;         // free cash flow yield
  earningsGrowth: number;   // YoY decimal
}

function generateFundamentals(symbol: string): FundamentalData {
  const seed = symbol.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const r = (offset: number) => Math.abs(Math.sin(seed * 7 + offset));

  // Tech-heavy SP500 skew
  const isTech = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMD', 'ADBE', 'CRM', 'ORCL'].includes(symbol);
  const growthBias = isTech ? 1.4 : 1.0;

  return {
    symbol,
    peRatio: 15 + r(0) * 35 * growthBias,
    peGrowth: 0.8 + r(1) * 1.5,
    revenueGrowthYoy: (r(2) * 0.3 - 0.05) * growthBias,
    grossMargin: 0.3 + r(3) * 0.5 * growthBias,
    netMargin: 0.05 + r(4) * 0.25 * growthBias,
    debtToEquity: r(5) * 1.5,
    currentRatio: 1.0 + r(6) * 2.5,
    roe: 0.05 + r(7) * 0.35 * growthBias,
    fcfYield: 0.01 + r(8) * 0.06,
    earningsGrowth: (r(9) * 0.4 - 0.05) * growthBias,
  };
}

// ─── Fundamental scoring ──────────────────────────────────────────────────────

function scoreFundamentals(f: FundamentalData): { score: number; notes: string[] } {
  let points = 0;
  const notes: string[] = [];

  // Valuation (2 pts) — lower P/E relative to growth is better
  if (f.peGrowth < 1.0) { points += 2; notes.push(`PEG ${f.peGrowth.toFixed(2)} — undervalued vs growth`); }
  else if (f.peGrowth < 1.5) { points++; notes.push(`PEG ${f.peGrowth.toFixed(2)} — fair value`); }
  else { notes.push(`PEG ${f.peGrowth.toFixed(2)} — stretched`); }

  // Revenue growth (2 pts)
  if (f.revenueGrowthYoy >= 0.20) { points += 2; notes.push(`Revenue +${(f.revenueGrowthYoy * 100).toFixed(0)}% YoY`); }
  else if (f.revenueGrowthYoy >= 0.10) { points++; notes.push(`Revenue +${(f.revenueGrowthYoy * 100).toFixed(0)}% YoY`); }
  else if (f.revenueGrowthYoy < 0) { points--; notes.push('Revenue declining'); }

  // Margin quality (2 pts)
  if (f.grossMargin >= 0.60) { points += 2; notes.push(`Gross margin ${(f.grossMargin * 100).toFixed(0)}% — high quality`); }
  else if (f.grossMargin >= 0.40) { points++; notes.push(`Gross margin ${(f.grossMargin * 100).toFixed(0)}%`); }
  if (f.netMargin >= 0.15) { points++; notes.push(`Net margin ${(f.netMargin * 100).toFixed(0)}%`); }

  // Balance sheet (2 pts)
  if (f.debtToEquity < 0.5) { points++; notes.push('Low leverage'); }
  if (f.currentRatio >= 1.5) { points++; notes.push(`Current ratio ${f.currentRatio.toFixed(1)}`); }
  else if (f.currentRatio < 1.0) { points--; notes.push('Liquidity concern'); }

  // Return / FCF (2 pts)
  if (f.roe >= 0.20) { points++; notes.push(`ROE ${(f.roe * 100).toFixed(0)}%`); }
  if (f.fcfYield >= 0.04) { points++; notes.push(`FCF yield ${(f.fcfYield * 100).toFixed(1)}%`); }

  return { score: Math.max(1, Math.min(10, points)), notes };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run fundamental analysis on provided symbols.
 * Returns one AgentFinding per symbol.
 */
export async function analyzeFundamentals(symbols: string[]): Promise<AgentFinding[]> {
  // Simulate async data fetch
  await Promise.resolve();

  return symbols.map((symbol) => {
    const f = generateFundamentals(symbol);
    const { score, notes } = scoreFundamentals(f);

    return {
      agentId: 'fundamental-analyst',
      symbol,
      signal: score >= 7 ? 'buy' : score >= 5 ? 'watch' : 'hold',
      confidence: score,
      reasoning: notes.slice(0, 4).join('; '),
      data: {
        peRatio: f.peRatio.toFixed(1),
        peg: f.peGrowth.toFixed(2),
        revenueGrowth: (f.revenueGrowthYoy * 100).toFixed(1) + '%',
        grossMargin: (f.grossMargin * 100).toFixed(1) + '%',
        debtToEquity: f.debtToEquity.toFixed(2),
        roe: (f.roe * 100).toFixed(1) + '%',
      },
      timestamp: new Date().toISOString(),
    };
  });
}
