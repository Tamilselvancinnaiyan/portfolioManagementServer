import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
@Injectable()
export class PortfolioRepository {
  constructor(readonly db: PrismaService) {}
  async owned(userId: string, id: string, tx: Prisma.TransactionClient = this.db) {
    const portfolio = await tx.portfolio.findFirst({ where: { id, userId, deletedAt: null } });
    if (!portfolio) throw new NotFoundException('Portfolio not found');
    return portfolio;
  }
  async lock(tx: Prisma.TransactionClient, userId: string, id: string) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Portfolio" WHERE id = ${id}::uuid AND "userId" = ${userId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Portfolio not found');
    return this.owned(userId, id, tx);
  }
  entries(portfolioId: string, tx: Prisma.TransactionClient = this.db) {
    return tx.transaction.findMany({
      where: { portfolioId, deletedAt: null },
      include: { stock: true },
      orderBy: [{ transactionDate: 'asc' }, { sequence: 'asc' }],
    });
  }
}
