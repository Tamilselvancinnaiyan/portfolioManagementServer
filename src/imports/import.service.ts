import { Injectable, NotFoundException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { fingerprint } from '../transactions/transaction-fingerprint';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma, TransactionType } from '@prisma/client';
import { PortfolioRepository } from '../portfolios/portfolio.repository';
import { TransactionService } from '../transactions/transaction.service';
import { CreateTransactionDto } from '../transactions/transaction.dto';
import { BusinessException } from '../common/exceptions/business.exception';
import { replayLedger } from '../holdings/holdings.calculator';
import { QueueService } from '../queues/queue.service';
export type ImportRow = CreateTransactionDto & { fingerprint: string };
@Injectable()
export class ImportService {
  constructor(
    private repo: PortfolioRepository,
    private transactions: TransactionService,
    private queue: QueueService,
  ) {}
  async preview(u: string, p: string, file: Buffer) {
    const portfolio = await this.repo.owned(u, p);
    let records: Record<string, string>[];
    try {
      records = parse(file, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
        max_record_size: 4096,
      });
    } catch {
      throw new BusinessException('Malformed CSV');
    }
    if (!records.length || records.length > 5000)
      throw new BusinessException('CSV must contain between 1 and 5000 rows');
    const columns = ['date', 'symbol', 'type', 'quantity', 'price', 'fees'];
    if (columns.some((c) => !(c in records[0])))
      throw new BusinessException(`Required columns: ${columns.join(',')}`);
    const [stocks, existing] = await Promise.all([
      this.repo.db.stock.findMany({ where: { isActive: true, currency: portfolio.baseCurrency } }),
      this.repo.entries(p),
    ]);
    const stockMap = new Map(stocks.map((s) => [s.symbol, s.id]));
    const seen = new Set(
      existing.map((t) =>
        fingerprint({ ...t, transactionDate: t.transactionDate.toISOString().slice(0, 10) }),
      ),
    );
    const rows: ImportRow[] = [],
      errors: { row: number; message: string }[] = [];
    let duplicates = 0;
    const candidates = records
      .map((r, index) => ({ r, line: index + 2 }))
      .sort((a, b) => a.r.date.localeCompare(b.r.date) || a.line - b.line);
    for (const { r, line } of candidates) {
      const dto = plainToInstance(CreateTransactionDto, {
        stockId: stockMap.get(r.symbol?.toUpperCase()),
        type: r.type,
        transactionDate: r.date,
        quantity: Number(r.quantity),
        price: Number(r.price),
        fees: Number(r.fees || 0),
        amount: 0,
      });
      if (
        !['BUY', 'SELL'].includes(r.type) ||
        !dto.stockId ||
        r.quantity === '' ||
        r.price === '' ||
        (await validate(dto)).length ||
        r.date < '2000-01-01' ||
        r.date > new Date().toISOString().slice(0, 10)
      ) {
        errors.push({
          row: line,
          message: 'Invalid BUY/SELL fields, date, symbol or portfolio currency',
        });
        continue;
      }
      const fp = fingerprint(dto);
      if (seen.has(fp)) {
        duplicates++;
        continue;
      }
      try {
        const all = [
          ...existing,
          ...rows.map((row) => ({
            ...row,
            stockId: row.stockId ?? null,
            transactionDate: new Date(row.transactionDate),
          })),
          { ...dto, stockId: dto.stockId!, transactionDate: new Date(dto.transactionDate) },
        ];
        all.sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());
        replayLedger(all);
        rows.push({ ...dto, fingerprint: fp });
        seen.add(fp);
      } catch (e) {
        errors.push({ row: line, message: e instanceof Error ? e.message : 'Invalid ledger' });
      }
    }
    const report = {
      totalRows: records.length,
      validRows: rows.length,
      invalidRows: errors.length,
      duplicateRows: duplicates,
      errors,
    };
    const job = await this.repo.db.importJob.create({
      data: {
        userId: u,
        portfolioId: p,
        rows: rows as unknown as Prisma.InputJsonValue,
        report,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    return { importId: job.id, ...report, expiresAt: job.expiresAt };
  }
  async confirm(u: string, p: string, id: string) {
    await this.repo.db.$transaction(async (tx) => {
      await this.repo.lock(tx, u, p);
      const job = await tx.importJob.findFirst({ where: { id, userId: u, portfolioId: p } });
      if (!job) throw new NotFoundException('Import not found');
      if (job.status === 'COMPLETED' || job.status === 'QUEUED') return;
      if (job.status !== 'PREVIEW' || job.expiresAt < new Date())
        throw new BusinessException('Preview expired or import failed; upload a new preview');
      if (!(job.rows as unknown as ImportRow[]).length)
        throw new BusinessException('No valid rows to import');
      await tx.importJob.update({ where: { id }, data: { status: 'QUEUED' } });
    });
    // QUEUED is a durable outbox state. The worker periodically dispatches it if Redis is unavailable here.
    try {
      await this.queue.enqueueImport(id);
    } catch {
      /* durable worker recovery */
    }
    return this.status(u, p, id);
  }
  async status(u: string, p: string, id: string) {
    await this.repo.owned(u, p);
    const job = await this.repo.db.importJob.findFirst({
      where: { id, userId: u, portfolioId: p },
      select: {
        id: true,
        status: true,
        report: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!job) throw new NotFoundException('Import not found');
    return job;
  }
  async process(id: string) {
    return this.repo.db.$transaction(
      async (tx) => {
        const job = await tx.importJob.findUnique({ where: { id } });
        if (!job || job.status !== 'QUEUED') return;
        await this.repo.lock(tx, job.userId, job.portfolioId);
        const current = await tx.importJob.findUniqueOrThrow({ where: { id } });
        if (current.status !== 'QUEUED') return;
        const inserted = await this.transactions.importRows(
          tx,
          job.userId,
          job.portfolioId,
          job.rows as unknown as ImportRow[],
        );
        await tx.importJob.update({
          where: { id },
          data: { status: 'COMPLETED', report: { ...(job.report as object), inserted } },
        });
        return { inserted };
      },
      { timeout: 60000, maxWait: 10000 },
    );
  }
}
