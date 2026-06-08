import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  WeeklyBrief,
  Position,
  BacktestResult,
  StrategyName,
} from '../types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data/portfolio');

interface TradeRecord {
  symbol: string;
  strategy: StrategyName;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  actualReturn: number;       // decimal
  won: boolean;
}

interface MemoryStore {
  briefs: WeeklyBrief[];
  positions: Position[];
  trades: TradeRecord[];
  backtestResults: BacktestResult[];
  lastUpdated: string;
}

const EMPTY_STORE: MemoryStore = {
  briefs: [],
  positions: [],
  trades: [],
  backtestResults: [],
  lastUpdated: new Date().toISOString(),
};

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function storePath(): string {
  return path.join(DATA_DIR, 'memory.json');
}

async function load(): Promise<MemoryStore> {
  await ensureDir();
  try {
    const raw = await fs.readFile(storePath(), 'utf8');
    return JSON.parse(raw) as MemoryStore;
  } catch {
    return structuredClone(EMPTY_STORE);
  }
}

async function save(store: MemoryStore): Promise<void> {
  await ensureDir();
  store.lastUpdated = new Date().toISOString();
  await fs.writeFile(storePath(), JSON.stringify(store, null, 2), 'utf8');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function saveWeeklyBrief(brief: WeeklyBrief): Promise<void> {
  const store = await load();
  // Replace if same date exists, otherwise append
  const idx = store.briefs.findIndex((b) => b.date === brief.date);
  if (idx >= 0) {
    store.briefs[idx] = brief;
  } else {
    store.briefs.push(brief);
  }
  // Keep last 52 briefs (1 year of weekly data)
  if (store.briefs.length > 52) {
    store.briefs = store.briefs.slice(-52);
  }
  await save(store);
}

export async function loadHistory(): Promise<WeeklyBrief[]> {
  const store = await load();
  return store.briefs;
}

export async function savePosition(pos: Position): Promise<void> {
  const store = await load();
  const idx = store.positions.findIndex((p) => p.symbol === pos.symbol);
  if (idx >= 0) {
    store.positions[idx] = pos;
  } else {
    store.positions.push(pos);
  }
  await save(store);
}

export async function removePosition(symbol: string): Promise<void> {
  const store = await load();
  store.positions = store.positions.filter((p) => p.symbol !== symbol);
  await save(store);
}

export async function loadPositions(): Promise<Position[]> {
  const store = await load();
  return store.positions;
}

export async function updatePerformance(
  symbol: string,
  strategy: StrategyName,
  entryPrice: number,
  exitPrice: number,
  entryDate: string,
): Promise<void> {
  const store = await load();
  const actualReturn = (exitPrice - entryPrice) / entryPrice;
  const record: TradeRecord = {
    symbol,
    strategy,
    entryDate,
    exitDate: new Date().toISOString().slice(0, 10),
    entryPrice,
    exitPrice,
    actualReturn,
    won: actualReturn > 0,
  };
  store.trades.push(record);
  // Keep last 500 trades
  if (store.trades.length > 500) {
    store.trades = store.trades.slice(-500);
  }
  await save(store);
}

export async function getWinRate(strategy: StrategyName): Promise<number> {
  const store = await load();
  const trades = store.trades.filter((t) => t.strategy === strategy);
  if (trades.length === 0) return 0.5; // default assumption
  const wins = trades.filter((t) => t.won).length;
  return wins / trades.length;
}

export async function getBestStrategies(): Promise<StrategyName[]> {
  const store = await load();
  if (store.trades.length === 0) return ['momentum', 'catalyst'];

  const strategyStats: Record<string, { wins: number; total: number; totalReturn: number }> = {};
  for (const trade of store.trades) {
    if (!strategyStats[trade.strategy]) {
      strategyStats[trade.strategy] = { wins: 0, total: 0, totalReturn: 0 };
    }
    strategyStats[trade.strategy].total++;
    strategyStats[trade.strategy].totalReturn += trade.actualReturn;
    if (trade.won) strategyStats[trade.strategy].wins++;
  }

  const ranked = Object.entries(strategyStats)
    .map(([strat, stats]) => ({
      strategy: strat as StrategyName,
      expectancy: (stats.wins / stats.total) * (stats.totalReturn / stats.total),
    }))
    .sort((a, b) => b.expectancy - a.expectancy);

  return ranked.map((r) => r.strategy);
}

export async function saveBacktestResult(result: BacktestResult): Promise<void> {
  const store = await load();
  const idx = store.backtestResults.findIndex((r) => r.strategy === result.strategy);
  if (idx >= 0) {
    store.backtestResults[idx] = result;
  } else {
    store.backtestResults.push(result);
  }
  await save(store);
}

export async function getBacktestResults(): Promise<BacktestResult[]> {
  const store = await load();
  return store.backtestResults;
}
