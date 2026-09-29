import { Injectable } from '@nestjs/common';
import { PortfolioRepository } from '../portfolios/portfolio.repository';
import { D, money } from '../holdings/holdings.calculator';
import { serializeTransaction } from '../transactions/transaction.service';

@Injectable()
export class DividendService {
  constructor(private repo: PortfolioRepository) {}
  async get(u: string, id: string) {
    await this.repo.owned(u, id);
    const rows = await this.repo.db.transaction.findMany({
      where: { portfolioId: id, type: 'DIVIDEND', deletedAt: null },
      include: { stock: true },
      orderBy: { transactionDate: 'desc' },
    });
    const year = new Date().getUTCFullYear();
    const current = rows.filter((r) => r.transactionDate.getUTCFullYear() === year);
    const sum = (items: typeof rows) =>
      money(items.reduce((a, r) => a.plus(D(r.amount).minus(D(r.fees))), D(0)));
    return {
      totalDividend: sum(rows),
      currentYearDividend: sum(current),
      monthly: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        amount: sum(current.filter((r) => r.transactionDate.getUTCMonth() === i)),
      })),
      dividendHistory: rows.map(serializeTransaction),
    };
  }
}
