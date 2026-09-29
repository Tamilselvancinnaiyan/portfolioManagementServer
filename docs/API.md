# API contract

Swagger UI: `/api/docs`. OpenAPI JSON: `/api/docs-json`.

All routes below are relative to the API origin (`http://localhost:3001`). Except `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/health`, and the documentation, routes require `Authorization: Bearer <accessToken>`.

## Responses and validation

Success envelope:

```json
{"success":true,"data":{},"message":"Request completed successfully"}
```

Errors use an appropriate HTTP status and no internal exception details:

```json
{"success":false,"message":"Insufficient quantity. Available quantity: 10","errorCode":"INSUFFICIENT_QUANTITY"}
```

A validation error may contain an array of messages. Ownership failures return 404 to avoid disclosing another user's resources. Requests receive an `X-Request-ID` header. Unexpected fields are rejected, including client-supplied `userId`. Database Decimal fields serialize as decimal strings; calculated display values are numeric and rounded to two decimal places. Quantities support eight decimal places. UTC dates use `YYYY-MM-DD`; future dates and dates before 2000 are rejected.

Paginated resources accept `page=1&limit=20`, maximum limit 100. Their envelope's `data` contains `{data: [...], pagination: {page, limit, total, totalPages}}`.

## Authentication

| Method | Route | Body / behavior |
|---|---|---|
| POST | `/auth/register` | `name`, `email`, `password` (12–128 characters), `baseCurrency` (`INR` or `USD`) |
| POST | `/auth/login` | `email`, `password`; returns access/refresh pair |
| POST | `/auth/refresh` | `refreshToken`; atomically consumes token and rotates pair |
| POST | `/auth/logout` | `refreshToken`; idempotently revokes it |
| GET | `/auth/me` | Current user's public profile |

Access tokens expire after 15 minutes. Refresh tokens expire after seven days and are single-use. Logout revokes the submitted refresh session; existing access tokens expire normally. Store tokens securely in the client; the server never logs them. This API uses bearer tokens, not authentication cookies.

## Portfolio and transaction APIs

| Method | Route | Purpose |
|---|---|---|
| POST / GET | `/portfolios` | Create / list owned portfolios |
| GET / PATCH / DELETE | `/portfolios/:id` | Read / update / soft delete |
| POST / GET | `/portfolios/:portfolioId/transactions` | Record / list ledger entries |
| GET / PATCH / DELETE | `/transactions/:id` | Read / amend / soft delete a ledger entry |
| GET | `/portfolios/:id/holdings` | Active positions, average cost and P&L |
| GET | `/portfolios/:id/summary` | Securities value, cash, NAV, P&L and funding |
| GET | `/portfolios/:id/dashboard` | Summary, performance, allocation, movers, recent trades and holdings |
| GET | `/portfolios/:id/allocation` | Security asset/sector weights |
| GET | `/portfolios/:id/performance` | Historical NAV and cash-flow adjusted return |
| GET | `/portfolios/:id/dividends` | Net dividend totals and history |

Create a portfolio with `{ "name": "Long Term", "description": "Equity investments", "baseCurrency": "INR" }`. Currency cannot change while there are active transactions. DELETE does not liquidate anything; it hides the portfolio.

Record a deposit to establish the portfolio's cash funding:

```json
{"type":"DEPOSIT","amount":25000,"transactionDate":"2026-09-01"}
```

Then record a purchase:

```json
{"stockId":"<stock UUID>","type":"BUY","quantity":10,"price":1420,"fees":20,"transactionDate":"2026-09-10"}
```

`SELL` uses the same shape. `DIVIDEND` requires a `stockId` and positive `amount`; quantity and price must be zero/omitted. `DEPOSIT` and `WITHDRAWAL` require a positive `amount` with no stock. Fees default to zero. Negative cash is permitted for incomplete manually recorded funding; it is not simulated borrowing. Record missing deposits for meaningful NAV and return metrics.

Transaction filters: `type`, `stock` (symbol), `startDate`, `endDate`, `page`, `limit`, `sort=asc|desc`. Order is transaction date then immutable sequence. A PATCH revalidates the entire affected ledger; deleting or backdating a BUY that would invalidate a later SELL is rejected atomically. Omitted PATCH fields are preserved.

Periods: `1D`, `1W`, `1M`, `3M`, `6M`, `YTD`, `1Y`, `3Y`, `5Y`, `MAX`. Default is `1M`. Add `benchmark=NIFTY50|SENSEX|NASDAQ100|SP500` for `{portfolioPerformance, benchmarkPerformance}`. Prices come from the configured Yahoo or mock provider, without FX conversion; cross-currency benchmarks are local-currency index returns.

## Other resources

| Method | Route | Purpose |
|---|---|---|
| GET | `/stocks` | Paginated active stock master; optional `q` |
| GET | `/stocks/search?q=reliance` | Case-insensitive symbol/company search |
| GET | `/stocks/:symbol` | Stock details |
| POST / GET | `/watchlists` | Create (`name`) / list watchlists |
| PATCH / DELETE | `/watchlists/:id` | Rename (`name`) / soft delete |
| POST / GET | `/watchlists/:id/stocks` | Add (`stockId`) / list stocks with cached quotes |
| DELETE | `/watchlists/:id/stocks/:stockId` | Remove a stock |
| POST / GET | `/alerts` | Create / paginated list |
| PATCH / DELETE | `/alerts/:id` | Update target/condition/status / delete |
| GET | `/notifications` | Paginated persisted alert notifications |
| GET | `/portfolios/:id/analytics` | Return, CAGR, XIRR, volatility, Sharpe, drawdown and beta |
| GET | `/portfolios/:id/analytics/monthly-returns` | Year/month compounded returns |
| GET | `/portfolios/:id/analytics/contribution` | Security-level lifetime P&L contribution |
| GET | `/health` | PostgreSQL and Redis readiness |

Alerts accept `{stockId, condition: "ABOVE"|"BELOW", targetPrice}`. PATCH may set `status` to `ACTIVE` or `DISABLED`. Comparisons are strictly above/below. Triggered alerts are immutable; create a new one to subscribe again. Notifications are durable records, not emails or push messages.

## CSV import

1. `POST /portfolios/:portfolioId/import/preview`, multipart field `file`.
2. Review `{importId, totalRows, validRows, invalidRows, duplicateRows, errors, expiresAt}`.
3. `POST /portfolios/:portfolioId/import/confirm` with `{importId}` returns HTTP 202.
4. Poll `GET /portfolios/:portfolioId/import/:id` for `PREVIEW`, `QUEUED`, `COMPLETED`, or `FAILED`.

```csv
date,symbol,type,quantity,price,fees
2026-09-10,RELIANCE,BUY,10,1420,20
2026-09-12,TCS,BUY,5,3200,15
```

CSV supports BUY/SELL, up to 5,000 rows and 1 MiB, with a 24-hour preview expiry. Duplicate detection compares date, stock, type, quantity, price, fees and amount. Identical CSV rows are treated as duplicates even if they could represent separate real-world orders; enter intentional identical transactions manually. Preview does not mutate the ledger. Valid rows commit together, or all roll back if the current ledger makes them invalid. All confirmations use BullMQ, so the API stays consistent for small and large imports. A persisted QUEUED state allows dispatch recovery after a Redis interruption.

## Rate limits

Per IP, per route, in the single API process: 120 requests/minute by default; registration 5, login 10, refresh 20, stock search 30, imports 10, alerts 30. Configure a shared rate-limit store or enforce limits at the ingress before horizontally scaling API instances. Do not blindly enable trust proxy for arbitrary forwarded headers.

## Market data freshness

Yahoo Finance is enabled by default (`MARKET_DATA_PROVIDER=yahoo`). Successful quotes and historical ranges are cached in Redis for 300 seconds. After expiry, the next request fetches fresh data; summary/dashboard caching does not extend this period. Market-data failures return HTTP 503 with `MARKET_DATA_UNAVAILABLE`, never a fabricated zero-price valuation. Yahoo data may be exchange-delayed.

Holdings include `marketData: {source, updatedAt, fetchedAt}`, `peRatio`, and `latestEarnings` (nullable reported trailing EPS). Watchlist quotes include these metadata fields directly. Summary includes `marketDataSource`. Mock mode remains available explicitly for offline use; clients should use the source field to label prices correctly.
