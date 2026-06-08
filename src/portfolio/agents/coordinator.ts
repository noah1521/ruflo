import type {
  AgentFinding,
  AgentVote,
  BacktestResult,
  CandidateStock,
  MacroContext,
  PerformanceSummary,
  PortfolioState,
  RiskAssessment,
  StrategyName,
  TradePlan,
  TradeSignal,
  WeeklyBrief,
  WorkflowConfig,
} from '../types.js';
import { scanMarket } from './market-scanner.js';
import { analyzeNews, type NewsBundle } from './news-catalyst.js';
import { analyzeTechnicals } from './technical-analyst.js';
import { analyzeFundamentals } from './fundamental-analyst.js';
import { analyzeSentiment } from './sentiment-analyst.js';
import { runBacktest } from './backtester.js';
import { optimizePortfolio } from './portfolio-optimizer.js';
import { assessRisk } from './risk-manager.js';
import { buildTradePlans } from './trade-planner.js';
import { trackPerformance } from './performance-tracker.js';
import { analyzeMacro } from './macro-analyst.js';
import { loadPositions } from '../memory/portfolio-memory.js';

// Agent consensus weights (mirrors YAML consensus_weight)
const AGENT_WEIGHTS: Record<string, number> = {
  'market-scanner': 2,
  'news-catalyst': 2,
  'technical-analyst': 2,
  'fundamental-analyst': 3,
  'sentiment-analyst': 1,
  'backtester': 3,
  'portfolio-optimizer': 2,
  'risk-manager': 3,
  'trade-planner': 2,
  'performance-tracker': 1,
  'macro-analyst': 2,
};

export interface CoordinatorConfig extends WorkflowConfig {
  mockMode?: boolean;
}

// ─── Consensus aggregation ────────────────────────────────────────────────────

function aggregateVotes(votes: AgentVote[]): number {
  const totalWeight = votes.reduce((s, v) => s + v.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = votes.reduce((s, v) => s + v.score * v.weight, 0);
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

function buildVote(agentId: string, score: number, reasoning: string): AgentVote {
  return {
    agentId,
    score,
    weight: AGENT_WEIGHTS[agentId] ?? 1,
    reasoning,
  };
}

// ─── Signal → TradePlan synthesis ────────────────────────────────────────────

function synthesizePlan(
  signal: TradeSignal,
  findings: AgentFinding[],
  plan: TradePlan,
  backtestMap: Map<StrategyName, BacktestResult>,
  risk: RiskAssessment,
  allocationMap: Record<string, number>,
  config: CoordinatorConfig,
): TradePlan {
  const relevantFindings = findings.filter((f) => f.symbol === signal.symbol);

  const votes: AgentVote[] = relevantFindings.map((f) =>
    buildVote(f.agentId, f.confidence, f.reasoning),
  );

  // Backtest adds a vote if strategy has good history
  const bt = backtestMap.get(signal.strategy);
  if (bt) {
    const btScore = Math.round(bt.winRate * 10 + bt.sharpeRatio * 0.5);
    votes.push(buildVote('backtester', Math.min(10, btScore), `Win rate ${(bt.winRate * 100).toFixed(0)}%, Sharpe ${bt.sharpeRatio.toFixed(2)}`));
  }

  const compositeScore = aggregateVotes(votes);
  const allocation = allocationMap[signal.symbol] ?? 0;
  const dollarAllocation = config.accountSize * allocation;
  const positionSize = plan.entryPrice > 0 ? Math.floor(dollarAllocation / plan.entryPrice) : 0;
  const dollarRisk = positionSize * (plan.entryPrice - plan.stopLoss);

  // Apply risk manager adjustments
  const adjustedSize = risk.positionAdjustments[signal.symbol] !== undefined
    ? Math.floor(positionSize * (risk.positionAdjustments[signal.symbol] ?? 1))
    : positionSize;

  return {
    ...plan,
    positionSize: adjustedSize,
    dollarRisk,
    allocationPct: allocation,
    compositeScore,
    agentVotes: votes,
  };
}

// ─── Coordinator class ────────────────────────────────────────────────────────

export class PortfolioCoordinator {
  private config: CoordinatorConfig;

  constructor(config: CoordinatorConfig) {
    this.config = config;
  }

  async runWeeklyCycle(): Promise<WeeklyBrief> {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    const dateStr = weekStart.toISOString().slice(0, 10);

    // ── Level 0: Macro context ───────────────────────────────────────────────
    const macro: MacroContext = await analyzeMacro();

    // If risk-off environment, cap allocation
    const riskMultiplier = macro.riskOnOff === 'risk-off' ? 0.5 : 1.0;

    // ── Level 1: Parallel scan ───────────────────────────────────────────────
    const [candidates, news, technicalFindings] = await Promise.all([
      scanMarket(this.config.universe, 30),
      analyzeNews(this.config.universe) as Promise<NewsBundle>,
      analyzeTechnicals(this.config.universe),
    ]);

    // ── Level 2: Fundamental + sentiment filter ──────────────────────────────
    const topSymbols = candidates.slice(0, 20).map((c: CandidateStock) => c.symbol);
    const [fundamentalFindings, sentimentFindings] = await Promise.all([
      analyzeFundamentals(topSymbols),
      analyzeSentiment(topSymbols),
    ]);

    // Aggregate all agent findings
    const allFindings: AgentFinding[] = [
      ...technicalFindings,
      ...fundamentalFindings,
      ...sentimentFindings,
    ];

    // Combine signals: market scan + catalyst
    const allSignals: TradeSignal[] = [
      ...candidates.slice(0, 10).map((c: CandidateStock) => c as unknown as TradeSignal),
      ...news.signals,
    ];

    // ── Level 3: Backtest ────────────────────────────────────────────────────
    const backtestResults = await runBacktest(this.config.strategies, allSignals);
    const backtestMap = new Map<StrategyName, BacktestResult>(
      backtestResults.map((r) => [r.strategy, r]),
    );

    // ── Level 4: Risk + optimization ─────────────────────────────────────────
    const openPositions = await loadPositions();
    const portfolioState: PortfolioState = {
      positions: openPositions,
      cash: this.config.accountSize * 0.3,
      totalValue: this.config.accountSize,
      weeklyReturn: 0,
      drawdown: 0,
      peakValue: this.config.accountSize,
      riskMode: 'normal',
      lastUpdated: new Date().toISOString(),
    };

    const [risk, allocationMap] = await Promise.all([
      assessRisk(portfolioState, allSignals),
      optimizePortfolio(allSignals, this.config, riskMultiplier),
    ]);

    // ── Level 5: Trade planning + performance ────────────────────────────────
    const approvedSignals = risk.approved
      ? allSignals
      : allSignals.filter((s) => (allocationMap[s.symbol] ?? 0) > 0);

    const [rawPlans, performance] = await Promise.all([
      buildTradePlans(approvedSignals, this.config),
      trackPerformance(openPositions, this.config.accountSize),
    ]);

    // ── Consensus scoring + synthesis ────────────────────────────────────────
    const signalMap = new Map(allSignals.map((s) => [s.symbol, s]));
    const scoredPlans = rawPlans
      .map((plan) => {
        const signal = signalMap.get(plan.symbol);
        if (!signal) return plan;
        return synthesizePlan(signal, allFindings, plan, backtestMap, risk, allocationMap, this.config);
      })
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, 5);

    // ── Build WeeklyBrief ─────────────────────────────────────────────────────
    const performanceSummary: PerformanceSummary = {
      ...performance,
      weeklyReturn: portfolioState.weeklyReturn,
      drawdown: portfolioState.drawdown,
    };

    const nextActions = buildNextActions(scoredPlans, risk, macro);

    return {
      date: dateStr,
      topIdeas: scoredPlans,
      openPositions,
      performance: performanceSummary,
      nextActions,
      macroContext: macro,
      riskMode: risk.riskMode,
    };
  }
}

function buildNextActions(plans: TradePlan[], risk: RiskAssessment, macro: MacroContext): string[] {
  const actions: string[] = [];

  if (risk.riskMode === 'de-risk') {
    actions.push('RISK ALERT: Portfolio in de-risk mode — reduce position sizes by 50%');
  }

  if (macro.riskOnOff === 'risk-off') {
    actions.push(`Macro risk-off: ${macro.recommendation}`);
  }

  for (const plan of plans.slice(0, 3)) {
    actions.push(
      `${plan.action.toUpperCase()} ${plan.symbol} @ $${plan.entryPrice.toFixed(2)} | Stop $${plan.stopLoss.toFixed(2)} | Target $${plan.target.toFixed(2)} | Score ${plan.compositeScore}/10`,
    );
  }

  if (risk.correlationWarnings.length > 0) {
    actions.push(`Correlation warning: ${risk.correlationWarnings[0]}`);
  }

  return actions;
}
