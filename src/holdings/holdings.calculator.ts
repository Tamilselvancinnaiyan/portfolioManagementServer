import Decimal from 'decimal.js';
import { BusinessException } from '../common/exceptions/business.exception';
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const D = (n: Decimal.Value | { toString(): string }) => new Decimal(n.toString());
export const money = (n: Decimal.Value) => D(n).toDecimalPlaces(2).toNumber();
export const percentage = (n: Decimal.Value, denominator: Decimal.Value) =>
  D(denominator).gt(0) ? money(D(n).div(denominator).mul(100)) : null;
export interface LedgerEntry {
  stockId: string | null;
  type: string;
  quantity: { toString(): string };
  price: { toString(): string };
  fees: { toString(): string };
  amount: { toString(): string };
  transactionDate: Date;
}
export interface Position {
  stockId: string;
  quantity: Decimal;
  cost: Decimal;
  realized: Decimal;
  dividends: Decimal;
  purchases: Decimal;
}
export interface Ledger {
  positions: Map<string, Position>;
  cash: Decimal;
  externalCapital: Decimal;
  grossContributions: Decimal;
}
/** Input must be ordered by transactionDate, then immutable sequence. Buy fees enter cost; sell fees reduce proceeds. */
export function replayLedger(entries: LedgerEntry[]): Ledger {
  const state: Ledger = {
    positions: new Map(),
    cash: D(0),
    externalCapital: D(0),
    grossContributions: D(0),
  };
  for (const tx of entries) applyEntry(state, tx);
  return state;
}
export function validateEntry(tx: LedgerEntry): void {
  const q = D(tx.quantity),
    price = D(tx.price),
    fees = D(tx.fees),
    amount = D(tx.amount);
  if (![q, price, fees, amount].every((n) => n.isFinite()) || fees.lt(0))
    throw new BusinessException('Financial values must be finite and fees nonnegative');
  if (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL') {
    if (!amount.gt(0) || tx.stockId || !q.isZero() || !price.isZero())
      throw new BusinessException(
        'Cash entries require amount > 0 and no stock, quantity or price',
      );
  } else if (tx.type === 'DIVIDEND') {
    if (!tx.stockId || !amount.gt(0) || !q.isZero() || !price.isZero())
      throw new BusinessException('Dividend requires stock, amount > 0 and zero quantity/price');
  } else if (
    !['BUY', 'SELL'].includes(tx.type) ||
    !tx.stockId ||
    !q.gt(0) ||
    !price.gt(0) ||
    !amount.isZero()
  ) {
    throw new BusinessException('BUY/SELL requires stock, positive quantity/price and zero amount');
  }
}
export function applyEntry(state: Ledger, tx: LedgerEntry): void {
  validateEntry(tx);
  const q = D(tx.quantity),
    price = D(tx.price),
    fees = D(tx.fees),
    amount = D(tx.amount);
  if (fees.lt(0)) throw new BusinessException('Fees cannot be negative');
  if (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL') {
    if (!amount.gt(0) || tx.stockId || !q.isZero() || !price.isZero())
      throw new BusinessException(
        'Cash entries require amount > 0 and no stock, quantity or price',
      );
    const flow = tx.type === 'DEPOSIT' ? amount : amount.neg();
    state.cash = state.cash.plus(flow).minus(fees);
    state.externalCapital = state.externalCapital.plus(flow);
    if (flow.gt(0)) state.grossContributions = state.grossContributions.plus(flow);
    return;
  }
  if (!tx.stockId) throw new BusinessException('Stock is required');
  let p = state.positions.get(tx.stockId);
  if (!p) {
    p = {
      stockId: tx.stockId,
      quantity: D(0),
      cost: D(0),
      realized: D(0),
      dividends: D(0),
      purchases: D(0),
    };
    state.positions.set(tx.stockId, p);
  }
  if (tx.type === 'DIVIDEND') {
    if (!amount.gt(0) || !q.isZero() || !price.isZero())
      throw new BusinessException('Dividend requires amount > 0 and zero quantity/price');
    p.dividends = p.dividends.plus(amount.minus(fees));
    state.cash = state.cash.plus(amount).minus(fees);
    return;
  }
  if (!['BUY', 'SELL'].includes(tx.type) || !q.gt(0) || !price.gt(0) || !amount.isZero())
    throw new BusinessException('BUY/SELL requires positive quantity/price and zero amount');
  if (tx.type === 'BUY') {
    const cost = q.mul(price).plus(fees);
    p.quantity = p.quantity.plus(q);
    p.cost = p.cost.plus(cost);
    p.purchases = p.purchases.plus(cost);
    state.cash = state.cash.minus(cost);
  } else {
    if (q.gt(p.quantity))
      throw new BusinessException(
        `Insufficient quantity. Available quantity: ${p.quantity.toFixed()}`,
        'INSUFFICIENT_QUANTITY',
      );
    const basis = p.cost.div(p.quantity).mul(q),
      proceeds = q.mul(price).minus(fees);
    p.quantity = p.quantity.minus(q);
    p.cost = p.quantity.isZero() ? D(0) : p.cost.minus(basis);
    p.realized = p.realized.plus(proceeds.minus(basis));
    state.cash = state.cash.plus(proceeds);
  }
}
export function valuePosition(p: Position, price: number, previousClose: number) {
  const value = p.quantity.mul(price),
    unrealized = value.minus(p.cost);
  return {
    stockId: p.stockId,
    quantity: p.quantity.toNumber(),
    averagePrice: p.quantity.gt(0) ? money(p.cost.div(p.quantity)) : 0,
    currentPrice: price,
    investedAmount: money(p.cost),
    currentValue: money(value),
    unrealizedPnL: money(unrealized),
    unrealizedPnLPercentage: percentage(unrealized, p.cost),
    realizedPnL: money(p.realized),
    dividends: money(p.dividends),
    dayPnL: money(p.quantity.mul(D(price).minus(previousClose))),
  };
}
