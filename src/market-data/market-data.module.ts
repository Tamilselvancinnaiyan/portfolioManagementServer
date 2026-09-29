import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../database/prisma.service';
import { MarketDataProvider } from './providers/market-data.provider';
import { MockMarketDataProvider } from './providers/mock-market-data.provider';
import { YahooMarketDataProvider } from './providers/yahoo-market-data.provider';
import { YahooFinanceClient } from './providers/yahoo-finance.client';
@Module({
  providers: [
    {
      provide: MarketDataProvider,
      inject: [ConfigService, CacheService, PrismaService],
      useFactory: (
        config: ConfigService,
        cache: CacheService,
        db: PrismaService,
      ): MarketDataProvider =>
        config.get<string>('MARKET_DATA_PROVIDER') === 'mock'
          ? new MockMarketDataProvider(cache)
          : new YahooMarketDataProvider(cache, db, new YahooFinanceClient()),
    },
  ],
  exports: [MarketDataProvider],
})
export class MarketDataModule {}
