import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateAlertDto, UpdateAlertDto } from './alert.dto';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
@Injectable()
export class AlertService {
  constructor(private db: PrismaService) {}
  async create(userId: string, d: CreateAlertDto) {
    await this.db.stock.findFirstOrThrow({ where: { id: d.stockId, isActive: true } });
    return this.db.priceAlert.create({ data: { ...d, userId } });
  }
  async list(userId: string, q: PaginationDto) {
    const where = { userId };
    const [data, total] = await Promise.all([
      this.db.priceAlert.findMany({
        where,
        include: { stock: true },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.priceAlert.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async update(userId: string, id: string, d: UpdateAlertDto) {
    // A triggered alert is immutable; create a new alert to subscribe again.
    const result = await this.db.priceAlert.updateMany({
      where: { id, userId, status: { not: 'TRIGGERED' } },
      data: d,
    });
    if (!result.count) throw new NotFoundException('Active or disabled alert not found');
    return this.db.priceAlert.findUnique({ where: { id } });
  }
  async remove(userId: string, id: string) {
    const result = await this.db.priceAlert.deleteMany({ where: { id, userId } });
    if (!result.count) throw new NotFoundException('Alert not found');
    return { deleted: true };
  }
}
