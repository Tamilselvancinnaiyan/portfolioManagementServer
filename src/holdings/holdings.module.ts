import { Module } from '@nestjs/common';
import { PortfolioCoreModule } from '../portfolios/portfolio-core.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { HoldingsService } from './holdings.service';
@Module({
  imports: [PortfolioCoreModule, MarketDataModule],
  providers: [HoldingsService],
  exports: [HoldingsService],
})
export class HoldingsModule {}
