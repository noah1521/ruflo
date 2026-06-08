import type { AgentFinding } from '../types.js';

// ─── Mock sentiment data ──────────────────────────────────────────────────────
// Production: integrate Reddit/X sentiment APIs, SEC insider filings, 13F filings.

interface SentimentData {
  symbol: string;
  socialScore: number;        // 1–10 social buzz
  insiderBuyingScore: number; // 1–10 based on recent insider purchases
  institutionalScore: number; // 1–10 based on 13F flows
  shortInterestPct: number;   // short interest as % of float
  analystConsensus: number;   // 1–5 (1=strong sell, 3=hold, 5=strong buy)
  putCallRatio: number;       // <0.7 bullish, >1.2 bearish
}

function generateSentiment(symbol: string): SentimentData {
  const seed = symbol.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const r = (o: number) => Math.abs(Math.sin(seed * 13 + o));

  const isMomentumFavorite = ['NVDA', 'META', 'TSLA', 'AMD', 'NFLX'].includes(symbol);
  const bias = isMomentumFavorite ? 1.3 : 1.0;

  return {
    symbol,
    socialScore: Math.round((3 + r(0) * 7) * bias * 10) / 10,
    insiderBuyingScore: Math.round((1 + r(1) * 9) * 10) / 10,
    institutionalScore: Math.round((2 + r(2) * 8) * bias * 10) / 10,
    shortInterestPct: r(3) * 0.25,
    analystConsensus: 1 + r(4) * 4,
    putCallRatio: 0.4 + r(5) * 1.2,
  };
}

// ─── Sentiment scoring ────────────────────────────────────────────────────────

function scoreSentiment(s: SentimentData): { score: number; notes: string[] } {
  let points = 0;
  const notes: string[] = [];

  // Social sentiment (2 pts)
  if (s.socialScore >= 7) { points += 2; notes.push(`High social buzz (${s.socialScore.toFixed(1)}/10)`); }
  else if (s.socialScore >= 5) { points++; notes.push(`Moderate social interest`); }

  // Insider buying (2 pts — strong signal)
  if (s.insiderBuyingScore >= 7) { points += 2; notes.push('Significant insider buying'); }
  else if (s.insiderBuyingScore >= 5) { points++; notes.push('Some insider buying activity'); }

  // Institutional flows (2 pts)
  if (s.institutionalScore >= 7) { points += 2; notes.push('Strong institutional accumulation'); }
  else if (s.institutionalScore >= 5) { points++; notes.push('Positive institutional flows'); }

  // Short interest — high short = squeeze potential (1 pt)
  if (s.shortInterestPct >= 0.15) { points++; notes.push(`High short interest ${(s.shortInterestPct * 100).toFixed(0)}% — squeeze potential`); }

  // Analyst consensus (2 pts)
  if (s.analystConsensus >= 4.0) { points += 2; notes.push(`Strong analyst consensus (${s.analystConsensus.toFixed(1)}/5)`); }
  else if (s.analystConsensus >= 3.5) { points++; notes.push(`Positive analyst bias`); }
  else if (s.analystConsensus < 2.5) { points--; notes.push('Negative analyst consensus'); }

  // Put/call ratio (1 pt)
  if (s.putCallRatio < 0.7) { points++; notes.push(`Bullish options sentiment (P/C ${s.putCallRatio.toFixed(2)})`); }
  else if (s.putCallRatio > 1.2) { points--; notes.push(`Bearish options positioning (P/C ${s.putCallRatio.toFixed(2)})`); }

  return { score: Math.max(1, Math.min(10, points)), notes };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze sentiment signals (social, insider, institutional) for provided symbols.
 */
export async function analyzeSentiment(symbols: string[]): Promise<AgentFinding[]> {
  await Promise.resolve();

  return symbols.map((symbol) => {
    const s = generateSentiment(symbol);
    const { score, notes } = scoreSentiment(s);

    return {
      agentId: 'sentiment-analyst',
      symbol,
      signal: score >= 7 ? 'buy' : score >= 4 ? 'watch' : 'hold',
      confidence: score,
      reasoning: notes.slice(0, 3).join('; '),
      data: {
        socialScore: s.socialScore,
        insiderBuying: s.insiderBuyingScore,
        institutionalFlow: s.institutionalScore,
        shortInterest: (s.shortInterestPct * 100).toFixed(1) + '%',
        analystConsensus: s.analystConsensus.toFixed(1) + '/5',
        putCallRatio: s.putCallRatio.toFixed(2),
      },
      timestamp: new Date().toISOString(),
    };
  });
}
