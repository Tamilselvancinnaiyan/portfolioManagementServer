import { CacheService } from '../../cache/cache.service';
import { PrismaService } from '../../database/prisma.service';
import { YahooFinanceClient } from './yahoo-finance.client';
import { YahooMarketDataProvider, yahooSymbol } from './yahoo-market-data.provider';

describe('Yahoo market data with demand-driven Redis caching', () => {
  let now: number;
  let provider: YahooMarketDataProvider;
  let quote: jest.Mock;
  let history: jest.Mock;
  let set: jest.Mock;
  let redisGet: jest.Mock;
  beforeEach(() => {
    now = 0;
    const values = new Map<string, { value: string; expires: number }>();
    redisGet = jest.fn(async (key: string) => {
      const stored = values.get(key);
      return stored && stored.expires > now ? stored.value : null;
    });
    set = jest.fn(async (key: string, value: string, _mode: string, ttl: number) => {
      values.set(key, { value, expires: now + ttl * 1000 });
    });
    const cache = Object.assign(Object.create(CacheService.prototype), {
      redis: { get: redisGet, set },
    }) as CacheService;
    quote = jest.fn(async () => ({
      regularMarketPrice: 1510.4,
      regularMarketPreviousClose: 1498.1,
      currency: 'INR',
      regularMarketTime: new Date('2026-09-24T10:00:00Z'),
      trailingPE: 25,
      epsTrailingTwelveMonths: 60.416,
    }));
    history = jest.fn(async () => ({
      meta: { currency: 'INR', exchangeTimezoneName: 'Asia/Kolkata' },
      quotes: [
        { date: new Date('2026-09-25T03:45:00Z'), close: 100 },
        { date: new Date('2026-09-28T03:45:00Z'), close: 110 },
      ],
    }));
    const db = {
      stock: {
        findUnique: jest.fn(async ({ where }) => ({
          symbol: where.symbol,
          exchange: where.symbol === 'AAPL' ? 'NASDAQ' : 'NSE',
          currency: where.symbol === 'AAPL' ? 'USD' : 'INR',
        })),
      },
    } as unknown as PrismaService;
    provider = new YahooMarketDataProvider(cache, db, {
      quote,
      history,
    } as unknown as YahooFinanceClient);
  });
  it('maps NSE/BSE suffixes and preserves US symbols', () => {
    expect(yahooSymbol('RELIANCE', 'NSE')).toBe('RELIANCE.NS');
    expect(yahooSymbol('500325', 'BSE')).toBe('500325.BO');
    expect(yahooSymbol('AAPL', 'NASDAQ')).toBe('AAPL');
    expect(yahooSymbol('RELIANCE.NS', 'NSE')).toBe('RELIANCE.NS');
  });
  it('reuses quotes for five minutes, then fetches only on the next request', async () => {
    const first = await provider.getQuote('RELIANCE');
    expect(first).toMatchObject({
      price: 1510.4,
      source: 'yahoo',
      updatedAt: '2026-09-24T10:00:00.000Z',
      peRatio: 25,
    });
    expect(set).toHaveBeenCalledWith(
      'stock:quote:yahoo:v1:RELIANCE',
      expect.any(String),
      'EX',
      300,
    );
    now = 299999;
    expect(await provider.getQuote('RELIANCE')).toEqual(first);
    expect(quote).toHaveBeenCalledTimes(1);
    now = 300000;
    expect(quote).toHaveBeenCalledTimes(1);
    quote.mockResolvedValueOnce({
      ...(await quote.mock.results[0].value),
      regularMarketPrice: 1520,
    });
    expect((await provider.getQuote('RELIANCE')).price).toBe(1520);
    expect(quote).toHaveBeenCalledTimes(2);
  });
  it('coalesces concurrent misses and deduplicates requested symbols', async () => {
    await Promise.all([
      provider.getQuote('RELIANCE'),
      provider.getQuote('reliance'),
      provider.getQuotes(['RELIANCE', 'RELIANCE']),
    ]);
    expect(quote).toHaveBeenCalledTimes(1);
  });
  it('does not cache upstream failures or manufacture zero/mock prices', async () => {
    quote.mockRejectedValueOnce(new Error('Rate limited'));
    await expect(provider.getQuote('RELIANCE')).rejects.toMatchObject({
      response: { errorCode: 'MARKET_DATA_UNAVAILABLE' },
    });
    expect(set).not.toHaveBeenCalled();
    expect((await provider.getQuote('RELIANCE')).price).toBeGreaterThan(0);
  });
  it('rejects missing prices and incompatible currency', async () => {
    quote.mockResolvedValueOnce({ regularMarketPrice: 0 });
    await expect(provider.getQuote('RELIANCE')).rejects.toThrow();
    await expect(provider.getQuote('AAPL')).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });
  it('fetches successfully when Redis is unavailable', async () => {
    redisGet.mockRejectedValue(new Error('Redis unavailable'));
    set.mockRejectedValue(new Error('Redis unavailable'));
    expect((await provider.getQuote('RELIANCE')).price).toBe(1510.4);
  });
  it('forward-fills weekend closes without using future prices and caches history', async () => {
    const start = new Date('2026-09-26'),
      end = new Date('2026-09-28');
    expect(await provider.getHistoricalPrices('RELIANCE', start, end)).toEqual([
      { date: '2026-09-26', price: 100 },
      { date: '2026-09-27', price: 100 },
      { date: '2026-09-28', price: 110 },
    ]);
    await provider.getHistoricalPrices('RELIANCE', start, end);
    expect(history).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledWith(
      'RELIANCE.NS',
      new Date('2026-09-12'),
      new Date('2026-09-29'),
    );
  });
  it('maps benchmark symbols and does not invent pre-listing prices', async () => {
    const points = await provider.getBenchmarkHistory(
      'NIFTY50',
      new Date('2026-09-24'),
      new Date('2026-09-26'),
    );
    expect(history.mock.calls[0][0]).toBe('^NSEI');
    expect(points[0]).toEqual({ date: '2026-09-25', price: 100 });
  });
});
