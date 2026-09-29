import { Injectable } from '@nestjs/common';
import { MarketDataProvider } from '../market-data/providers/market-data.provider';
import { PortfolioRepository } from '../portfolios/portfolio.repository';
import { CacheService } from '../cache/cache.service';
import { D, money, percentage, replayLedger, valuePosition } from '../holdings/holdings.calculator';
import { serializeTransaction } from '../transactions/transaction.service';
@Injectable()
export class HoldingsService {
  constructor(
    private repo: PortfolioRepository,
    private market: MarketDataProvider,
    private cache: CacheService,
  ) {}
  get marketSource() {
    return this.market.source ?? 'mock';
  }
  async snapshot(userId: string, id: string) {
    const portfolio = await this.repo.owned(userId, id);
    return this.cache.remember(
      `portfolio:summary:${this.marketSource}:${id}:v${portfolio.revision}`,
      this.marketSource === 'yahoo' ? 0 : 45,
      async () => {
        const entries = await this.repo.entries(id);
        const ledger = replayLedger(entries);
        const stocks = new Map(entries.filter((t) => t.stock).map((t) => [t.stockId!, t.stock!]));
        const quotes = new Map(
          (await this.market.getQuotes([...stocks.values()].map((s) => s.symbol))).map((q) => [
            q.symbol,
            q,
          ]),
        );
        const positions = [...ledger.positions.values()].map((p) => {
          const stock = stocks.get(p.stockId)!;
          const quote = quotes.get(stock.symbol)!;
          return {
            ...valuePosition(p, quote.price, quote.previousClose),
            stock,
            marketData: {
              source: this.marketSource,
              updatedAt: quote.updatedAt,
              fetchedAt: quote.fetchedAt,
            },
            peRatio: quote.peRatio ?? null,
            latestEarnings: quote.latestEarnings ?? null,
          };
        });
        const active = positions.filter((p) => p.quantity > 0);
        const securities = [...ledger.positions.values()].reduce(
          (a, p) => a.plus(p.quantity.mul(quotes.get(stocks.get(p.stockId)!.symbol)!.price)),
          D(0),
        );
        const invested = [...ledger.positions.values()].reduce((a, p) => a.plus(p.cost), D(0));
        const totalValue = securities.plus(ledger.cash);
        const totalPnL = totalValue.minus(ledger.externalCapital);
        const today = new Date().toISOString().slice(0, 10);
        const prior = replayLedger(
          entries.filter((t) => t.transactionDate.toISOString().slice(0, 10) < today),
        );
        const priorValue = [...prior.positions.values()].reduce(
          (a, p) =>
            a.plus(p.quantity.mul(quotes.get(stocks.get(p.stockId)!.symbol)!.previousClose)),
          prior.cash,
        );
        const todayFlow = ledger.externalCapital.minus(prior.externalCapital);
        const dayPnL = totalValue.minus(priorValue).minus(todayFlow);
        const summary = {
          portfolioValue: money(totalValue),
          securitiesValue: money(securities),
          investedAmount: money(invested),
          netContributions: money(ledger.externalCapital),
          totalPnL: money(totalPnL),
          totalPnLPercentage: percentage(totalPnL, ledger.grossContributions),
          todayPnL: money(dayPnL),
          todayPnLPercentage: percentage(dayPnL, priorValue),
          cashBalance: money(ledger.cash),
          holdingsCount: active.length,
          currency: portfolio.baseCurrency,
          marketDataSource: this.marketSource,
        };
        const holdings = active.map((p) => ({
          ...p,
          allocationPercentage: percentage(p.currentValue, securities) ?? 0,
        }));
        const group = (key: 'assetType' | 'sector') => {
          const result = new Map<string, number>();
          for (const h of holdings)
            result.set(h.stock[key], (result.get(h.stock[key]) ?? 0) + h.currentValue);
          return [...result].map(([label, value]) => ({
            ...(key === 'assetType' ? { type: label } : { sector: label }),
            value: money(value),
            percentage: percentage(value, securities) ?? 0,
          }));
        };
        return {
          summary,
          holdings,
          positions,
          allocation: { assetAllocation: group('assetType'), sectorAllocation: group('sector') },
          recentTransactions: entries.slice(-5).reverse().map(serializeTransaction),
        };
      },
    );
  }
  async summary(u: string, id: string) {
    return (await this.snapshot(u, id)).summary;
  }
  async holdings(u: string, id: string) {
    return (await this.snapshot(u, id)).holdings;
  }
  async allocation(u: string, id: string) {
    return (await this.snapshot(u, id)).allocation;
  }
}
