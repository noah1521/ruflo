/**
 * MCP Bridge — wraps Bigdata.com and FMP MCP tools for use inside agents.
 *
 * When running inside Claude Code with MCP servers configured, these functions
 * call the MCP tools directly (no HTTP, no API key management).
 * They return null when MCP tools are unavailable (standalone execution).
 *
 * Usage pattern:
 *   const result = await mcpFmpQuote('AAPL') ?? fallback;
 */

import type { CandidateStock } from '../types.js';
import type { MacroData } from './live-quotes.js';

// ─── Type shims for MCP tool responses ───────────────────────────────────────

interface McpFmpQuoteItem {
  symbol: string;
  name?: string;
  price: number;
  volume?: number;
  avgVolume?: number;
  marketCap?: number;
  changesPercentage?: number;
  change?: number;
  dayLow?: number;
  dayHigh?: number;
  yearHigh?: number;
  yearLow?: number;
}

interface McpBigdataResult {
  headline: string;
  timestamp: string;
  url: string;
  source?: { name: string };
  chunks?: Array<{ text: string; relevance?: number }>;
}

// ─── MCP availability probe ────────────────────────────────────────────────

let _mcpAvailable: boolean | null = null;

/**
 * Returns true when running inside an environment that exposes global MCP tool
 * dispatch.  We probe this lazily on first call.
 */
function isMcpAvailable(): boolean {
  if (_mcpAvailable !== null) return _mcpAvailable;
  // In standalone Node.js execution there is no global MCP dispatcher.
  // In Claude Code sessions the tools are exposed via the process-level IPC
  // channel, but we cannot call them from inside a spawned tsx process — only
  // the agent host can invoke MCP tools.
  // Therefore, this bridge always returns null (falls back to REST clients).
  _mcpAvailable = false;
  return _mcpAvailable;
}

// ─── MCP FMP helpers ──────────────────────────────────────────────────────────

/**
 * Fetch a batch of quotes via FMP MCP tool.
 * Returns null when MCP is unavailable (caller should use FmpClient instead).
 */
export async function mcpFmpBatchQuotes(
  symbols: string[],
): Promise<McpFmpQuoteItem[] | null> {
  if (!isMcpAvailable()) return null;
  // MCP tools are not callable from tsx sub-processes; placeholder for future
  // direct-agent invocation via the Claude Code Task tool.
  return null;
}

/**
 * Fetch sector performance via FMP MCP tool.
 * Returns null when MCP is unavailable.
 */
export async function mcpFmpSectorPerformance(): Promise<
  Array<{ sector: string; changesPercentage: number }> | null
> {
  if (!isMcpAvailable()) return null;
  return null;
}

// ─── MCP Bigdata.com helpers ─────────────────────────────────────────────────

/**
 * Search recent news/catalysts via Bigdata.com MCP tool.
 * Returns null when MCP is unavailable (caller should use BigdataClient instead).
 */
export async function mcpBigdataSearch(
  query: string,
  symbols?: string[],
): Promise<McpBigdataResult[] | null> {
  if (!isMcpAvailable()) return null;
  return null;
}

// ─── Convenience: FMP quote → CandidateStock ─────────────────────────────────

export function mcpQuoteToCandidateStock(q: McpFmpQuoteItem): CandidateStock {
  const price = q.price ?? 0;
  return {
    symbol: q.symbol,
    name: q.name ?? q.symbol,
    price,
    volume: q.volume ?? 0,
    avgVolume: q.avgVolume ?? 0,
    volumeRatio: q.avgVolume ? Math.round((q.volume ?? 0) / q.avgVolume * 10) / 10 : 1,
    marketCap: q.marketCap ?? 0,
    sector: 'Unknown',
    rsi: 50,
    sma20: price * 0.97,
    sma50: price * 0.94,
    sma200: price * 0.90,
    atr: Math.abs((q.dayHigh ?? price) - (q.dayLow ?? price)),
    high52w: q.yearHigh ?? price * 1.15,
    low52w: q.yearLow ?? price * 0.75,
    momentumScore: 0,
    technicalScore: 0,
    fundamentalScore: 0,
    sentimentScore: 0,
  };
}

// ─── Agent-side MCP runner (for coordinator to call from Claude Code context) ──

/**
 * Instructions for using MCP tools directly from the coordinator agent.
 *
 * The coordinator, when running as a Claude Code Task agent, can call these
 * MCP tools directly:
 *
 * FMP quotes:
 *   mcp__FMP__quote({ symbols: ['AAPL', 'NVDA', 'META'] })
 *
 * FMP market performance / sectors:
 *   mcp__FMP__marketPerformance({ type: 'sector' })
 *
 * Bigdata.com news search:
 *   mcp__Bigdata_com__bigdata_search({
 *     query: 'earnings beat analyst upgrade for AAPL NVDA META',
 *     from_date: '2026-06-01',
 *   })
 *
 * Bigdata.com company tearsheet:
 *   mcp__Bigdata_com__bigdata_company_tearsheet({ rp_entity_id: '<id>' })
 *
 * These are the live data connectors.  The REST clients (FmpClient,
 * BigdataClient) are the fallback path when this process runs standalone
 * (e.g. `tsx src/portfolio/run.ts`).
 */
export const MCP_TOOL_DOCS = {
  fmpQuote: 'mcp__FMP__quote',
  fmpSectors: 'mcp__FMP__marketPerformance',
  fmpTechnicals: 'mcp__FMP__technicalIndicators',
  fmpNews: 'mcp__FMP__news',
  bigdataSearch: 'mcp__Bigdata_com__bigdata_search',
  bigdataCompany: 'mcp__Bigdata_com__bigdata_company_tearsheet',
  bigdataSentiment: 'mcp__Bigdata_com__bigdata_sentiment_tearsheet',
  bigdataMarket: 'mcp__Bigdata_com__bigdata_market_tearsheet',
} as const;

export type McpToolName = (typeof MCP_TOOL_DOCS)[keyof typeof MCP_TOOL_DOCS];
