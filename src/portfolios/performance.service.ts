import { marketDataUnavailable } from '../common/exceptions/market-data.exception';
import { Injectable } from '@nestjs/common';
import { MarketDataProvider } from '../market-data/providers/market-data.provider';
import { PortfolioRepository } from './portfolio.repository';
import { PerformanceQuery } from './performance.dto';
import { applyEntry, D, money, replayLedger } from '../holdings/holdings.calculator';
export interface PerformancePoint {
  date: string;
  portfolioValue: number;
  investedAmount: number;
  netContributions: number;
  externalFlow: number;
  dailyReturn: number | null;
  returnPercentage: number | null;
}
@Injectable()
export class PerformanceService {
  constructor(
    private repo: PortfolioRepository,
    private market: MarketDataProvider,
  ) {}
  async series(
    u: string,
    id: string,
    period: PerformanceQuery['period'] = 'MAX',
  ): Promise<PerformancePoint[]> {
    await this.repo.owned(u, id);
    const entries = await this.repo.entries(id);
    if (!entries.length) return [];
    const today = new Date(new Date().toISOString().slice(0, 10));
    const first = entries[0].transactionDate;
    const start = new Date(today);
    const days = {
      '1D': 1,
      '1W': 7,
      '1M': 30,
      '3M': 90,
      '6M': 180,
      '1Y': 365,
      '3Y': 1095,
      '5Y': 1825,
    };
    if (period === 'MAX') start.setTime(first.getTime());
    else if (period === 'YTD') start.setUTCMonth(0, 1);
    else start.setUTCDate(start.getUTCDate() - days[period]);
    if (start < first) start.setTime(first.getTime());
    // Start one day earlier to derive the first displayed day's return, replaying all older trades once.
    const historyStart = new Date(start.getTime() - 86400000);
    const stocks = [
      ...new Map(entries.filter((t) => t.stock).map((t) => [t.stockId!, t.stock!])).values(),
    ];
    const histories = await Promise.all(
      stocks.map(
        async (s) =>
          [
            s.id,
            new Map(
              (await this.market.getHistoricalPrices(s.symbol, historyStart, today)).map((p) => [
                p.date,
                p.price,
              ]),
            ),
          ] as const,
      ),
    );
    const prices = new Map(histories),
      ledger = replayLedger([]),
      points: PerformancePoint[] = [];
    let cursor = 0,
      previousValue: number | null = null,
      index = 1,
      validIndex = true;
    for (let time = historyStart.getTime(); time <= today.getTime(); time += 86400000) {
      const date = new Date(time).toISOString().slice(0, 10);
      const priorCapital = ledger.externalCapital;
      while (cursor < entries.length && entries[cursor].transactionDate.getTime() <= time)
        applyEntry(ledger, entries[cursor++]);
      const value = [...ledger.positions.values()].reduce((v, p) => {
        if (p.quantity.isZero()) return v;
        const price = prices.get(p.stockId)?.get(date);
        if (price === undefined) throw marketDataUnavailable();
        return v.plus(p.quantity.mul(price));
      }, ledger.cash);
      const flow = ledger.externalCapital.minus(priorCapital).toNumber();
      const denominator = previousValue === null ? 0 : previousValue + flow;
      const dailyReturn =
        previousValue !== null && denominator > 0 && value.gte(0)
          ? value.toNumber() / denominator - 1
          : null;
      if (time >= start.getTime()) {
        if (dailyReturn !== null) index *= 1 + dailyReturn;
        else if (value.gt(0) || ledger.positions.size > 0) validIndex = false;
        points.push({
          date,
          portfolioValue: money(value),
          investedAmount: money(
            [...ledger.positions.values()].reduce((a, p) => a.plus(p.cost), D(0)),
          ),
          netContributions: money(ledger.externalCapital),
          externalFlow: money(flow),
          dailyReturn,
          returnPercentage: validIndex ? money((index - 1) * 100) : null,
        });
      }
      previousValue = value.toNumber();
    }
    return points;
  }
  async get(u: string, id: string, q: PerformanceQuery) {
    const portfolioPerformance = await this.series(u, id, q.period);
    if (!q.benchmark) return portfolioPerformance;
    if (!portfolioPerformance.length) return { portfolioPerformance, benchmarkPerformance: [] };
    const history = await this.market.getBenchmarkHistory(
      q.benchmark,
      new Date(Date.parse(portfolioPerformance[0].date) - 86400000),
      new Date(portfolioPerformance.at(-1)!.date),
    );
    return {
      portfolioPerformance,
      benchmarkPerformance: history.slice(1).map((p) => ({
        ...p,
        returnPercentage: money((p.price / history[0].price - 1) * 100),
      })),
    };
  }
}
