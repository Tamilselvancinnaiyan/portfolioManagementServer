import { AnalyticsCalculator as C } from './analytics.calculator';
describe('analytics calculations', () => {
  it('calculates CAGR and refuses insufficient history', () => {
    expect(C.cagr(100, 121, 2)).toBeCloseTo(10);
    expect(C.cagr(100, 110, 0.5)).toBeNull();
    expect(C.cagr(0, 100, 1)).toBeNull();
  });
  it('calculates XIRR using dated cash flows', () => {
    expect(
      C.xirr([
        { amount: -1000, date: new Date('2025-01-01') },
        { amount: 1100, date: new Date('2026-01-01') },
      ]),
    ).toBeCloseTo(10, 6);
  });
  it('calculates negative XIRR', () => {
    expect(
      C.xirr([
        { amount: -1000, date: new Date('2025-01-01') },
        { amount: 800, date: new Date('2026-01-01') },
      ]),
    ).toBeCloseTo(-20, 6);
  });
  it('returns null for undefined or ambiguous XIRR', () => {
    expect(C.xirr([])).toBeNull();
    expect(C.xirr([{ amount: 10, date: new Date() }])).toBeNull();
    expect(
      C.xirr([
        { amount: -100, date: new Date('2024-01-01') },
        { amount: 200, date: new Date('2025-01-01') },
        { amount: -90, date: new Date('2026-01-01') },
      ]),
    ).toBeNull();
  });
  it('calculates peak to trough drawdown', () => {
    expect(C.maximumDrawdown([100, 120, 90, 110, 150])).toBeCloseTo(25);
    expect(C.maximumDrawdown([100])).toBeNull();
  });
  it('computes sample volatility, sharpe, and aligned beta', () => {
    const r = Array.from({ length: 40 }, (_, i) => (i % 2 ? 0.02 : -0.01));
    expect(C.volatility(r)).toBeGreaterThan(0);
    expect(C.sharpe(r)).toBeGreaterThan(0);
    expect(
      C.beta(
        r.map((x) => x * 2),
        r,
      ),
    ).toBeCloseTo(2);
    expect(
      C.beta(
        r,
        r.map(() => 0),
      ),
    ).toBeNull();
  });
  it('returns null for insufficient samples and zero-variance Sharpe', () => {
    expect(C.volatility([0.01])).toBeNull();
    expect(C.sharpe(Array(40).fill(0.01))).toBeNull();
  });
});
