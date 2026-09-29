import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MarketDataProvider } from '../../market-data/providers/market-data.provider';
@Injectable()
export class AlertProcessor {
  private logger = new Logger(AlertProcessor.name);
  constructor(
    private db: PrismaService,
    private market: MarketDataProvider,
  ) {}
  async process() {
    let cursor: string | undefined;
    let triggered = 0;
    do {
      const alerts = await this.db.priceAlert.findMany({
        where: { status: 'ACTIVE', user: { deletedAt: null } },
        include: { stock: true },
        take: 500,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!alerts.length) break;
      const quotes = new Map(
        (await this.market.getQuotes(alerts.map((a) => a.stock.symbol))).map((q) => [q.symbol, q]),
      );
      for (const a of alerts) {
        const price = quotes.get(a.stock.symbol)!.price;
        if (
          a.condition === 'ABOVE' ? price <= Number(a.targetPrice) : price >= Number(a.targetPrice)
        )
          continue;
        const matched = await this.db.$transaction(async (tx) => {
          const updated = await tx.priceAlert.updateMany({
            where: { id: a.id, status: 'ACTIVE', updatedAt: a.updatedAt },
            data: { status: 'TRIGGERED', triggeredAt: new Date() },
          });
          if (!updated.count) return false;
          await tx.notification.create({
            data: {
              userId: a.userId,
              alertId: a.id,
              message: `${a.stock.symbol} is ${a.condition.toLowerCase()} ${a.targetPrice} ${a.stock.currency}; ${this.market.source} price ${price}`,
            },
          });
          return true;
        });
        if (matched) triggered++;
      }
      cursor = alerts.at(-1)!.id;
    } while (cursor);
    this.logger.log({ event: 'alerts_checked', triggered });
    return { triggered };
  }
}
