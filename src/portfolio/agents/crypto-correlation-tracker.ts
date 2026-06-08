import type { AgentFinding } from '../types.js';
import { FmpClient, FmpUnavailableError } from '../data/fmp-client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CryptoSignal {
  symbol: string;
  price: number;
  change1d: number;
  change7d: number;
  dominance?: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  rsi: number;
}

export interface CorrelationInsight {
  cryptoSymbol: string;
  equityCorrelation: number;  // -1 to 1
  signal: 'risk-on' | 'risk-off' | 'divergence';
  implication: string;
  confidence: number;
}

export interface CryptoBundle {
  cryptoSignals: CryptoSignal[];
  correlationInsights: CorrelationInsight[];
  findings: AgentFinding[];
  overallCryptoSentiment: 'bullish' | 'bearish' | 'neutral';
  riskAppetiteSignal: 'risk-on' | 'risk-off' | 'neutral';
}

// ─── FMP ticker map ───────────────────────────────────────────────────────────

const CRYPTO_TICKERS: Record<string, string> = {
  BTC: 'BTCUSD',
  ETH: 'ETHUSD',
  SOL: 'SOLUSD',
  BNB: 'BNBUSD',
  XRP: 'XRPUSD',
};

// Known historical correlations (BTC/NASDAQ ≈ 0.65 in risk-on regimes)
const EQUITY_CORRELATIONS: Record<string, number> = {
  BTC: 0.65,
  ETH: 0.68,
  SOL: 0.72,
  BNB: 0.55,
  XRP: 0.45,
};

// ─── Mock data generator ──────────────────────────────────────────────────────

function mockCryptoSignal(symbol: string): CryptoSignal {
  const seed = symbol.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const r = (offset: number) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  };

  const priceBases: Record<string, number> = {
    BTC: 63000, ETH: 1650, SOL: 65, BNB: 590, XRP: 1.1,
  };

  const base = priceBases[symbol] ?? 100;
  const change1d = (r(1) - 0.5) * 0.1;   // ±5%
  const change7d = (r(2) - 0.5) * 0.3;   // ±15%
  const price = base * (1 + change1d);
  const rsi = 35 + r(3) * 40;             // 35–75

  const trend: CryptoSignal['trend'] =
    change7d > 0.05 ? 'bullish' :
    change7d < -0.05 ? 'bearish' :
    'neutral';

  return {
    symbol,
    price: Math.round(price * 100) / 100,
    change1d: Math.round(change1d * 10000) / 100,
    change7d: Math.round(change7d * 10000) / 100,
    dominance: symbol === 'BTC' ? 52 + r(4) * 10 : undefined,
    trend,
    rsi: Math.round(rsi * 10) / 10,
  };
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────

function buildCorrelationInsight(signal: CryptoSignal): CorrelationInsight {
  const corr = EQUITY_CORRELATIONS[signal.symbol] ?? 0.5;
  const change7d = signal.change7d;

  let insightSignal: CorrelationInsight['signal'];
  let implication: string;
  let confidence: number;

  if (signal.symbol === 'BTC') {
    if (change7d > 5) {
      insightSignal = 'risk-on';
      implication = `BTC +${change7d.toFixed(1)}% over 7d — historically precedes equity risk-on rally`;
      confidence = 7;
    } else if (change7d < -5) {
      insightSignal = 'risk-off';
      implication = `BTC ${change7d.toFixed(1)}% over 7d — risk-off warning, monitor equity exposure`;
      confidence = 7;
    } else {
      insightSignal = 'divergence';
      implication = `BTC flat — no directional signal for equities`;
      confidence = 3;
    }
  } else if (signal.symbol === 'ETH') {
    const ethBtcSignal = signal.rsi > 60 ? 'risk-on' : signal.rsi < 40 ? 'risk-off' : 'divergence';
    insightSignal = ethBtcSignal;
    implication = `ETH RSI ${signal.rsi.toFixed(0)} — ${ethBtcSignal === 'risk-on' ? 'altcoin strength signals broad risk appetite' : ethBtcSignal === 'risk-off' ? 'ETH weakness signals risk-off' : 'neutral'}`;
    confidence = 5;
  } else {
    insightSignal = change7d > 0 ? 'risk-on' : 'risk-off';
    implication = `${signal.symbol} ${change7d > 0 ? '+' : ''}${change7d.toFixed(1)}% — supplementary risk signal`;
    confidence = 3;
  }

  return { cryptoSymbol: signal.symbol, equityCorrelation: corr, signal: insightSignal, implication, confidence };
}

function buildFinding(signal: CryptoSignal, insight: CorrelationInsight): AgentFinding {
  return {
    agentId: 'crypto-correlation-tracker',
    symbol: signal.symbol,
    signal: insight.signal === 'risk-on' ? 'buy' : insight.signal === 'risk-off' ? 'sell' : 'hold',
    confidence: insight.confidence,
    reasoning: insight.implication,
    data: {
      price: signal.price,
      change1d: signal.change1d,
      change7d: signal.change7d,
      rsi: signal.rsi,
      equityCorrelation: insight.equityCorrelation,
    },
    timestamp: new Date().toISOString(),
  };
}

function calcOverallSentiment(signals: CryptoSignal[]): CryptoBundle['overallCryptoSentiment'] {
  const btc = signals.find((s) => s.symbol === 'BTC');
  const eth = signals.find((s) => s.symbol === 'ETH');
  const bullCount = signals.filter((s) => s.trend === 'bullish').length;
  const bearCount = signals.filter((s) => s.trend === 'bearish').length;

  // BTC dominates the signal
  if (btc?.change7d !== undefined && btc.change7d > 5) return 'bullish';
  if (btc?.change7d !== undefined && btc.change7d < -5) return 'bearish';
  if (eth?.change7d !== undefined && eth.change7d > 8) return 'bullish';
  return bullCount > bearCount ? 'bullish' : bearCount > bullCount ? 'bearish' : 'neutral';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Track crypto signals and their correlation to equity risk appetite.
 * Uses FMP crypto quotes when available; falls back to seeded mock data.
 */
export async function trackCryptoCorrelations(): Promise<CryptoBundle> {
  const symbols = Object.keys(CRYPTO_TICKERS);
  let cryptoSignals: CryptoSignal[];

  try {
    const client = new FmpClient();
    const tickers = Object.values(CRYPTO_TICKERS);
    const quotes = await client.getBatchQuotes(tickers);
    console.log(`[crypto-correlation] Using live FMP crypto data (${quotes.length} quotes)`);

    cryptoSignals = symbols.map((sym) => {
      const ticker = CRYPTO_TICKERS[sym]!;
      const q = quotes.find((r) => r.symbol === ticker);
      if (!q) return mockCryptoSignal(sym);

      const change1d = q.changesPercentage;
      // FMP doesn't return 7d directly — approximate from mock with live price anchoring
      const mock = mockCryptoSignal(sym);
      return {
        symbol: sym,
        price: q.price,
        change1d: Math.round(change1d * 100) / 100,
        change7d: mock.change7d,  // keep mock 7d; upgrade when historical endpoint available
        dominance: sym === 'BTC' ? mock.dominance : undefined,
        trend: change1d > 2 ? 'bullish' : change1d < -2 ? 'bearish' : 'neutral',
        rsi: mock.rsi,
      };
    });
  } catch (err) {
    if (err instanceof FmpUnavailableError) {
      console.log('[crypto-correlation] Mock mode (FMP_API_KEY not set)');
    } else {
      console.warn('[crypto-correlation] FMP error, using mock:', (err as Error).message);
    }
    cryptoSignals = symbols.map(mockCryptoSignal);
  }

  const correlationInsights = cryptoSignals.map(buildCorrelationInsight);
  const findings = cryptoSignals.map((s, i) => buildFinding(s, correlationInsights[i]!));

  const overallCryptoSentiment = calcOverallSentiment(cryptoSignals);
  const riskOnCount = correlationInsights.filter((i) => i.signal === 'risk-on').length;
  const riskOffCount = correlationInsights.filter((i) => i.signal === 'risk-off').length;
  const riskAppetiteSignal: CryptoBundle['riskAppetiteSignal'] =
    riskOnCount > riskOffCount ? 'risk-on' :
    riskOffCount > riskOnCount ? 'risk-off' : 'neutral';

  return { cryptoSignals, correlationInsights, findings, overallCryptoSentiment, riskAppetiteSignal };
}
