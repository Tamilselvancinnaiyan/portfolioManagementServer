import { Module } from '@nestjs/common';
import { PortfolioRepository } from './portfolio.repository';
@Module({ providers: [PortfolioRepository], exports: [PortfolioRepository] })
export class PortfolioCoreModule {}
