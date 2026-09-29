import { PrismaClient, AssetType, TransactionType } from '@prisma/client';
import * as argon2 from 'argon2';
import { STOCKS } from '../src/market-data/mock-data';
const db = new PrismaClient();
async function seed() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw new Error('Set DEMO_PASSWORD with at least 12 characters to seed the demo user');
  for (const s of STOCKS)
    await db.stock.upsert({
      where: { symbol: s[0] },
      update: {},
      create: {
        symbol: s[0],
        name: s[1],
        exchange: s[2],
        currency: s[3],
        assetType: s[4] as AssetType,
        sector: s[5],
        industry: s[6],
      },
    });
  // One atomic seed transaction; rerunning never duplicates the demo ledger or resets credentials.
  const passwordHash = await argon2.hash(password);
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(918272)::text`;
      const exists = await tx.user.findUnique({ where: { email: 'demo@vestora.app' } });
      if (exists) return;
      const user = await tx.user.create({
        data: { name: 'Tamilselvan', email: 'demo@vestora.app', passwordHash, baseCurrency: 'INR' },
      });
      const portfolio = await tx.portfolio.create({
        data: {
          userId: user.id,
          name: 'Long Term',
          description: 'Seeded manual investment ledger with synthetic prices',
          baseCurrency: 'INR',
        },
      });
      const stocks = await tx.stock.findMany({
        where: { currency: 'INR' },
        orderBy: { symbol: 'asc' },
      });
      const start = new Date(new Date().toISOString().slice(0, 10));
      start.setUTCDate(start.getUTCDate() - 540);
      const date = (days: number) => new Date(start.getTime() + days * 86400000);
      await tx.transaction.create({
        data: {
          portfolioId: portfolio.id,
          type: 'DEPOSIT',
          amount: 500000,
          transactionDate: date(0),
        },
      });
      for (let i = 0; i < 24; i++) {
        const stock = stocks[i % stocks.length];
        const base = STOCKS.find((s) => s[0] === stock.symbol)![7];
        await tx.transaction.create({
          data: {
            portfolioId: portfolio.id,
            stockId: stock.id,
            type: 'BUY',
            quantity: 5 + (i % 4),
            price: Number((base * (0.82 + i * 0.004)).toFixed(2)),
            fees: 15,
            transactionDate: date(5 + i * 18),
          },
        });
      }
      for (let i = 0; i < 3; i++)
        await tx.transaction.create({
          data: {
            portfolioId: portfolio.id,
            stockId: stocks[i].id,
            type: 'SELL',
            quantity: 2,
            price: STOCKS.find((s) => s[0] === stocks[i].symbol)![7],
            fees: 10,
            transactionDate: date(480 + i * 5),
          },
        });
      for (let i = 0; i < 2; i++)
        await tx.transaction.create({
          data: {
            portfolioId: portfolio.id,
            stockId: stocks[i].id,
            type: 'DIVIDEND',
            amount: 420 + i * 180,
            transactionDate: date(510 + i * 5),
          },
        });
      const watchlist = await tx.watchlist.create({
        data: { userId: user.id, name: 'Long Term Research' },
      });
      await tx.watchlistItem.createMany({
        data: stocks.slice(0, 5).map((s) => ({ watchlistId: watchlist.id, stockId: s.id })),
      });
      await tx.priceAlert.createMany({
        data: stocks.slice(0, 2).map((s) => ({
          userId: user.id,
          stockId: s.id,
          condition: 'ABOVE',
          targetPrice: STOCKS.find((x) => x[0] === s.symbol)![7] * 1.2,
        })),
      });
    },
    { timeout: 30000 },
  );
  console.log('Seed complete: 18 stocks and demo@vestora.app. Existing user data preserved.');
}
seed()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
