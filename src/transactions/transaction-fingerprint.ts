import { createHash } from 'crypto';
export function fingerprint(r: {
  transactionDate: string;
  stockId?: string | null;
  type: string;
  quantity: unknown;
  price: unknown;
  fees: unknown;
  amount?: unknown;
}) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        r.transactionDate,
        r.stockId ?? null,
        r.type,
        Number(r.quantity),
        Number(r.price),
        Number(r.fees),
        Number(r.amount ?? 0),
      ]),
    )
    .digest('hex');
}
