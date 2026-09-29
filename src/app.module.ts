import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { InfrastructureModule } from './config/infrastructure.module';
import { AuthGuard } from './common/guards/auth.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PortfolioModule } from './portfolios/portfolio.module';
import { TransactionModule } from './transactions/transaction.module';
import { HoldingsModule } from './holdings/holdings.module';
import { StocksModule } from './stocks/stocks.module';
import { WatchlistModule } from './watchlists/watchlist.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DividendModule } from './dividends/dividend.module';
import { AlertModule } from './alerts/alert.module';
import { ImportModule } from './imports/import.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
@Module({
  imports: [
    InfrastructureModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    AuthModule,
    UsersModule,
    PortfolioModule,
    TransactionModule,
    HoldingsModule,
    StocksModule,
    WatchlistModule,
    AnalyticsModule,
    DividendModule,
    AlertModule,
    ImportModule,
    NotificationsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
