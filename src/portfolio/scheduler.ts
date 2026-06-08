import { PortfolioWorkflow } from './workflow.js';
import type { WorkflowConfig } from './types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchedulerConfig {
  marketOpenHour: number;    // ET hour, default 9
  marketOpenMinute: number;  // ET minute, default 30
  preMarketHour: number;     // ET hour for pre-market scan, default 8
  preMarketMinute: number;
  runOnWeekends: boolean;
  preMarketScan: boolean;
  workflowConfig: WorkflowConfig;
}

interface ETTime {
  hour: number;
  minute: number;
  dayOfWeek: number;   // 0 = Sunday, 6 = Saturday
  dateStr: string;     // YYYY-MM-DD
}

// ─── ET time helpers ──────────────────────────────────────────────────────────

function getETTime(date: Date = new Date()): ETTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';

  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const weekdayStr = get('weekday');
  const year = get('year');
  const month = get('month');
  const day = get('day');

  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = weekdays[weekdayStr] ?? 0;

  return { hour, minute, dayOfWeek, dateStr: `${year}-${month}-${day}` };
}

function nextETTime(targetHour: number, targetMinute: number): Date {
  const now = new Date();
  const et = getETTime(now);

  // Build a candidate date in ET
  const candidate = new Date(now);
  const minutesUntil =
    (targetHour - et.hour) * 60 + (targetMinute - et.minute);

  if (minutesUntil <= 0) {
    // Already past today — target tomorrow
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  candidate.setUTCMinutes(candidate.getUTCMinutes() + (minutesUntil <= 0 ? minutesUntil + 1440 : minutesUntil));
  return candidate;
}

// ─── Scheduler class ──────────────────────────────────────────────────────────

export class PortfolioScheduler {
  private config: SchedulerConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRunDate: string | null = null;
  private lastPreMarketDate: string | null = null;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = {
      marketOpenHour: 9,
      marketOpenMinute: 30,
      preMarketHour: 8,
      preMarketMinute: 0,
      runOnWeekends: false,
      preMarketScan: false,
      workflowConfig: {
        accountSize: parseInt(process.env['ACCOUNT_SIZE'] ?? '10000', 10),
        riskPerTrade: parseFloat(process.env['RISK_PER_TRADE'] ?? '0.02'),
        maxPositions: parseInt(process.env['MAX_POSITIONS'] ?? '8', 10),
        targetWeeklyReturn: 0.05,
        strategies: ['momentum', 'catalyst', 'technical-reversal', 'index-inclusion'],
        universe: 'SP500_NASDAQ',
      },
      ...config,
    };
  }

  isTradingDay(date: Date = new Date()): boolean {
    const { dayOfWeek } = getETTime(date);
    if (!this.config.runOnWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) return false;
    return true;
  }

  nextRunAt(): string {
    const next = nextETTime(this.config.marketOpenHour, this.config.marketOpenMinute);
    // Advance past weekends
    while (!this.isTradingDay(next)) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.toISOString();
  }

  async runNow(): Promise<void> {
    console.log('[Scheduler] Running portfolio cycle now...');
    try {
      const workflow = new PortfolioWorkflow(this.config.workflowConfig);
      const brief = await workflow.run();
      PortfolioWorkflow.printSummary(brief);
      console.log('[Scheduler] Cycle complete.');
    } catch (err) {
      console.error('[Scheduler] Cycle failed:', (err as Error).message);
    }
  }

  start(): void {
    if (this.timer) return;

    console.log(`[Scheduler] Started. Next market-open run: ${this.nextRunAt()}`);
    if (this.config.preMarketScan) {
      console.log(`[Scheduler] Pre-market scan enabled at ${this.config.preMarketHour}:${String(this.config.preMarketMinute).padStart(2, '0')} ET`);
    }

    // Check every minute
    this.timer = setInterval(() => this._tick(), 60_000);
    // Also tick immediately in case we start right at the target time
    void this._tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[Scheduler] Stopped.');
    }
  }

  private async _tick(): Promise<void> {
    const et = getETTime();
    if (!this.isTradingDay()) return;

    const isMarketOpen =
      et.hour === this.config.marketOpenHour &&
      et.minute === this.config.marketOpenMinute;

    const isPreMarket =
      this.config.preMarketScan &&
      et.hour === this.config.preMarketHour &&
      et.minute === this.config.preMarketMinute;

    if (isMarketOpen && this.lastRunDate !== et.dateStr) {
      this.lastRunDate = et.dateStr;
      console.log(`[Scheduler] Market open trigger (${et.dateStr} ${et.hour}:${String(et.minute).padStart(2, '0')} ET)`);
      await this.runNow();
      console.log(`[Scheduler] Next run: ${this.nextRunAt()}`);
    }

    if (isPreMarket && this.lastPreMarketDate !== et.dateStr) {
      this.lastPreMarketDate = et.dateStr;
      console.log(`[Scheduler] Pre-market scan trigger (${et.dateStr})`);
      await this.runNow();
    }
  }
}
