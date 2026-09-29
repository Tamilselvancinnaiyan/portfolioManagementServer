import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MarketDataProvider } from '../market-data/providers/market-data.provider';
@Injectable()
export class WatchlistService {
  constructor(
    private db: PrismaService,
    private market: MarketDataProvider,
  ) {}
  async owned(u: string, id: string) {
    const w = await this.db.watchlist.findFirst({ where: { id, userId: u, deletedAt: null } });
    if (!w) throw new NotFoundException('Watchlist not found');
    return w;
  }
  create(userId: string, name: string) {
    return this.db.watchlist.create({ data: { userId, name } });
  }
  list(userId: string) {
    return this.db.watchlist.findMany({
      where: { userId, deletedAt: null },
      include: { _count: { select: { items: true } } },
    });
  }
  async update(u: string, id: string, name: string) {
    await this.owned(u, id);
    return this.db.watchlist.update({ where: { id, userId: u, deletedAt: null }, data: { name } });
  }
  async remove(u: string, id: string) {
    await this.owned(u, id);
    return this.db.watchlist.update({
      where: { id, userId: u, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
  async add(u: string, id: string, stockId: string) {
    await this.owned(u, id);
    await this.db.stock.findFirstOrThrow({ where: { id: stockId, isActive: true } });
    return this.db.watchlistItem.upsert({
      where: { watchlistId_stockId: { watchlistId: id, stockId } },
      create: { watchlistId: id, stockId },
      update: {},
    });
  }
  async removeStock(u: string, id: string, stockId: string) {
    await this.owned(u, id);
    return this.db.watchlistItem.deleteMany({ where: { watchlistId: id, stockId } });
  }
  async stocks(u: string, id: string) {
    await this.owned(u, id);
    const items = await this.db.watchlistItem.findMany({
      where: { watchlistId: id },
      include: { stock: true },
    });
    const quotes = new Map(
      (await this.market.getQuotes(items.map((i) => i.stock.symbol))).map((q) => [q.symbol, q]),
    );
    return items.map((i) => ({ ...i.stock, quote: quotes.get(i.stock.symbol) }));
  }
}
