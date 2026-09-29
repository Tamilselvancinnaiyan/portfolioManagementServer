import { HoldingsModule } from '../holdings/holdings.module';
import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { PortfolioCoreModule } from './portfolio-core.module';
import { PortfolioService } from './portfolio.service';
import { PerformanceService } from './performance.service';
import { PortfolioController } from './portfolio.controller';

@Module({
  imports: [PortfolioCoreModule, MarketDataModule, HoldingsModule],
  controllers: [PortfolioController],
  providers: [PortfolioService, PerformanceService],
  exports: [HoldingsModule, PerformanceService],
})
export class PortfolioModule {}
