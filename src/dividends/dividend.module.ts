import { Module } from '@nestjs/common';
import { PortfolioCoreModule } from '../portfolios/portfolio-core.module';
import { DividendService } from './dividend.service';
import { DividendController } from './dividend.controller';

@Module({
  imports: [PortfolioCoreModule],
  controllers: [DividendController],
  providers: [DividendService],
})
export class DividendModule {}
