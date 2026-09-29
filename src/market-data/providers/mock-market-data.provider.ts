import { Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service';
import { BENCHMARKS, STOCKS } from '../mock-data';
import { HistoricalPrice, MarketDataProvider, Quote } from './market-data.provider';
@Injectable()
export class MockMarketDataProvider extends MarketDataProvider {
  constructor(private cache: CacheService) {
    super();
  }
  /** Stable by symbol and UTC day: overlapping historical requests always agree. */
  private price(symbol: string, base: number, date: Date) {
    const day = Math.floor(date.getTime() / 86400000) - 20720;
    const seed = [...symbol].reduce((a, c) => a + c.charCodeAt(0), 0);
    return (
      Math.round(
        base *
          Math.exp(
            day * 0.00018 + 0.045 * Math.sin(day / 23 + seed) + 0.012 * Math.sin(day / 3 + seed),
          ) *
          100,
      ) / 100
    );
  }
  async getQuote(symbol: string): Promise<Quote> {
    return this.cache.remember(`stock:quote:mock:${symbol}`, 60, async () => {
      const stock = STOCKS.find((s) => s[0] === symbol);
      if (!stock) throw new NotFoundException('Unknown market symbol');
      const today = new Date();
      const price = this.price(symbol, stock[7], today);
      const previousClose = this.price(symbol, stock[7], new Date(today.getTime() - 86400000));
      const change = Number((price - previousClose).toFixed(2));
      return {
        symbol,
        price,
        previousClose,
        change,
        changePercentage: Number(((change / previousClose) * 100).toFixed(2)),
        currency: stock[3],
        updatedAt: today.toISOString(),
      };
    });
  }
  getQuotes(symbols: string[]) {
    return Promise.all([...new Set(symbols)].map((s) => this.getQuote(s)));
  }
  private history(symbol: string, base: number, start: Date, end: Date): HistoricalPrice[] {
    const result: HistoricalPrice[] = [];
    for (
      let time = Date.parse(start.toISOString().slice(0, 10));
      time <= end.getTime();
      time += 86400000
    ) {
      const date = new Date(time);
      result.push({ date: date.toISOString().slice(0, 10), price: this.price(symbol, base, date) });
    }
    return result;
  }
  async getHistoricalPrices(symbol: string, start: Date, end: Date) {
    const stock = STOCKS.find((s) => s[0] === symbol);
    if (!stock) throw new NotFoundException('Unknown market symbol');
    return this.history(symbol, stock[7], start, end);
  }
  async getBenchmarkHistory(symbol: string, start: Date, end: Date) {
    const base = BENCHMARKS[symbol as keyof typeof BENCHMARKS];
    if (!base) throw new NotFoundException('Unknown benchmark');
    return this.history(symbol, base, start, end);
  }
}
