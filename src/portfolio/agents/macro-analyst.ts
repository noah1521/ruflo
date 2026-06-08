import type { MacroContext } from '../types.js';
import { fetchMacroData } from '../data/live-quotes.js';

// ─── Mock macro data ──────────────────────────────────────────────────────────
// Production: integrate Fed data (FRED API), options chains (VIX), yield curve.

interface MacroIndicators {
  vix: number;
  vixPrevWeek: number;
  tenYrYield: number;
  twoYrYield: number;
  fedFundsRate: number;
  sp500Price: number;
  sp500Sma200: number;
  leadingSectorPerf: Record<string, number>; // sector → 1-month return
}

function getMockIndicators(): MacroIndicators {
  // Simulate current mid-2026 market conditions
  return {
    vix: 18.5,
    vixPrevWeek: 20.1,
    tenYrYield: 4.35,
    twoYrYield: 4.10,
    fedFundsRate: 4.25,
    sp500Price: 5420,
    sp500Sma200: 5100,
    leadingSectorPerf: {
      Technology: 0.082,
      'Consumer Discretionary': 0.041,
      Financials: 0.028,
      Healthcare: 0.015,
      Energy: -0.021,
      'Consumer Staples': 0.008,
    },
  };
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────

function analyzeVix(vix: number, vixPrev: number): { level: number; trend: MacroContext['vixTrend'] } {
  const trend: MacroContext['vixTrend'] =
    vix < vixPrev * 0.97 ? 'falling' :
    vix > vixPrev * 1.03 ? 'rising' :
    'neutral';
  return { level: vix, trend };
}

function analyzeYieldCurve(ten: number, two: number): MacroContext['yieldCurve'] {
  const spread = ten - two;
  if (spread > 0.5) return 'normal';
  if (spread < -0.1) return 'inverted';
  return 'flat';
}

function analyzeMarketPhase(sp500: number, sma200: number, vix: number): MacroContext['marketPhase'] {
  if (sp500 < sma200 * 0.95) return 'bear';
  if (sp500 < sma200) return 'consolidation';
  if (sp500 > sma200 * 1.05 && vix < 20) return 'bull';
  return 'breakout';
}

function determineSectorRotation(sectors: Record<string, number>): string {
  const sorted = Object.entries(sectors)
    .sort(([, a], [, b]) => b - a);
  const top = sorted.slice(0, 2).map(([s]) => s).join(', ');
  const bottom = sorted.slice(-2).map(([s]) => s).join(', ');
  return `Rotating into ${top}; out of ${bottom}`;
}

function determineRiskOnOff(
  vix: number,
  marketPhase: MacroContext['marketPhase'],
  yieldCurve: MacroContext['yieldCurve'],
): MacroContext['riskOnOff'] {
  if (vix > 30 || yieldCurve === 'inverted' || marketPhase === 'bear') return 'risk-off';
  if (vix < 18 && marketPhase === 'bull' && yieldCurve === 'normal') return 'risk-on';
  return 'neutral';
}

function buildRecommendation(
  riskOnOff: MacroContext['riskOnOff'],
  marketPhase: MacroContext['marketPhase'],
  sectorRotation: string,
  interestRateTrend: MacroContext['interestRateTrend'],
): string {
  const phrases: string[] = [];

  if (riskOnOff === 'risk-on') {
    phrases.push('Favorable macro: full risk-on positioning supported');
  } else if (riskOnOff === 'risk-off') {
    phrases.push('Risk-off environment: reduce equity exposure 30–50%');
  } else {
    phrases.push('Neutral macro: selective stock picking with moderate sizing');
  }

  phrases.push(sectorRotation);

  if (interestRateTrend === 'falling') {
    phrases.push('Rate cuts benefit growth/tech and real estate');
  } else if (interestRateTrend === 'rising') {
    phrases.push('Rising rates: favor financials, energy; avoid long-duration growth');
  }

  return phrases.join('. ');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze macro environment and return MacroContext.
 * Falls back to mock data when live feeds are unavailable.
 */
export async function analyzeMacro(): Promise<MacroContext> {
  let indicators: MacroIndicators;

  try {
    const live = await fetchMacroData();
    console.log('[macro-analyst] Using live FMP data');
    indicators = {
      vix: live.vix,
      vixPrevWeek: live.vix / (1 + live.vixChange1d / 100),
      tenYrYield: live.tenYearYield,
      twoYrYield: live.twoYearYield,
      fedFundsRate: 4.25,
      sp500Price: 7400,
      sp500Sma200: 6800,
      leadingSectorPerf: live.topSectors.reduce<Record<string, number>>((acc, s, i) => {
        acc[s] = 0.08 - i * 0.02;
        return acc;
      }, {}),
    };
    for (const s of live.bottomSectors) indicators.leadingSectorPerf[s] = -0.02;
  } catch {
    console.log('[macro-analyst] Using mock data (FMP unavailable)');
    indicators = getMockIndicators();
  }

  const { level: vixLevel, trend: vixTrend } = analyzeVix(indicators.vix, indicators.vixPrevWeek);
  const yieldCurve = analyzeYieldCurve(indicators.tenYrYield, indicators.twoYrYield);
  const marketPhase = analyzeMarketPhase(indicators.sp500Price, indicators.sp500Sma200, vixLevel);
  const sectorRotation = determineSectorRotation(indicators.leadingSectorPerf);
  const riskOnOff = determineRiskOnOff(vixLevel, marketPhase, yieldCurve);

  // Rate trend: compare Fed funds to yield
  const interestRateTrend: MacroContext['interestRateTrend'] =
    indicators.tenYrYield > indicators.fedFundsRate + 0.5 ? 'rising' :
    indicators.tenYrYield < indicators.fedFundsRate - 0.5 ? 'falling' :
    'stable';

  const recommendation = buildRecommendation(riskOnOff, marketPhase, sectorRotation, interestRateTrend);

  return {
    vixLevel,
    vixTrend,
    yieldCurve,
    sectorRotation,
    marketPhase,
    riskOnOff,
    interestRateTrend,
    recommendation,
  };
}
