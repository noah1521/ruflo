/**
 * Typed client for Bigdata.com news and catalyst search API.
 * Requires BIGDATA_API_KEY environment variable.
 * Gracefully returns [] if API key is absent or request fails.
 */

export class BigdataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BigdataUnavailableError';
  }
}

export interface BigdataSearchResult {
  id: string;
  headline: string;
  timestamp: string;
  source: { name: string };
  url: string;
  chunks: Array<{ cnum: number; text: string; relevance: number }>;
}

export interface BigdataSearchResponse {
  results: BigdataSearchResult[];
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class BigdataClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env['BIGDATA_API_KEY'] ?? '';
    this.baseUrl = process.env['BIGDATA_API_URL'] ?? 'https://api.bigdata.com/v1';
    if (!this.apiKey) throw new BigdataUnavailableError('BIGDATA_API_KEY not set');
  }

  private async fetchJson<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T | null> {
    try {
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
      const fetchPromise = fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const res = await Promise.race([fetchPromise, timeoutPromise]);
      if (!res) { console.warn(`[bigdata-client] Request timed out`); return null; }
      if (!res.ok) {
        console.warn(`[bigdata-client] HTTP ${res.status} for ${path}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      console.warn(`[bigdata-client] Fetch error: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Search news articles matching the given natural-language query.
   */
  async searchNews(
    query: string,
    options: {
      maxChunks?: number;
      fromDate?: string;
      symbols?: string[];
    } = {},
  ): Promise<BigdataSearchResult[]> {

    const payload: Record<string, unknown> = {
      query,
      max_chunks: options.maxChunks ?? 3,
    };
    if (options.fromDate) payload.from_date = options.fromDate;
    if (options.symbols?.length) payload.symbols = options.symbols;

    const data = await this.fetchJson<BigdataSearchResponse>('/search', payload);
    return data?.results ?? [];
  }

  /**
   * Search for catalyst events (earnings beats, analyst upgrades, index inclusions, etc.)
   * for the given symbols over the past `daysBack` days.
   */
  async searchCatalysts(
    symbols: string[],
    daysBack = 14,
  ): Promise<BigdataSearchResult[]> {
    if (symbols.length === 0) return [];

    const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const symbolList = symbols.slice(0, 20).join(', ');
    const query =
      `Earnings beat, analyst upgrade, analyst initiation, index inclusion, ` +
      `short squeeze, product launch, or major catalyst for ${symbolList}`;

    return this.searchNews(query, { fromDate, symbols, maxChunks: 2 });
  }
}
