import { Injectable } from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';

/** Isolates the unofficial client's HTTP/session behavior from portfolio logic. */
@Injectable()
export class YahooFinanceClient {
  private readonly client = new YahooFinance({
    suppressNotices: ['yahooSurvey'],
    queue: { concurrency: 4 },
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)])
          : AbortSignal.timeout(10000),
      }),
    // Provider logs sanitized failures; client diagnostics can include upstream session data.
    logger: { info() {}, warn() {}, error() {}, debug() {}, dir() {} },
  });

  quote(symbol: string) {
    return this.client.quote(symbol);
  }
  history(symbol: string, start: Date, end: Date) {
    return this.client.chart(symbol, {
      period1: start,
      period2: end,
      interval: '1d',
      return: 'array',
    });
  }
}
