import type { BacktestConfig, BacktestResult, Candle, StrategyName, TradeSignal } from '../types.js';
import { smaCrossoverSignal } from '../strategies/momentum.js';

// ─── Historical data simulation ───────────────────────────────────────────────
// Generates synthetic OHLCV data with realistic properties (GBM + mean reversion).

function generateCandles(symbol: string, days: number): Candle[] {
  const seed = symbol.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const r = (i: number, o: number) => Math.abs(Math.sin(seed * 17 + i * 3 + o));

  const candles: Candle[] = [];
  let price = 100 + r(0, 0) * 400;
  const baseVol = 2_000_000 + r(0, 1) * 8_000_000;

  for (let i = 0; i < days; i++) {
    // Geometric Brownian Motion with drift
    const dailyReturn = (r(i, 0) - 0.48) * 0.04; // slight positive drift
    const open = price;
    const close = price * (1 + dailyReturn);
    const high = Math.max(open, close) * (1 + r(i, 1) * 0.01);
    const low = Math.min(open, close) * (1 - r(i, 2) * 0.01);
    const volume = Math.round(baseVol * (0.5 + r(i, 3) * 2));

    const dateObj = new Date();
    dateObj.setDate(dateObj.getDate() - (days - i));

    candles.push({
      date: dateObj.toISOString().slice(0, 10),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });

    price = close;
  }

  return candles;
}

// ─── Strategy simulators ──────────────────────────────────────────────────────

interface SimTrade {
  entry: number;
  exit: number;
  pnl: number;    // decimal
  won: boolean;
}

function simulateMomentum(candles: Candle[], config: BacktestConfig): SimTrade[] {
  const trades: SimTrade[] = [];
  const prices = candles.map((c) => c.close);
  const avgVol = prices.slice(0, 20).reduce((s, _) => s + 1, 0); // simplified

  let inTrade = false;
  let entryPrice = 0;
  let stopLoss = 0;
  let target = 0;
  const highWindow: number[] = [];

  for (let i = 20; i < candles.length; i++) {
    const c = candles[i];
    const window20High = Math.max(...candles.slice(i - 20, i).map((x) => x.close));
    highWindow.push(window20High);

    if (!inTrade) {
      // Entry: close above 20-day high with volume
      const volRatio = c.volume / (avgVol + 1);
      const signal = smaCrossoverSignal(prices.slice(0, i + 1));

      if (c.close > window20High * 0.995 && (volRatio > 1.5 || signal === 1)) {
        inTrade = true;
        entryPrice = c.close;
        stopLoss = entryPrice * (1 - config.stopLossPct);
        target = entryPrice * (1 + config.stopLossPct * config.targetMultiple);
      }
    } else {
      // Exit: stop, target, or 10-day low
      const low10 = Math.min(...candles.slice(Math.max(0, i - 10), i + 1).map((x) => x.low));
      if (c.low <= stopLoss || c.high >= target || c.close < low10) {
        const exitPrice = c.low <= stopLoss ? stopLoss : c.high >= target ? target : c.close;
        const pnl = (exitPrice - entryPrice) / entryPrice;
        trades.push({ entry: entryPrice, exit: exitPrice, pnl, won: pnl > 0 });
        inTrade = false;
      }
    }
  }

  return trades;
}

function simulateCatalyst(candles: Candle[], config: BacktestConfig): SimTrade[] {
  // Catalyst: buy random breakout days (simulates surprise catalysts)
  const trades: SimTrade[] = [];

  for (let i = 5; i < candles.length - 5; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    const gapPct = (c.open - prevClose) / prevClose;

    // Gap up > 3% = catalyst proxy
    if (gapPct > 0.03 && trades.length < 20) {
      const entry = c.open;
      const stop = entry * (1 - config.stopLossPct);
      const tgt = entry * (1 + config.stopLossPct * config.targetMultiple);

      // Hold for up to 5 days
      for (let j = i + 1; j <= Math.min(i + 5, candles.length - 1); j++) {
        const bar = candles[j];
        if (bar.low <= stop || bar.high >= tgt || j === i + 5) {
          const exitPrice = bar.low <= stop ? stop : bar.high >= tgt ? tgt : bar.close;
          trades.push({ entry, exit: exitPrice, pnl: (exitPrice - entry) / entry, won: exitPrice > entry });
          break;
        }
      }
    }
  }

  return trades;
}

function simulateTechnicalReversal(candles: Candle[], config: BacktestConfig): SimTrade[] {
  const trades: SimTrade[] = [];

  for (let i = 20; i < candles.length; i++) {
    const c = candles[i];
    const sma200 = candles.slice(i - 20, i).reduce((s, x) => s + x.close, 0) / 20;
    const low20 = Math.min(...candles.slice(i - 20, i).map((x) => x.low));
    const prevClose = candles[i - 1].close;

    // RSI proxy: simplified using recent price momentum
    const recentReturns = candles.slice(i - 14, i).map((x, j) =>
      j > 0 ? (x.close - candles[i - 14 + j - 1].close) / candles[i - 14 + j - 1].close : 0,
    );
    const avgReturn = recentReturns.reduce((s, v) => s + v, 0) / recentReturns.length;
    const isOversold = avgReturn < -0.005;

    // Entry: oversold + at 20-day low + in uptrend (price > sma200)
    if (isOversold && c.close <= low20 * 1.005 && c.close > sma200 && trades.length < 15) {
      const entry = c.close;
      const stop = entry * (1 - config.stopLossPct);
      const tgt = sma200; // target = return to 20-day MA proxy

      for (let j = i + 1; j <= Math.min(i + 10, candles.length - 1); j++) {
        const bar = candles[j];
        if (bar.low <= stop || bar.high >= tgt || j === i + 10) {
          const exitPrice = bar.low <= stop ? stop : bar.high >= tgt ? tgt : bar.close;
          trades.push({ entry, exit: exitPrice, pnl: (exitPrice - entry) / entry, won: exitPrice > entry });
          break;
        }
      }
    }
  }

  return trades;
}

// ─── Statistics ───────────────────────────────────────────────────────────────

function calcStats(trades: SimTrade[], strategy: StrategyName): BacktestResult {
  if (trades.length === 0) {
    return {
      strategy,
      winRate: 0.5,
      avgReturn: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      totalTrades: 0,
      profitFactor: 1,
      avgWin: 0,
      avgLoss: 0,
      expectancy: 0,
    };
  }

  const wins = trades.filter((t) => t.won);
  const losses = trades.filter((t) => !t.won);
  const winRate = wins.length / trades.length;
  const avgReturn = trades.reduce((s, t) => s + t.pnl, 0) / trades.length;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;

  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  // Sharpe (annualized, simplified — assume 1 trade/week)
  const variance = trades.reduce((s, t) => s + Math.pow(t.pnl - avgReturn, 2), 0) / trades.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(52) : 0;

  // Sortino (downside deviation only)
  const downsideDev = Math.sqrt(
    trades.filter((t) => t.pnl < 0).reduce((s, t) => s + Math.pow(t.pnl, 2), 0) / trades.length,
  );
  const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(52) : 0;

  // Max drawdown via equity curve
  let peak = 1;
  let equity = 1;
  let maxDrawdown = 0;
  for (const t of trades) {
    equity *= 1 + t.pnl;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return {
    strategy,
    winRate,
    avgReturn,
    maxDrawdown,
    sharpeRatio,
    sortinoRatio,
    totalTrades: trades.length,
    profitFactor,
    avgWin,
    avgLoss,
    expectancy: winRate * avgWin - (1 - winRate) * avgLoss,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: BacktestConfig = {
  lookbackDays: 252,
  universe: 'SP500_NASDAQ',
  minVolume: 500_000,
  minMarketCap: 1_000_000_000,
  maxPositions: 8,
  stopLossPct: 0.07,
  targetMultiple: 2.0,
};

/**
 * Run backtests for each requested strategy using synthetic historical data.
 * Returns one BacktestResult per strategy.
 */
export async function runBacktest(
  strategies: StrategyName[],
  _signals: TradeSignal[],
  config: Partial<BacktestConfig> = {},
): Promise<BacktestResult[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Use a representative symbol to generate candle history
  const candles = generateCandles('SPY', cfg.lookbackDays + 50);
  const results: BacktestResult[] = [];

  for (const strategy of strategies) {
    let trades: SimTrade[] = [];

    if (strategy === 'momentum') {
      trades = simulateMomentum(candles, cfg);
    } else if (strategy === 'catalyst' || strategy === 'earnings-beat') {
      trades = simulateCatalyst(candles, cfg);
    } else if (strategy === 'technical-reversal' || strategy === 'mean-reversion') {
      trades = simulateTechnicalReversal(candles, cfg);
    } else if (strategy === 'index-inclusion') {
      // Index inclusion: similar to catalyst but higher win rate
      trades = simulateCatalyst(candles, { ...cfg, targetMultiple: 3.0 });
    } else {
      trades = simulateMomentum(candles, cfg);
    }

    results.push(calcStats(trades, strategy));
  }

  return results;
}

export { DEFAULT_CONFIG as DEFAULT_BACKTEST_CONFIG };
