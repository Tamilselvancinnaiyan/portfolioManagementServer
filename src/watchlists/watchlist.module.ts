import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { WatchlistService } from './watchlist.service';
import { WatchlistController } from './watchlist.controller';

@Module({
  imports: [MarketDataModule],
  controllers: [WatchlistController],
  providers: [WatchlistService],
})
export class WatchlistModule {}
