import { Injectable } from '@nestjs/common';
import { PerformanceService } from '../portfolios/performance.service';
import { PortfolioRepository } from '../portfolios/portfolio.repository';
import { HoldingsService } from '../holdings/holdings.service';
import { MarketDataProvider } from '../market-data/providers/market-data.provider';
import { AnalyticsCalculator as C } from './analytics.calculator';
import { money, percentage } from '../holdings/holdings.calculator';
@Injectable()
export class AnalyticsService {
  constructor(
    private performance: PerformanceService,
    private repo: PortfolioRepository,
    private valuation: HoldingsService,
    private market: MarketDataProvider,
  ) {}
  async get(u: string, id: string) {
    const portfolio = await this.repo.owned(u, id);
    const [points, entries] = await Promise.all([
      this.performance.series(u, id),
      this.repo.entries(id),
    ]);
    const empty = {
      absoluteReturn: null,
      CAGR: null,
      XIRR: null,
      volatility: null,
      SharpeRatio: null,
      maximumDrawdown: null,
      beta: null,
    };
    if (points.length < 2) return empty;
    const valid = points.every((p) => p.dailyReturn !== null);
    const returns = points.map((p) => p.dailyReturn ?? 0);
    let index = 1;
    const indices = [1, ...returns.map((r) => (index *= 1 + r))];
    const benchmarkSymbol = portfolio.baseCurrency === 'INR' ? 'NIFTY50' : 'SP500';
    const benchmark = await this.market.getBenchmarkHistory(
      benchmarkSymbol,
      new Date(new Date(points[0].date).getTime() - 86400000),
      new Date(points.at(-1)!.date),
    );
    const benchmarkReturns = benchmark.slice(1).map((p, i) => p.price / benchmark[i].price - 1);
    const flows = entries
      .filter((t) => ['DEPOSIT', 'WITHDRAWAL'].includes(t.type))
      .map((t) => ({
        date: t.transactionDate,
        amount: Number(t.amount) * (t.type === 'DEPOSIT' ? -1 : 1),
      }));
    flows.push({ date: new Date(points.at(-1)!.date), amount: points.at(-1)!.portfolioValue });
    const years = (Date.parse(points.at(-1)!.date) - Date.parse(points[0].date)) / 86400000 / 365;
    return {
      absoluteReturn: valid ? money((index - 1) * 100) : null,
      CAGR: valid ? C.cagr(1, index, years) : null,
      XIRR: C.xirr(flows),
      volatility: valid ? C.volatility(returns) : null,
      SharpeRatio: valid ? C.sharpe(returns) : null,
      maximumDrawdown: valid ? C.maximumDrawdown(indices) : null,
      beta: valid ? C.beta(returns, benchmarkReturns) : null,
      methodology: {
        benchmark: benchmarkSymbol,
        annualPeriods: 365,
        riskFreeRate: 0,
        cashFlowTiming: 'beginning-of-day',
        prices: this.market.source === 'yahoo' ? 'yahoo' : 'synthetic',
      },
    };
  }
  async monthly(u: string, id: string) {
    const points = await this.performance.series(u, id);
    const groups = new Map<string, { value: number; valid: boolean }>();
    for (const p of points) {
      const key = p.date.slice(0, 7),
        g = groups.get(key) ?? { value: 1, valid: true };
      if (p.dailyReturn === null) g.valid = false;
      else g.value *= 1 + p.dailyReturn;
      groups.set(key, g);
    }
    return [...groups].map(([key, g]) => ({
      year: Number(key.slice(0, 4)),
      month: Number(key.slice(5)),
      return: g.valid ? money((g.value - 1) * 100) : null,
    }));
  }
  async contribution(u: string, id: string) {
    const snapshot = await this.valuation.snapshot(u, id);
    return snapshot.positions.map((p) => ({
      symbol: p.stock.symbol,
      contribution: money(p.unrealizedPnL + p.realizedPnL + p.dividends),
      contributionPercentage: percentage(
        p.unrealizedPnL + p.realizedPnL + p.dividends,
        snapshot.summary.netContributions,
      ),
    }));
  }
}
