import { Module } from '@nestjs/common';
import { PortfolioCoreModule } from '../portfolios/portfolio-core.module';
import { TransactionModule } from '../transactions/transaction.module';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';

@Module({
  imports: [PortfolioCoreModule, TransactionModule],
  controllers: [ImportController],
  providers: [ImportService],
  exports: [ImportService],
})
export class ImportModule {}
