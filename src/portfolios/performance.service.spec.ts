import { PerformanceService } from './performance.service';
import { PortfolioRepository } from './portfolio.repository';
import { MarketDataProvider } from '../market-data/providers/market-data.provider';
import { HoldingsService } from '../holdings/holdings.service';
import { CacheService } from '../cache/cache.service';

describe('historical valuation and cash-flow adjusted performance', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-01-03T12:00:00Z')));
  afterEach(() => jest.useRealTimers());
  const entry = (type: string, date: string, amount = 0, quantity = 0, price = 0) => ({
    type,
    stockId: ['BUY', 'SELL', 'DIVIDEND'].includes(type) ? 's' : null,
    stock: ['BUY', 'SELL', 'DIVIDEND'].includes(type)
      ? { id: 's', symbol: 'TEST', assetType: 'US_EQUITY', sector: 'Technology' }
      : null,
    transactionDate: new Date(date),
    amount,
    quantity,
    price,
    fees: 0,
    sequence: 1n,
  });
  const setup = (entries: ReturnType<typeof entry>[]) => {
    const repo = {
      owned: jest.fn().mockResolvedValue({ id: 'p', revision: 1, baseCurrency: 'USD' }),
      entries: jest.fn().mockResolvedValue(entries),
    } as unknown as PortfolioRepository;
    const market = {
      getHistoricalPrices: jest.fn().mockResolvedValue([
        { date: '2025-12-31', price: 100 },
        { date: '2026-01-01', price: 100 },
        { date: '2026-01-02', price: 110 },
        { date: '2026-01-03', price: 121 },
      ]),
      getQuotes: jest.fn().mockResolvedValue([{ symbol: 'TEST', price: 121, previousClose: 110 }]),
    } as unknown as MarketDataProvider;
    return {
      performance: new PerformanceService(repo, market),
      holdings: new HoldingsService(repo, market, {
        remember: (_k: string, _t: number, fn: () => unknown) => fn(),
      } as unknown as CacheService),
    };
  };
  it('does not mistake a deposit for a gain', async () => {
    const { performance } = setup([
      entry('DEPOSIT', '2026-01-01', 1000),
      entry('BUY', '2026-01-01', 0, 10, 100),
      entry('DEPOSIT', '2026-01-02', 1000),
    ]);
    const points = await performance.series('u', 'p');
    expect(points[0].portfolioValue).toBe(1000);
    expect(points[1].portfolioValue).toBe(2100);
    expect(points[1].dailyReturn).toBeCloseTo(0.05);
    expect(points[2].portfolioValue).toBe(2210);
    expect(points[2].returnPercentage).toBe(10.5);
  });
  it('reconstructs quantities at each historical date instead of projecting current holdings backwards', async () => {
    const { performance } = setup([
      entry('DEPOSIT', '2026-01-01', 1000),
      entry('BUY', '2026-01-02', 0, 5, 110),
      entry('SELL', '2026-01-03', 0, 2, 121),
    ]);
    expect((await performance.series('u', 'p')).map((p) => p.portfolioValue)).toEqual([
      1000, 1000, 1055,
    ]);
  });
  it('reports a cash-only withdrawal as zero return', async () => {
    const { performance } = setup([
      entry('DEPOSIT', '2026-01-01', 1000),
      entry('WITHDRAWAL', '2026-01-02', 400),
    ]);
    const points = await performance.series('u', 'p');
    expect(points[1].portfolioValue).toBe(600);
    expect(points[1].dailyReturn).toBe(0);
  });
  it('does not invent returns for an unfunded manual ledger', async () => {
    const { performance } = setup([entry('BUY', '2026-01-01', 0, 10, 100)]);
    expect((await performance.series('u', 'p')).at(-1)!.returnPercentage).toBeNull();
  });
  it('values summary, dividends, and allocations from one replay', async () => {
    const { holdings } = setup([
      entry('DEPOSIT', '2026-01-01', 1000),
      entry('BUY', '2026-01-01', 0, 10, 100),
      entry('DIVIDEND', '2026-01-03', 20),
    ]);
    const snapshot = await holdings.snapshot('u', 'p');
    expect(snapshot.summary).toMatchObject({
      portfolioValue: 1230,
      investedAmount: 1000,
      totalPnL: 230,
      totalPnLPercentage: 23,
      cashBalance: 20,
      todayPnL: 130,
      holdingsCount: 1,
    });
    expect(snapshot.allocation.assetAllocation).toEqual([
      { type: 'US_EQUITY', value: 1210, percentage: 100 },
    ]);
    expect(snapshot.holdings[0].allocationPercentage).toBe(100);
  });
});
