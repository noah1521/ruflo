/**
 * Typed HTTP client for Financial Modeling Prep (FMP) API v3.
 * Requires FMP_API_KEY environment variable.
 * All methods return empty arrays / null on HTTP errors rather than throwing.
 */

export class FmpUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FmpUnavailableError';
  }
}

export interface FmpQuote {
  symbol: string;
  price: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
  changesPercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  yearHigh: number;
  yearLow: number;
  exchange: string;
  name: string;
}

export interface FmpIndicatorResult {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi?: number;
  sma?: number;
  ema?: number;
  macd?: number;
  signal?: number;
  histogram?: number;
}

export interface FmpScreenerResult {
  symbol: string;
  companyName: string;
  marketCap: number;
  sector: string;
  industry: string;
  beta: number;
  price: number;
  lastAnnualDividend: number;
  volume: number;
  exchange: string;
  exchangeShortName: string;
  country: string;
  isEtf: boolean;
  isActivelyTrading: boolean;
}

export interface FmpGainer {
  symbol: string;
  name: string;
  change: number;
  changesPercentage: number;
  price: number;
  exchange: string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class FmpClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://financialmodelingprep.com/api/v3';

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env['FMP_API_KEY'] ?? '';
    if (!this.apiKey) {
      throw new FmpUnavailableError('FMP_API_KEY not set');
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private url(path: string, params: Record<string, string | number> = {}): string {
    const qs = new URLSearchParams({ apikey: this.apiKey });
    for (const [k, v] of Object.entries(params)) {
      qs.set(k, String(v));
    }
    return `${this.baseUrl}${path}?${qs.toString()}`;
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
    try {
      const result = await Promise.race([
        fetch(url).then(async (res) => {
          if (!res.ok) { console.warn(`[fmp-client] HTTP ${res.status}`); return null; }
          return res.json() as Promise<T>;
        }),
        timeout,
      ]);
      return result;
    } catch (err) {
      console.warn(`[fmp-client] Fetch error: ${(err as Error).message}`);
      return null;
    }
  }

  // ─── Public methods ──────────────────────────────────────────────────────────

  async getQuote(symbol: string): Promise<FmpQuote | null> {
    const data = await this.fetchJson<FmpQuote[]>(this.url(`/quote/${symbol}`));
    return data?.[0] ?? null;
  }

  async getBatchQuotes(symbols: string[]): Promise<FmpQuote[]> {
    if (symbols.length === 0) return [];
    const joined = symbols.join(',');
    const data = await this.fetchJson<FmpQuote[]>(this.url(`/quote/${joined}`));
    return data ?? [];
  }

  async getBiggestGainers(): Promise<FmpGainer[]> {
    const data = await this.fetchJson<FmpGainer[]>(this.url('/stock/gainers'));
    return data ?? [];
  }

  async getMostActive(): Promise<FmpGainer[]> {
    const data = await this.fetchJson<FmpGainer[]>(this.url('/stock/actives'));
    return data ?? [];
  }

  async getSMA(
    symbol: string,
    period: number,
    timeframe: string,
  ): Promise<FmpIndicatorResult[]> {
    const data = await this.fetchJson<{ technicalIndicators: FmpIndicatorResult[] }>(
      this.url(`/technical_indicator/${timeframe}/${symbol}`, {
        type: 'sma',
        period,
      }),
    );
    return data?.technicalIndicators ?? (Array.isArray(data) ? (data as FmpIndicatorResult[]) : []);
  }

  async getRSI(
    symbol: string,
    period: number,
    timeframe: string,
  ): Promise<FmpIndicatorResult[]> {
    const data = await this.fetchJson<FmpIndicatorResult[] | { technicalIndicators: FmpIndicatorResult[] }>(
      this.url(`/technical_indicator/${timeframe}/${symbol}`, {
        type: 'rsi',
        period,
      }),
    );
    if (Array.isArray(data)) return data;
    if (data && 'technicalIndicators' in data) return data.technicalIndicators;
    return [];
  }

  async screenStocks(params: {
    marketCapMoreThan?: number;
    volumeMoreThan?: number;
    sector?: string;
    limit?: number;
  }): Promise<FmpScreenerResult[]> {
    const qp: Record<string, string | number> = {};
    if (params.marketCapMoreThan !== undefined) qp.marketCapMoreThan = params.marketCapMoreThan;
    if (params.volumeMoreThan !== undefined) qp.volumeMoreThan = params.volumeMoreThan;
    if (params.sector) qp.sector = params.sector;
    if (params.limit !== undefined) qp.limit = params.limit;

    const data = await this.fetchJson<FmpScreenerResult[]>(this.url('/stock-screener', qp));
    return data ?? [];
  }
}
