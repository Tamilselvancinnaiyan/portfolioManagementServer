export interface Quote {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercentage: number;
  currency: string;
  updatedAt: string;
  fetchedAt?: string;
  source?: string;
  peRatio?: number | null;
  latestEarnings?: number | null;
}
export interface HistoricalPrice {
  date: string;
  price: number;
}
export abstract class MarketDataProvider {
  readonly source: string = 'mock';
  abstract getQuote(symbol: string): Promise<Quote>;
  abstract getQuotes(symbols: string[]): Promise<Quote[]>;
  abstract getHistoricalPrices(
    symbol: string,
    startDate: Date,
    endDate: Date,
  ): Promise<HistoricalPrice[]>;
  abstract getBenchmarkHistory(
    symbol: string,
    startDate: Date,
    endDate: Date,
  ): Promise<HistoricalPrice[]>;
}
