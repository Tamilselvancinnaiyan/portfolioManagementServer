import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { QueueService } from '../queue.service';
import { AlertProcessor } from './alert.processor';
import { ImportService } from '../../imports/import.service';
import { PrismaService } from '../../database/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';
@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private workers: Worker[] = [];
  private timer?: NodeJS.Timeout;
  private recovering = false;
  private logger = new Logger(WorkerService.name);
  constructor(
    private queue: QueueService,
    private alerts: AlertProcessor,
    private imports: ImportService,
    private db: PrismaService,
  ) {}
  async onModuleInit() {
    const connection = { ...this.queue.connection, maxRetriesPerRequest: null };
    this.workers = [
      new Worker('price-alerts', () => this.alerts.process(), {
        connection,
        concurrency: 1,
        prefix: this.queue.prefix,
      }),
      new Worker(
        'transaction-imports',
        async (job) => {
          try {
            return await this.imports.process(job.data.importId);
          } catch (e) {
            if (e instanceof BusinessException || job.attemptsMade + 1 >= (job.opts.attempts ?? 1))
              await this.db.importJob.updateMany({
                where: { id: job.data.importId, status: 'QUEUED' },
                data: {
                  status: 'FAILED',
                  error:
                    e instanceof BusinessException
                      ? e.message
                      : 'Import failed; create a new preview and retry',
                },
              });
            throw e;
          }
        },
        { connection, concurrency: 2, prefix: this.queue.prefix },
      ),
    ];
    for (const worker of this.workers) {
      worker.on('completed', (job) =>
        this.logger.log({ event: 'job_completed', queue: worker.name, jobId: job.id }),
      );
      worker.on('failed', (job) =>
        this.logger.warn({ event: 'job_failed', queue: worker.name, jobId: job?.id }),
      );
      worker.on('error', () =>
        this.logger.error({ event: 'worker_connection_error', queue: worker.name }),
      );
    }
    await this.queue.alerts.upsertJobScheduler(
      'check-alerts',
      { every: 60000 },
      { name: 'check', data: {} },
    );
    await this.recover();
    this.timer = setInterval(() => void this.recover(), 30000);
  }
  private async recover() {
    if (this.recovering) return;
    this.recovering = true;
    try {
      const jobs = await this.db.importJob.findMany({
        where: { status: 'QUEUED' },
        select: { id: true },
        take: 100,
        orderBy: { createdAt: 'asc' },
      });
      for (const job of jobs) await this.queue.enqueueImport(job.id);
    } catch {
      this.logger.warn({ event: 'import_dispatch_retry' });
    } finally {
      this.recovering = false;
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await Promise.all(this.workers.map((w) => w.close()));
  }
}
