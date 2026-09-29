import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private db: PrismaService) {}
  @Get() async list(@CurrentUser() userId: string, @Query() q: PaginationDto) {
    const [data, total] = await Promise.all([
      this.db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.notification.count({ where: { userId } }),
    ]);
    return paginated(data, total, q);
  }
}
