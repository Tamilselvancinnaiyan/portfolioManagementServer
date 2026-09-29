/** Statistical calculations use floating-point arithmetic; ledger accounting uses Decimal. */
export class AnalyticsCalculator {
  static cagr(start: number, end: number, years: number): number | null {
    return start > 0 && end >= 0 && years >= 1 ? ((end / start) ** (1 / years) - 1) * 100 : null;
  }
  static xirr(flows: { amount: number; date: Date }[]): number | null {
    if (flows.length < 2 || !flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0))
      return null;
    const ordered = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
    const start = ordered[0].date.getTime();
    if (ordered.at(-1)!.date.getTime() <= start) return null;
    // Multiple sign changes can have multiple roots: don't claim a unique money-weighted return.
    const nonzero = ordered.filter((f) => f.amount !== 0);
    const changes = nonzero
      .slice(1)
      .filter((f, i) => Math.sign(f.amount) !== Math.sign(nonzero[i].amount)).length;
    if (changes > 1) return null;
    const npv = (logRate: number) =>
      ordered.reduce(
        (sum, f) =>
          sum + f.amount * Math.exp((-logRate * (f.date.getTime() - start)) / 86400000 / 365),
        0,
      );
    let lo = -20,
      hi = 20,
      left = npv(lo),
      right = npv(hi);
    if (!Number.isFinite(left) || !Number.isFinite(right) || left * right > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2,
        value = npv(mid);
      if (Math.abs(value) < 1e-8) return Math.expm1(mid) * 100;
      if (Math.sign(value) === Math.sign(left)) {
        lo = mid;
        left = value;
      } else hi = mid;
    }
    const result = Math.expm1((lo + hi) / 2) * 100;
    return Number.isFinite(result) ? result : null;
  }
  static mean(xs: number[]) {
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }
  static variance(xs: number[]) {
    const mean = this.mean(xs);
    return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  }
  static volatility(returns: number[], annualPeriods = 365) {
    return returns.length >= 30 ? Math.sqrt(this.variance(returns) * annualPeriods) * 100 : null;
  }
  static sharpe(returns: number[], annualRiskFree = 0, annualPeriods = 365) {
    if (returns.length < 30) return null;
    const sd = Math.sqrt(this.variance(returns));
    return sd > 1e-12
      ? ((this.mean(returns) - annualRiskFree / annualPeriods) / sd) * Math.sqrt(annualPeriods)
      : null;
  }
  static maximumDrawdown(values: number[]): number | null {
    if (values.length < 2 || values.some((v) => v <= 0)) return null;
    let peak = values[0],
      max = 0;
    for (const value of values) {
      peak = Math.max(peak, value);
      max = Math.max(max, 1 - value / peak);
    }
    return max * 100;
  }
  static beta(portfolio: number[], benchmark: number[]) {
    if (portfolio.length < 30 || portfolio.length !== benchmark.length) return null;
    const pv = this.mean(portfolio),
      bv = this.mean(benchmark),
      variance = this.variance(benchmark);
    if (variance < 1e-16) return null;
    return (
      portfolio.reduce((a, p, i) => a + (p - pv) * (benchmark[i] - bv), 0) /
      (portfolio.length - 1) /
      variance
    );
  }
}
