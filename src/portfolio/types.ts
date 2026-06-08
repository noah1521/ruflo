export type Side = 'long' | 'short';
export type SignalAction = 'buy' | 'sell' | 'hold' | 'watch';
export type StrategyName =
  | 'momentum'
  | 'catalyst'
  | 'technical-reversal'
  | 'index-inclusion'
  | 'earnings-beat'
  | 'mean-reversion';

export type RiskMode = 'normal' | 'de-risk' | 'defensive';

// ─── Core domain types ────────────────────────────────────────────────────────

export interface Position {
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  size: number;           // number of shares
  stopLoss: number;
  target: number;
  side: Side;
  entryDate: string;      // ISO date string
  strategy: StrategyName;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}

export interface TradeSignal {
  symbol: string;
  action: SignalAction;
  confidence: number;     // 1–10
  catalyst: string;
  riskReward: number;     // e.g. 2.5 means 2.5:1
  strategy: StrategyName;
  entryZone: [number, number];    // [low, high] price range
  stopLoss: number;
  target: number;
  agentSource: string;
}

export interface PortfolioState {
  positions: Position[];
  cash: number;
  totalValue: number;
  weeklyReturn: number;
  drawdown: number;               // current drawdown from peak, as decimal
  peakValue: number;
  riskMode: RiskMode;
  lastUpdated: string;
}

export interface BacktestResult {
  strategy: StrategyName;
  winRate: number;                // decimal, e.g. 0.62
  avgReturn: number;              // per-trade avg, decimal
  maxDrawdown: number;            // decimal
  sharpeRatio: number;
  sortinoRatio: number;
  totalTrades: number;
  profitFactor: number;           // gross profit / gross loss
  avgWin: number;
  avgLoss: number;
  expectancy: number;             // avg $ per trade
}

export interface AgentFinding {
  agentId: string;
  symbol: string;
  signal: SignalAction;
  confidence: number;             // 1–10 vote
  reasoning: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface WeeklyBrief {
  date: string;                   // ISO week start
  topIdeas: TradePlan[];
  openPositions: Position[];
  performance: PerformanceSummary;
  nextActions: string[];
  macroContext: MacroContext;
  riskMode: RiskMode;
}

// ─── Supporting types ─────────────────────────────────────────────────────────

export interface TradePlan {
  symbol: string;
  strategy: StrategyName;
  action: SignalAction;
  entryPrice: number;
  entryType: 'breakout' | 'pullback' | 'market';
  stopLoss: number;
  target: number;
  riskReward: number;
  positionSize: number;           // shares
  dollarRisk: number;
  allocationPct: number;          // % of portfolio
  compositeScore: number;         // 1–10 aggregated from all agents
  catalysts: string[];
  agentVotes: AgentVote[];
  entryConditions: string[];
  exitConditions: string[];
}

export interface AgentVote {
  agentId: string;
  score: number;                  // 1–10
  weight: number;                 // consensus_weight from YAML
  reasoning: string;
}

export interface PerformanceSummary {
  weeklyReturn: number;
  monthlyReturn: number;
  ytdReturn: number;
  winRate: number;
  avgWinLoss: number;
  bestTrade: string;
  worstTrade: string;
  totalTrades: number;
  openPositions: number;
  drawdown: number;
}

export interface MacroContext {
  vixLevel: number;
  vixTrend: 'rising' | 'falling' | 'neutral';
  yieldCurve: 'normal' | 'inverted' | 'flat';
  sectorRotation: string;         // e.g. "rotating into energy, out of tech"
  marketPhase: 'bull' | 'bear' | 'consolidation' | 'breakout';
  riskOnOff: 'risk-on' | 'risk-off' | 'neutral';
  interestRateTrend: 'rising' | 'falling' | 'stable';
  recommendation: string;
}

export interface CandidateStock {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  marketCap: number;
  sector: string;
  rsi: number;
  sma20: number;
  sma50: number;
  sma200: number;
  atr: number;                    // average true range
  high52w: number;
  low52w: number;
  momentumScore: number;
  technicalScore: number;
  fundamentalScore: number;
  sentimentScore: number;
}

export interface RiskAssessment {
  approved: boolean;
  riskMode: RiskMode;
  portfolioVar95: number;         // 1-week 95% VaR as decimal
  currentDrawdown: number;
  correlationWarnings: string[];
  positionAdjustments: Record<string, number>; // symbol → adjusted size
  message: string;
}

export interface BacktestConfig {
  lookbackDays: number;
  universe: string;
  minVolume: number;
  minMarketCap: number;
  maxPositions: number;
  stopLossPct: number;
  targetMultiple: number;         // risk:reward target (e.g. 2 = 2:1)
}

export interface WorkflowConfig {
  accountSize: number;
  riskPerTrade: number;           // decimal, e.g. 0.02 = 2%
  maxPositions: number;
  targetWeeklyReturn: number;
  strategies: StrategyName[];
  universe: string;
}

export interface Candle {
  date: string;
  open: number;
  high: number;
  close: number;
  low: number;
  volume: number;
}
