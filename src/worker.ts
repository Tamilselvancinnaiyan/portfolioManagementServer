import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { InfrastructureModule } from './config/infrastructure.module';
import { ImportModule } from './imports/import.module';
import { MarketDataModule } from './market-data/market-data.module';
import { WorkerService } from './queues/processors/worker.service';
import { AlertProcessor } from './queues/processors/alert.processor';
@Module({
  imports: [InfrastructureModule, ImportModule, MarketDataModule],
  providers: [WorkerService, AlertProcessor],
})
class WorkerModule {}
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}
void bootstrap();
