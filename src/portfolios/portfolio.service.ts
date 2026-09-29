import { Injectable } from '@nestjs/common';
import { PortfolioRepository } from './portfolio.repository';
import { CreatePortfolioDto, UpdatePortfolioDto } from './portfolio.dto';
import { BusinessException } from '../common/exceptions/business.exception';
@Injectable()
export class PortfolioService {
  constructor(private repo: PortfolioRepository) {}
  create(userId: string, dto: CreatePortfolioDto) {
    return this.repo.db.portfolio.create({ data: { ...dto, userId } });
  }
  list(userId: string) {
    return this.repo.db.portfolio.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }
  get(userId: string, id: string) {
    return this.repo.owned(userId, id);
  }
  update(userId: string, id: string, dto: UpdatePortfolioDto) {
    return this.repo.db.$transaction(async (tx) => {
      const p = await this.repo.lock(tx, userId, id);
      if (
        dto.baseCurrency &&
        p.baseCurrency !== dto.baseCurrency &&
        (await tx.transaction.count({ where: { portfolioId: id, deletedAt: null } }))
      )
        throw new BusinessException('Cannot change currency of a portfolio with transactions');
      return tx.portfolio.update({ where: { id }, data: { ...dto, revision: { increment: 1 } } });
    });
  }
  remove(userId: string, id: string) {
    return this.repo.db.$transaction(async (tx) => {
      await this.repo.lock(tx, userId, id);
      return tx.portfolio.update({
        where: { id },
        data: { deletedAt: new Date(), revision: { increment: 1 } },
      });
    });
  }
}
