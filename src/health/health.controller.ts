import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/auth.decorators';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private db: PrismaService,
    private cache: CacheService,
  ) {}
  @Public() @Get() async get() {
    const [database, redis] = await Promise.allSettled([
      this.db.$queryRaw`SELECT 1`,
      this.cache.redis.ping(),
    ]);
    if (database.status === 'rejected' || redis.status === 'rejected')
      throw new ServiceUnavailableException('A required dependency is unavailable');
    return { status: 'ok', database: 'connected', redis: 'connected' };
  }
}
