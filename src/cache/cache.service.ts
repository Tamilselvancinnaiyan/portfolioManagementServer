import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  readonly redis: Redis;
  private logger = new Logger(CacheService.name);
  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.getOrThrow('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      enableOfflineQueue: false,
    });
    this.redis.on('error', () => this.logger.warn({ event: 'redis_unavailable' }));
  }
  async remember<T>(key: string, ttl: number, compute: () => Promise<T>): Promise<T> {
    if (ttl <= 0) return compute();
    try {
      const cached = await this.redis.get(key);
      if (cached) return JSON.parse(cached);
    } catch {
      /* read-through fallback */
    }
    const result = await compute();
    try {
      await this.redis.set(key, JSON.stringify(result), 'EX', ttl);
    } catch {
      /* cache is optional for reads */
    }
    return result;
  }
  async onModuleDestroy() {
    this.redis.disconnect();
  }
}
