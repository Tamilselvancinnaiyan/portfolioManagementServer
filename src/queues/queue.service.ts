import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  readonly alerts: Queue;
  readonly prefix: string;
  readonly imports: Queue;
  readonly connection: { host: string; port: number; password?: string };
  constructor(config: ConfigService) {
    this.prefix = config.getOrThrow<string>('QUEUE_PREFIX');
    this.connection = {
      host: config.getOrThrow('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
    };
    const options = {
      prefix: this.prefix,
      connection: { ...this.connection, maxRetriesPerRequest: 1 },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    };
    this.alerts = new Queue('price-alerts', options);
    this.imports = new Queue('transaction-imports', options);
    for (const queue of [this.alerts, this.imports])
      queue.on('error', () =>
        this.logger.warn({ event: 'queue_connection_error', queue: queue.name }),
      );
  }
  async enqueueImport(id: string) {
    const existing = await this.imports.getJob(id);
    if (existing && (await existing.getState()) === 'failed') {
      await existing.retry();
      return existing;
    }
    return this.imports.add('import', { importId: id }, { jobId: id });
  }
  async onModuleDestroy() {
    await Promise.all([this.alerts.close(), this.imports.close()]);
  }
}
