import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { environmentSchema } from './environment';
import { DatabaseModule } from '../database/database.module';
import { CacheModule } from '../cache/cache.module';
import { QueueModule } from '../queues/queue.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: environmentSchema }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
        genReqId: (_req, res) => {
          const id = randomUUID();
          res.setHeader('X-Request-ID', id);
          return id;
        },
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        serializers: {
          req: (r: any) => ({ id: r.id, method: r.method, url: r.url?.split('?')[0] }),
          res: (r: any) => ({ statusCode: r.statusCode }),
        },
        customProps: (req: any) => ({ userId: req.user?.id }),
      },
    }),
    DatabaseModule,
    CacheModule,
    QueueModule,
  ],
})
export class InfrastructureModule {}
