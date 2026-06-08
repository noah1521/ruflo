/**
 * Portfolio Manager Entry Point
 *
 * Run: npx tsx src/portfolio/run.ts
 *
 * Optional env vars:
 *   ACCOUNT_SIZE=50000
 *   RISK_PER_TRADE=0.02
 *   MAX_POSITIONS=8
 *   JSON_OUTPUT=1   (output raw JSON instead of formatted summary)
 */
import { PortfolioWorkflow } from './workflow.js';
import type { WorkflowConfig, StrategyName } from './types.js';

const accountSize = Number(process.env['ACCOUNT_SIZE'] ?? 10_000);
const riskPerTrade = Number(process.env['RISK_PER_TRADE'] ?? 0.02);
const maxPositions = Number(process.env['MAX_POSITIONS'] ?? 8);
const jsonOutput = process.env['JSON_OUTPUT'] === '1';

const config: WorkflowConfig = {
  accountSize,
  riskPerTrade,
  maxPositions,
  targetWeeklyReturn: 0.05,
  strategies: ['momentum', 'catalyst', 'technical-reversal', 'index-inclusion'] as StrategyName[],
  universe: 'SP500_NASDAQ',
};

const workflow = new PortfolioWorkflow(config);

try {
  const brief = await workflow.run();

  if (jsonOutput) {
    console.log(JSON.stringify(brief, null, 2));
  } else {
    PortfolioWorkflow.printSummary(brief);
  }
} catch (err) {
  console.error('[PortfolioWorkflow] Fatal error:', err);
  process.exit(1);
}
