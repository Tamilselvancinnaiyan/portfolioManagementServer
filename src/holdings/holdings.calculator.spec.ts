import { LedgerEntry, replayLedger, valuePosition, D, percentage } from './holdings.calculator';
const trade = (type: string, quantity: number, price: number, fees = 0): LedgerEntry => ({
  type,
  quantity,
  price,
  fees,
  stockId: 'stock',
  amount: 0,
  transactionDate: new Date('2026-01-01'),
});
describe('weighted average ledger', () => {
  it('averages buys and realizes profit without changing remaining average', () => {
    const p = replayLedger([
      trade('BUY', 10, 100),
      trade('BUY', 10, 120),
      trade('SELL', 5, 140),
    ]).positions.get('stock')!;
    expect(p.quantity.toNumber()).toBe(15);
    expect(p.cost.div(p.quantity).toNumber()).toBe(110);
    expect(p.realized.toNumber()).toBe(150);
    expect(valuePosition(p, 120, 115)).toMatchObject({
      investedAmount: 1650,
      currentValue: 1800,
      unrealizedPnL: 150,
      dayPnL: 75,
    });
  });
  it('capitalizes buy fees and deducts sell fees', () => {
    const p = replayLedger([trade('BUY', 10, 100, 10), trade('SELL', 5, 120, 5)]).positions.get(
      'stock',
    )!;
    expect(p.cost.toNumber()).toBe(505);
    expect(p.realized.toNumber()).toBe(90);
  });
  it('retains realized profit after closing and starts a new cost basis on rebuy', () => {
    const p = replayLedger([
      trade('BUY', 10, 100),
      trade('SELL', 10, 110),
      trade('BUY', 2, 80),
    ]).positions.get('stock')!;
    expect(p.cost.toNumber()).toBe(160);
    expect(p.realized.toNumber()).toBe(100);
  });
  it('rejects a sell exceeding quantity at that point in time', () => {
    expect(() => replayLedger([trade('BUY', 10, 100), trade('SELL', 11, 100)])).toThrow(
      'Available quantity: 10',
    );
    expect(() => replayLedger([trade('SELL', 1, 100), trade('BUY', 10, 100)])).toThrow(
      'Insufficient',
    );
  });
  it('handles fractional shares without floating point drift', () => {
    const p = replayLedger([
      trade('BUY', 0.1, 10),
      trade('BUY', 0.2, 10),
      trade('SELL', 0.3, 11),
    ]).positions.get('stock')!;
    expect(p.quantity.isZero()).toBe(true);
    expect(p.cost.isZero()).toBe(true);
    expect(p.realized.toString()).toBe('0.3');
  });
  it('tracks deposits, withdrawals and net dividends separately from security cost', () => {
    const state = replayLedger([
      { ...trade('DEPOSIT', 0, 0), stockId: null, amount: 2000 },
      trade('BUY', 10, 100),
      { ...trade('DIVIDEND', 0, 0, 2), amount: 50 },
      { ...trade('WITHDRAWAL', 0, 0), stockId: null, amount: 100 },
    ]);
    expect(state.cash.toNumber()).toBe(948);
    expect(state.externalCapital.toNumber()).toBe(1900);
    expect(state.positions.get('stock')!.dividends.toNumber()).toBe(48);
  });
  it.each([
    trade('BUY', 0, 1),
    trade('BUY', 1, 0),
    trade('BUY', 1, 1, -1),
    { ...trade('DIVIDEND', 0, 0), amount: 0 },
  ])('rejects invalid economics', (t) => expect(() => replayLedger([t])).toThrow());
  it('returns null for undefined return denominators and computes allocation', () => {
    expect(percentage(1, 0)).toBeNull();
    expect(percentage(250, 1000)).toBe(25);
  });
});
