import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolios/portfolio.module';
import { PortfolioCoreModule } from '../portfolios/portfolio-core.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [PortfolioModule, PortfolioCoreModule, MarketDataModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
