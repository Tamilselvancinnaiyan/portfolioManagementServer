import { fingerprint } from './transaction-fingerprint';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PortfolioRepository } from '../portfolios/portfolio.repository';
import { replayLedger, validateEntry } from '../holdings/holdings.calculator';
import { BusinessException } from '../common/exceptions/business.exception';
import { paginated } from '../common/dto/pagination.dto';
import { CreateTransactionDto, TransactionQuery, UpdateTransactionDto } from './transaction.dto';
export const serializeTransaction = <T extends { sequence: bigint }>(t: T) => ({
  ...t,
  sequence: t.sequence.toString(),
});
@Injectable()
export class TransactionService {
  constructor(private repo: PortfolioRepository) {}
  private async validateStock(
    tx: Prisma.TransactionClient,
    stockId: string | null | undefined,
    currency: string,
  ) {
    if (!stockId) return;
    const stock = await tx.stock.findFirst({ where: { id: stockId, isActive: true } });
    if (!stock) throw new BusinessException('Stock is not active or does not exist');
    if (stock.currency !== currency)
      throw new BusinessException(
        'Stock currency must match portfolio currency. FX is not supported.',
        'CURRENCY_MISMATCH',
      );
  }
  private date(value: string) {
    const date = new Date(value);
    if (
      !Number.isFinite(date.getTime()) ||
      value < '2000-01-01' ||
      value > new Date().toISOString().slice(0, 10)
    )
      throw new BusinessException('Transaction date must be between 2000-01-01 and today');
    return date;
  }
  async create(userId: string, portfolioId: string, dto: CreateTransactionDto) {
    return this.repo.db.$transaction(async (tx) => {
      const p = await this.repo.lock(tx, userId, portfolioId);
      await this.validateStock(tx, dto.stockId, p.baseCurrency);
      validateEntry({
        ...dto,
        stockId: dto.stockId ?? null,
        transactionDate: this.date(dto.transactionDate),
      });
      const created = await tx.transaction.create({
        data: { ...dto, portfolioId, transactionDate: this.date(dto.transactionDate) },
      });
      replayLedger(await this.repo.entries(portfolioId, tx));
      await this.changed(tx, userId, portfolioId, created.id, 'TRANSACTION_CREATED');
      return serializeTransaction(created);
    });
  }
  async get(userId: string, id: string) {
    const t = await this.repo.db.transaction.findFirst({
      where: { id, deletedAt: null, portfolio: { userId, deletedAt: null } },
      include: { stock: true },
    });
    if (!t) throw new NotFoundException('Transaction not found');
    return serializeTransaction(t);
  }
  async list(userId: string, portfolioId: string, q: TransactionQuery) {
    await this.repo.owned(userId, portfolioId);
    if (q.startDate && q.endDate && q.startDate > q.endDate)
      throw new BusinessException('startDate must precede endDate');
    const where: Prisma.TransactionWhereInput = {
      portfolioId,
      deletedAt: null,
      type: q.type,
      stock: q.stock ? { symbol: q.stock.toUpperCase() } : undefined,
      transactionDate: {
        gte: q.startDate ? new Date(q.startDate) : undefined,
        lte: q.endDate ? new Date(q.endDate) : undefined,
      },
    };
    const [data, total] = await Promise.all([
      this.repo.db.transaction.findMany({
        where,
        include: { stock: true },
        orderBy: [{ transactionDate: q.sort }, { sequence: q.sort }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.repo.db.transaction.count({ where }),
    ]);
    return paginated(data.map(serializeTransaction), total, q);
  }
  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    return this.mutate(userId, id, dto);
  }
  async remove(userId: string, id: string) {
    return this.mutate(userId, id);
  }
  private async mutate(userId: string, id: string, dto?: UpdateTransactionDto) {
    const existing = await this.get(userId, id);
    return this.repo.db.$transaction(async (tx) => {
      const p = await this.repo.lock(tx, userId, existing.portfolioId);
      const current = await tx.transaction.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundException('Transaction not found');
      if (dto) {
        await this.validateStock(tx, dto.stockId ?? current.stockId, p.baseCurrency);
        validateEntry({
          ...current,
          ...Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)),
          transactionDate: dto.transactionDate
            ? this.date(dto.transactionDate)
            : current.transactionDate,
        });
      }
      const updated = await tx.transaction.update({
        where: { id },
        data: dto
          ? {
              ...dto,
              importFingerprint: null,
              transactionDate: dto.transactionDate ? this.date(dto.transactionDate) : undefined,
            }
          : { deletedAt: new Date() },
      });
      replayLedger(await this.repo.entries(p.id, tx));
      await this.changed(tx, userId, p.id, id, dto ? 'TRANSACTION_UPDATED' : 'TRANSACTION_DELETED');
      return serializeTransaction(updated);
    });
  }
  async changed(
    tx: Prisma.TransactionClient,
    userId: string,
    portfolioId: string,
    entityId: string,
    action: string,
  ) {
    // Versioned cache keys cannot be repopulated with stale data after a concurrent mutation.
    await tx.portfolio.update({ where: { id: portfolioId }, data: { revision: { increment: 1 } } });
    await tx.auditLog.create({ data: { userId, entityId, action } });
  }
  async importRows(
    tx: Prisma.TransactionClient,
    userId: string,
    portfolioId: string,
    rows: (CreateTransactionDto & { fingerprint: string })[],
  ) {
    const p = await this.repo.lock(tx, userId, portfolioId);
    const ids = [...new Set(rows.map((r) => r.stockId).filter((s): s is string => !!s))];
    const stocks = await tx.stock.findMany({
      where: { id: { in: ids }, isActive: true, currency: p.baseCurrency },
    });
    if (stocks.length !== ids.length)
      throw new BusinessException('Import contains unavailable or incompatible stocks');
    const existing = await tx.transaction.findMany({
      where: { portfolioId, deletedAt: null },
    });
    const seen = new Set(
      existing.map((t) =>
        fingerprint({ ...t, transactionDate: t.transactionDate.toISOString().slice(0, 10) }),
      ),
    );
    const fresh = rows.filter((r) => {
      if (seen.has(r.fingerprint)) return false;
      seen.add(r.fingerprint);
      return true;
    });
    await tx.transaction.createMany({
      data: fresh.map(({ fingerprint, ...r }) => ({
        ...r,
        portfolioId,
        transactionDate: this.date(r.transactionDate),
        importFingerprint: fingerprint,
      })),
    });
    replayLedger(await this.repo.entries(portfolioId, tx));
    await this.changed(tx, userId, portfolioId, portfolioId, 'TRANSACTIONS_IMPORTED');
    return fresh.length;
  }
}
