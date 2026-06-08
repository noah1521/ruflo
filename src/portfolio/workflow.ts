import type { WeeklyBrief, WorkflowConfig } from './types.js';
import { PortfolioCoordinator } from './agents/coordinator.js';
import { saveWeeklyBrief, loadHistory } from './memory/portfolio-memory.js';

// ─── Workflow class ───────────────────────────────────────────────────────────

export class PortfolioWorkflow {
  private coordinator: PortfolioCoordinator;
  private config: WorkflowConfig;

  constructor(config: WorkflowConfig) {
    this.config = config;
    this.coordinator = new PortfolioCoordinator({ ...config, mockMode: true });
  }

  /**
   * Run the full weekly research and trade-planning cycle.
   *
   * Pipeline:
   *   1. Load history (memory)
   *   2. Macro analysis
   *   3. Parallel: market scan + news catalysts + technical analysis
   *   4. Fundamental filter on top candidates
   *   5. Sentiment + institutional flow check
   *   6. Backtest top signals
   *   7. Risk assessment
   *   8. Portfolio optimization (Kelly sizing)
   *   9. Trade planning (entry/exit/size)
   *  10. Generate WeeklyBrief
   *  11. Persist to memory
   */
  async run(): Promise<WeeklyBrief> {
    console.log('[PortfolioWorkflow] Starting weekly cycle...');
    console.log(`[PortfolioWorkflow] Account: $${this.config.accountSize.toLocaleString()}`);
    console.log(`[PortfolioWorkflow] Max positions: ${this.config.maxPositions}`);
    console.log(`[PortfolioWorkflow] Strategies: ${this.config.strategies.join(', ')}`);

    const brief = await this.coordinator.runWeeklyCycle();

    // Persist
    await saveWeeklyBrief(brief);
    console.log(`[PortfolioWorkflow] Brief saved for week of ${brief.date}`);

    return brief;
  }

  /**
   * Load historical weekly briefs.
   */
  async getHistory(): Promise<WeeklyBrief[]> {
    return loadHistory();
  }

  /**
   * Print a human-readable summary of the weekly brief to stdout.
   */
  static printSummary(brief: WeeklyBrief): void {
    console.log('\n' + '='.repeat(60));
    console.log(`WEEKLY PORTFOLIO BRIEF — ${brief.date}`);
    console.log('='.repeat(60));
    console.log(`\nMACRO: ${brief.macroContext.marketPhase.toUpperCase()} | VIX ${brief.macroContext.vixLevel} (${brief.macroContext.vixTrend}) | ${brief.macroContext.riskOnOff}`);
    console.log(`${brief.macroContext.sectorRotation}`);

    console.log(`\nRISK MODE: ${brief.riskMode.toUpperCase()}`);
    console.log(`\nTOP TRADE IDEAS (${brief.topIdeas.length}):`);
    for (const [i, idea] of brief.topIdeas.entries()) {
      console.log(
        `  ${i + 1}. ${idea.symbol} [${idea.strategy}] Score ${idea.compositeScore}/10` +
        ` | Entry $${idea.entryPrice} | Stop $${idea.stopLoss} | Target $${idea.target}` +
        ` | R:R ${idea.riskReward}:1 | Size ${idea.positionSize} shares (${(idea.allocationPct * 100).toFixed(1)}%)`,
      );
    }

    console.log(`\nOPEN POSITIONS: ${brief.openPositions.length}`);

    console.log('\nNEXT ACTIONS:');
    for (const action of brief.nextActions) {
      console.log(`  • ${action}`);
    }

    console.log(`\nPERFORMANCE:`);
    console.log(`  Weekly: ${(brief.performance.weeklyReturn * 100).toFixed(2)}%`);
    console.log(`  Monthly: ${(brief.performance.monthlyReturn * 100).toFixed(2)}%`);
    console.log(`  YTD: ${(brief.performance.ytdReturn * 100).toFixed(2)}%`);
    console.log(`  Win Rate: ${(brief.performance.winRate * 100).toFixed(1)}%`);
    console.log('='.repeat(60) + '\n');
  }
}
