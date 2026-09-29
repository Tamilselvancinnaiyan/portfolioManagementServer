import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Worker } from 'bullmq';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { MarketDataModule } from '../src/market-data/market-data.module';
import { AlertProcessor } from '../src/queues/processors/alert.processor';
import { QueueService } from '../src/queues/queue.service';
import { ImportService } from '../src/imports/import.service';
import { randomUUID } from 'crypto';

describe('Vestora HTTP + PostgreSQL + Redis + BullMQ', () => {
  let app: INestApplication,
    db: PrismaService,
    token: string,
    otherToken: string,
    portfolioId: string,
    stockId: string,
    usdStockId: string;
  const users: string[] = [];
  const email = `test-${randomUUID()}@vestora.app`;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const date = new Date().toISOString().slice(0, 10);
  const postTrade = (body: object) =>
    request(app.getHttpServer())
      .post(`/portfolios/${portfolioId}/transactions`)
      .set(auth())
      .send({ stockId, type: 'BUY', quantity: 10, price: 100, transactionDate: date, ...body });
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Integration tests require a dedicated database ending in _test');
    process.env.MARKET_DATA_PROVIDER = 'mock';
    process.env.QUEUE_PREFIX = `vestora-test-${randomUUID()}`;
    // ConfigModule validates environment at import time; set the isolated queue namespace first.
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({
      imports: [AppModule, MarketDataModule],
      providers: [AlertProcessor],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    stockId = (
      await db.stock.upsert({
        where: { symbol: 'RELIANCE' },
        update: {},
        create: {
          symbol: 'RELIANCE',
          name: 'Reliance Industries',
          exchange: 'NSE',
          currency: 'INR',
          assetType: 'INDIAN_EQUITY',
          sector: 'Energy',
          industry: 'Diversified',
        },
      })
    ).id;
    usdStockId = (
      await db.stock.upsert({
        where: { symbol: 'AAPL' },
        update: {},
        create: {
          symbol: 'AAPL',
          name: 'Apple',
          exchange: 'NASDAQ',
          currency: 'USD',
          assetType: 'US_EQUITY',
          sector: 'Technology',
          industry: 'Electronics',
        },
      })
    ).id;
    for (const address of [email, `other-${email}`]) {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Integration User',
          email: address,
          password: 'SecureTestPassword123!',
          baseCurrency: 'INR',
        })
        .expect(201);
      users.push(res.body.data.user.id);
      if (!token) token = res.body.data.accessToken;
      else otherToken = res.body.data.accessToken;
    }
    const p = await request(app.getHttpServer())
      .post('/portfolios')
      .set(auth())
      .send({ name: 'Integration', baseCurrency: 'INR' })
      .expect(201);
    portfolioId = p.body.data.id;
  });
  afterAll(async () => {
    if (db)
      for (const userId of users) {
        await db.notification.deleteMany({ where: { userId } });
        await db.priceAlert.deleteMany({ where: { userId } });
        await db.auditLog.deleteMany({ where: { userId } });
        await db.importJob.deleteMany({ where: { userId } });
        await db.transaction.deleteMany({ where: { portfolio: { userId } } });
        await db.portfolio.deleteMany({ where: { userId } });
        await db.watchlist.deleteMany({ where: { userId } });
        await db.user.delete({ where: { id: userId } });
      }
    if (app) {
      await app.get(QueueService).alerts.obliterate({ force: true });
      await app.get(QueueService).imports.obliterate({ force: true });
    }
    await app?.close();
  });
  it('serves health and OpenAPI and rejects unauthenticated/unknown fields', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    const docs = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(docs.body.paths['/portfolios/{id}/analytics']).toBeDefined();
    await request(app.getHttpServer()).get('/portfolios').expect(401);
    await request(app.getHttpServer())
      .post('/portfolios')
      .set(auth())
      .send({ name: 'Spoof', userId: users[1] })
      .expect(400);
    await request(app.getHttpServer()).get('/stocks?limit=10000').set(auth()).expect(400);
  });
  it('rotates refresh tokens once, denies reuse, and revokes on logout', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'SecureTestPassword123!' })
      .expect(201);
    const refreshToken = login.body.data.refreshToken;
    const responses = await Promise.all(
      [1, 2].map(() => request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken })),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 401]);
    const next = responses.find((r) => r.status === 201)!.body.data.refreshToken;
    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: next })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: next })
      .expect(401);
    const me = await request(app.getHttpServer()).get('/auth/me').set(auth()).expect(200);
    expect(me.body.data.passwordHash).toBeUndefined();
  });
  it('isolates all portfolio views and mutations by authenticated owner', async () => {
    for (const suffix of [
      '',
      '/holdings',
      '/summary',
      '/dashboard',
      '/performance',
      '/analytics',
      '/dividends',
      '/transactions',
    ])
      await request(app.getHttpServer())
        .get(`/portfolios/${portfolioId}${suffix}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    await request(app.getHttpServer())
      .post(`/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ stockId, type: 'BUY', quantity: 1, price: 1, transactionDate: date })
      .expect(404);
  });
  it('rejects wrong-currency and invalid/future transactions', async () => {
    await postTrade({ stockId: usdStockId }).expect(400);
    await postTrade({ quantity: 0 }).expect(400);
    await postTrade({ fees: -1 }).expect(400);
    await postTrade({ transactionDate: '2099-01-01' }).expect(400);
    await postTrade({ quantity: null }).expect(400);
  });
  it('allows only one of two concurrent SELL 8 requests against 10 shares', async () => {
    await postTrade({}).expect(201);
    const results = await Promise.all([
      postTrade({ type: 'SELL', quantity: 8, price: 120 }),
      postTrade({ type: 'SELL', quantity: 8, price: 120 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(results.find((r) => r.status === 400)!.body.errorCode).toBe('INSUFFICIENT_QUANTITY');
    const holdings = await request(app.getHttpServer())
      .get(`/portfolios/${portfolioId}/holdings`)
      .set(auth())
      .expect(200);
    expect(holdings.body.data[0]).toMatchObject({ quantity: 2, realizedPnL: 160 });
    expect(await db.transaction.count({ where: { portfolioId, deletedAt: null } })).toBe(2);
  });
  it('revalidates backdated creates, edits, and deletes with rollback', async () => {
    const buy = await db.transaction.findFirstOrThrow({ where: { portfolioId, type: 'BUY' } });
    await request(app.getHttpServer()).delete(`/transactions/${buy.id}`).set(auth()).expect(400);
    await request(app.getHttpServer())
      .patch(`/transactions/${buy.id}`)
      .set(auth())
      .send({ quantity: 1 })
      .expect(400);
    await postTrade({ type: 'SELL', quantity: 1, transactionDate: '2001-01-01' }).expect(400);
    expect(
      (await db.transaction.findUniqueOrThrow({ where: { id: buy.id } })).quantity.toNumber(),
    ).toBe(10);
  });
  it('updates cached summaries after a ledger mutation', async () => {
    const first = await request(app.getHttpServer())
      .get(`/portfolios/${portfolioId}/summary`)
      .set(auth())
      .expect(200);
    await postTrade({ quantity: 1 }).expect(201);
    const second = await request(app.getHttpServer())
      .get(`/portfolios/${portfolioId}/summary`)
      .set(auth())
      .expect(200);
    expect(second.body.data.investedAmount - first.body.data.investedAmount).toBe(100);
    const allocation = await request(app.getHttpServer())
      .get(`/portfolios/${portfolioId}/allocation`)
      .set(auth())
      .expect(200);
    expect(allocation.body.data.assetAllocation[0].percentage).toBe(100);
  });
  it('preserves omitted PATCH fields and portfolio currency', async () => {
    const buy = await db.transaction.findFirstOrThrow({ where: { portfolioId, type: 'BUY' } });
    const patch = await request(app.getHttpServer())
      .patch(`/transactions/${buy.id}`)
      .set(auth())
      .send({ notes: 'Updated note' })
      .expect(200);
    expect(Number(patch.body.data.quantity)).toBe(10);
    const p = await request(app.getHttpServer())
      .post('/portfolios')
      .set(auth())
      .send({ name: 'USD', baseCurrency: 'USD' })
      .expect(201);
    const updated = await request(app.getHttpServer())
      .patch(`/portfolios/${p.body.data.id}`)
      .set(auth())
      .send({ name: 'US Stocks' })
      .expect(200);
    expect(updated.body.data.baseCurrency).toBe('USD');
  });
  it('previews duplicates and invalid rows then imports through BullMQ exactly once', async () => {
    const csv = `date,symbol,type,quantity,price,fees\n${date},RELIANCE,BUY,4,101,0\n${date},RELIANCE,BUY,4,101,0\n${date},MISSING,BUY,1,1,0\n`;
    const preview = await request(app.getHttpServer())
      .post(`/portfolios/${portfolioId}/import/preview`)
      .set(auth())
      .attach('file', Buffer.from(csv), 'trades.csv')
      .expect(201);
    expect(preview.body.data).toMatchObject({
      totalRows: 3,
      validRows: 1,
      invalidRows: 1,
      duplicateRows: 1,
    });
    const id = preview.body.data.importId;
    const queue = app.get(QueueService);
    const imports = app.get(ImportService);
    const worker = new Worker('transaction-imports', (job) => imports.process(job.data.importId), {
      connection: { ...queue.connection, maxRetriesPerRequest: null },
      prefix: queue.prefix,
    });
    try {
      const completed = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Import worker timeout')), 15000);
        worker.on('completed', (job) => {
          if (job.id === id) {
            clearTimeout(timeout);
            resolve();
          }
        });
        worker.on('failed', (_, e) => {
          clearTimeout(timeout);
          reject(e);
        });
      });
      await request(app.getHttpServer())
        .post(`/portfolios/${portfolioId}/import/confirm`)
        .set(auth())
        .send({ importId: id })
        .expect(202);
      await completed;
      await imports.process(id);
      expect(
        await db.transaction.count({ where: { portfolioId, importFingerprint: { not: null } } }),
      ).toBe(1);
      const status = await request(app.getHttpServer())
        .get(`/portfolios/${portfolioId}/import/${id}`)
        .set(auth())
        .expect(200);
      expect(status.body.data.status).toBe('COMPLETED');
    } finally {
      await worker.close();
    }
  });
  it('creates a single alert notification across concurrent worker executions', async () => {
    const alert = await request(app.getHttpServer())
      .post('/alerts')
      .set(auth())
      .send({ stockId, condition: 'ABOVE', targetPrice: 1 })
      .expect(201);
    const processor = app.get(AlertProcessor);
    await Promise.all([processor.process(), processor.process()]);
    expect(await db.notification.count({ where: { alertId: alert.body.data.id } })).toBe(1);
    expect(
      (await db.priceAlert.findUniqueOrThrow({ where: { id: alert.body.data.id } })).status,
    ).toBe('TRIGGERED');
    await request(app.getHttpServer())
      .delete(`/alerts/${alert.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });
  it('soft-deleted portfolios are hidden even when cached', async () => {
    await request(app.getHttpServer())
      .get(`/portfolios/${portfolioId}/dashboard`)
      .set(auth())
      .expect(200);
    await request(app.getHttpServer()).delete(`/portfolios/${portfolioId}`).set(auth()).expect(200);
    await request(app.getHttpServer())
      .get(`/portfolios/${portfolioId}/summary`)
      .set(auth())
      .expect(404);
  });
});
