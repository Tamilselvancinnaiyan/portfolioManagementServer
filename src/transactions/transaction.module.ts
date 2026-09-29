import { Module } from '@nestjs/common';
import { PortfolioCoreModule } from '../portfolios/portfolio-core.module';
import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';

@Module({
  imports: [PortfolioCoreModule],
  controllers: [TransactionController],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}
