import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { paginated } from '../common/dto/pagination.dto';
import { StockQuery } from './stocks.dto';

@Injectable()
export class StocksService {
  constructor(private db: PrismaService) {}
  async list(q: StockQuery) {
    const where = {
      isActive: true,
      ...(q.q
        ? {
            OR: [
              { symbol: { contains: q.q, mode: 'insensitive' as const } },
              { name: { contains: q.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.db.stock.findMany({
        where,
        orderBy: { symbol: 'asc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.stock.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async get(symbol: string) {
    const stock = await this.db.stock.findUnique({
      where: { symbol: symbol.toUpperCase(), isActive: true },
    });
    if (!stock) throw new NotFoundException('Stock not found');
    return stock;
  }
}
