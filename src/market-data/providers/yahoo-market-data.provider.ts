import { marketDataUnavailable } from '../../common/exceptions/market-data.exception';
import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service';
import { PrismaService } from '../../database/prisma.service';
import { MarketDataProvider, Quote, HistoricalPrice } from './market-data.provider';
import { YahooFinanceClient } from './yahoo-finance.client';

export const YAHOO_CACHE_TTL = 300;
const DAY = 86400000;
const BENCHMARK_SYMBOLS: Record<string, string> = {
  NIFTY50: '^NSEI',
  SENSEX: '^BSESN',
  NASDAQ100: '^NDX',
  SP500: '^GSPC',
};
export function yahooSymbol(symbol: string, exchange: string): string {
  if (symbol.includes('.') || symbol.startsWith('^')) return symbol;
  if (exchange === 'NSE') return `${symbol}.NS`;
  if (exchange === 'BSE') return `${symbol}.BO`;
  return symbol;
}
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const optionalNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

@Injectable()
export class YahooMarketDataProvider extends MarketDataProvider {
  override readonly source = 'yahoo';
  private readonly logger = new Logger(YahooMarketDataProvider.name);
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(
    private cache: CacheService,
    private db: PrismaService,
    private client: YahooFinanceClient,
  ) {
    super();
  }

  /** Coalesce concurrent misses in this process; Redis shares successful responses across API/worker. */
  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const result = this.cache
      .remember(key, YAHOO_CACHE_TTL, async () => {
        try {
          return await load();
        } catch (error) {
          if (error instanceof NotFoundException) throw error;
          this.logger.warn({ event: 'yahoo_market_data_unavailable', key });
          throw marketDataUnavailable();
        }
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, result);
    return result;
  }
  private async stock(symbol: string) {
    const stock = await this.db.stock.findUnique({ where: { symbol } });
    if (!stock) throw new NotFoundException('Unknown market symbol');
    return stock;
  }
  getQuote(symbol: string): Promise<Quote> {
    symbol = symbol.trim().toUpperCase();
    return this.cached(`stock:quote:yahoo:v1:${symbol}`, async () => {
      const stock = await this.stock(symbol);
      const result = await this.client.quote(yahooSymbol(symbol, stock.exchange));
      if (
        !positive(result.regularMarketPrice) ||
        !positive(result.regularMarketPreviousClose) ||
        result.currency !== stock.currency ||
        !(result.regularMarketTime instanceof Date) ||
        !Number.isFinite(result.regularMarketTime.getTime())
      )
        throw marketDataUnavailable();
      const price = result.regularMarketPrice,
        previousClose = result.regularMarketPreviousClose;
      return {
        symbol,
        price,
        previousClose,
        change: Number((price - previousClose).toFixed(8)),
        changePercentage: Number((((price - previousClose) / previousClose) * 100).toFixed(2)),
        currency: result.currency,
        updatedAt: result.regularMarketTime.toISOString(),
        fetchedAt: new Date().toISOString(),
        source: 'yahoo',
        peRatio: optionalNumber(result.trailingPE ?? result.forwardPE),
        latestEarnings: optionalNumber(result.epsTrailingTwelveMonths),
      };
    });
  }
  getQuotes(symbols: string[]) {
    return Promise.all(
      [...new Set(symbols.map((s) => s.trim().toUpperCase()))].map((s) => this.getQuote(s)),
    );
  }

  async getHistoricalPrices(symbol: string, start: Date, end: Date): Promise<HistoricalPrice[]> {
    const stock = await this.stock(symbol);
    return this.history(yahooSymbol(symbol, stock.exchange), start, end, stock.currency);
  }
  getBenchmarkHistory(symbol: string, start: Date, end: Date): Promise<HistoricalPrice[]> {
    const mapped = BENCHMARK_SYMBOLS[symbol];
    if (!mapped) throw new NotFoundException('Unknown benchmark');
    return this.history(mapped, start, end);
  }
  private history(
    symbol: string,
    start: Date,
    end: Date,
    currency?: string,
  ): Promise<HistoricalPrice[]> {
    const first = start.toISOString().slice(0, 10),
      last = end.toISOString().slice(0, 10);
    return this.cached(`stock:history:yahoo:v1:${symbol}:${first}:${last}`, async () => {
      // Yahoo returns sessions, not weekends. Fetch an earlier close for forward filling only.
      const result = await this.client.history(
        symbol,
        new Date(Date.parse(first) - 14 * DAY),
        new Date(Date.parse(last) + DAY),
      );
      if (currency && result.meta.currency !== currency) throw marketDataUnavailable();
      const sessions = new Map<string, number>();
      const timeZone = result.meta.exchangeTimezoneName;
      if (!timeZone) throw marketDataUnavailable();
      for (const q of result.quotes) {
        if (!positive(q.close)) continue;
        const date = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(q.date);
        sessions.set(date, q.close);
      }
      if (!sessions.size) throw marketDataUnavailable();
      const ordered = [...sessions].sort(([a], [b]) => a.localeCompare(b));
      let cursor = 0,
        price: number | undefined;
      const points: HistoricalPrice[] = [];
      for (let t = Date.parse(first); t <= Date.parse(last); t += DAY) {
        const date = new Date(t).toISOString().slice(0, 10);
        while (cursor < ordered.length && ordered[cursor][0] <= date) price = ordered[cursor++][1];
        // Leading dates before listing stay absent: never backfill from a future price.
        if (price !== undefined) points.push({ date, price });
      }
      return points;
    });
  }
}
