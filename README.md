# Vestora — Portfolio Management Platform

A transaction-led investment portfolio backend built with NestJS, PostgreSQL, Prisma, Redis and BullMQ. Users manually record investments; Vestora reconstructs holdings, explains gains and losses, and calculates historical performance using Yahoo Finance market data, with deterministic mock data available for offline development and tests.

**This is a software-engineering portfolio project. It does not place orders, connect to brokerage accounts, or recommend investments.**

## Start the complete demo

Prerequisite: Docker with Compose.

```sh
docker compose up --build -d
```

Compose starts PostgreSQL, Redis, a one-off migration/seed job, the API, and a separate worker process. Persistent volumes retain the database and queues. The API waits for migrations and the seed to finish.

- API: [http://localhost:3001](http://localhost:3001)
- Swagger UI: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
- Readiness: [http://localhost:3001/health](http://localhost:3001/health)
- Demo email: `demo@vestora.app`
- Local demo password: `VestoraDemo123!` (override `DEMO_PASSWORD` before the first seed)

The seed is idempotent: 18 stocks/ETFs, one demo portfolio, 30 ledger entries spanning roughly 18 months, a watchlist, and price alerts. Rerunning it preserves existing user data and credentials. Compose's credentials are deliberately local demo defaults; hosted deployments need environment-managed secrets and should omit the demo seed.

## What makes this more than CRUD

- A chronological transaction ledger is the source of truth. Holdings are derived, not independently editable balances.
- Decimal arithmetic, weighted-average cost, fee handling, fractional shares, realized/unrealized P&L, cash flows, dividend income, and closed-position contribution.
- PostgreSQL row locks serialize every ledger mutation per portfolio. Replays validate backdated creates, amendments, deletes and bulk imports, not just new SELL requests.
- Historical NAV uses the quantities actually held on each date. Deposits and withdrawals are separated from investment returns.
- Actual CAGR, XIRR, sample volatility, Sharpe ratio, drawdown, beta and monthly compounding functions with explicit insufficient-data behavior.
- Provider-based market data, versioned Redis caching, durable asynchronous imports and idempotent alert notifications.
- JWT authentication with Argon2id password hashing and atomic single-use refresh-token rotation.
- OpenAPI, strict request validation, ownership checks, JSON logging, rate limits, readiness probes, migrations, tests and containerization.

## Architecture

```text
                  Frontend (e.g. Next.js)
                            |
                            v
                    NestJS REST API
          controllers / DTOs / authentication
                            |
                   application services
                            |
              domain calculations / repositories
                  /         |          \
                 v          v           v
            PostgreSQL    Redis     MarketDataProvider
            via Prisma      |           |
                 ^          v           v
                 |        BullMQ    Yahoo / Mock provider
                 |          |       quotes and daily history
                 |          v
                 +---- Worker process
                       alerts / CSV imports
```

This is a **modular monolith**: one codebase, explicit module boundaries, one relational database, and an independently runnable worker. Financial invariants cross transaction, portfolio and import boundaries; keeping them in one database makes atomic validation straightforward. Microservices would add distributed transactions, network contracts and deployment complexity without a demonstrated need. The worker scales independently because it handles asynchronous work, while sharing the same domain code.

```text
src/
  auth/                 JWT, password hashing, refresh rotation
  users/                Public user profiles
  portfolios/           Portfolio APIs, history and orchestration
  transactions/         Ledger writes, concurrency and filtering
  holdings/             Pure weighted-average calculator and valuation
  stocks/               Searchable stock master
  market-data/          Yahoo/mock providers and five-minute market cache
  watchlists/           Owned lists with cached market quotes
  dividends/            Net income summaries
  analytics/            Statistics, monthly returns and contribution
  alerts/               Alert lifecycle
  imports/              CSV preview, validation and durable confirmation
  notifications/        Persisted notification API
  queues/               Producers, workers and scheduler
  cache/                Redis read-through caching
  common/               DTOs, guards, filters, envelopes and decorators
  database/             Prisma lifecycle
  config/               Validated environment and structured logging
  health/               PostgreSQL + Redis readiness
prisma/                 Schema, committed SQL migration and seed
test/                   Real PostgreSQL/Redis/BullMQ API integration tests
```

All API routes and controller classes must live in `*.controller.ts` files. Keep `*.module.ts` files limited to NestJS dependency wiring; services belong in `*.service.ts` and request DTOs in `*.dto.ts`. Controllers validate and delegate. Application services coordinate ownership, repositories, market data and pure calculations. The financial engine in `src/holdings/holdings.calculator.ts` has no persistence or market-provider dependency. Replacing weighted-average cost with a future FIFO strategy does not require putting calculation logic in controllers.

## Database design

```mermaid
erDiagram
  User ||--o{ RefreshToken : owns
  User ||--o{ Portfolio : owns
  User ||--o{ Watchlist : owns
  User ||--o{ PriceAlert : creates
  User ||--o{ Notification : receives
  User ||--o{ ImportJob : requests
  User ||--o{ AuditLog : generates
  Portfolio ||--o{ Transaction : records
  Portfolio ||--o{ ImportJob : receives
  Stock o|--o{ Transaction : references
  Stock ||--o{ WatchlistItem : appears_in
  Watchlist ||--o{ WatchlistItem : contains
  Stock ||--o{ PriceAlert : tracks
  PriceAlert o|--o| Notification : triggers
```

UUID identifiers are used throughout. Transaction `sequence` is an immutable database-generated bigint tie-breaker, not the resource ID. Monetary inputs use `NUMERIC(24,8)`. Portfolio `revision` versions cached views. Portfolio, transaction and watchlist deletion is soft; normal queries and authorization exclude deleted records. Database CHECK constraints protect transaction shape and positive alert targets even if a write bypasses an API DTO. Cash transactions have no stock; dividends and trades require one.

Important indexes:

| Index | Query / invariant |
|---|---|
| `Portfolio(userId, deletedAt)` | Owned active portfolios |
| `Transaction(portfolioId, transactionDate, sequence)` | Chronological ledger replay, history and sorted pagination |
| `Transaction(portfolioId, stockId)` | Per-position transaction queries |
| `Transaction(portfolioId, type)` | Trade-type and dividend filters |
| `Stock(symbol)` unique | Direct symbol lookup and import resolution |
| `Stock(name)` | Exact/prefix-oriented future catalog access; it does **not** accelerate arbitrary `ILIKE '%term%'` searches |
| `WatchlistItem(watchlistId, stockId)` unique | Idempotent add-to-watchlist |
| `PriceAlert(userId, status)` | User alert management |
| `PriceAlert(stockId, status)` | Active alert grouping by security |
| Active import fingerprint partial unique index | Duplicate active imported transactions |
| `Notification(alertId)` unique | At most one notification for a one-shot alert |
| `ImportJob(status, createdAt)` | Durable dispatch recovery |

The stock catalog is intentionally small. For a large catalog, add a PostgreSQL trigram index for substring search after measuring query plans. Indexes and CHECK constraints are committed as an executable Prisma migration; setup uses `prisma migrate deploy`, not `db push`.

## Calculation methodology

### Weighted-average cost

A BUY adds `quantity × price + fees` to cost basis. The average cost is total remaining cost divided by quantity. A SELL removes the sold fraction of that cost and realizes `quantity × salePrice − sellFees − removedCost`. The remaining average is unchanged. Closing a position zeroes its cost exactly but preserves realized P&L. A subsequent BUY starts a new average cost.

```text
BUY  10 × 100 = 1,000
BUY  10 × 120 = 1,200
Cost 2,200 / 20 shares = average 110
SELL 5 × 140 = proceeds 700
Removed basis = 5 × 110 = 550
Realized P&L = 150; remaining quantity = 15; remaining basis = 1,650
```

Buy/sell fees participate in the formulas. Decimal.js precision is 40 significant digits; calculations round only at display boundaries. Unrealized P&L is current security value minus remaining basis. Allocation uses current **security** market value, excluding cash, so weights describe the invested assets. Holding day P&L is current quantity times the price change; portfolio day P&L additionally accounts for cash, today's trades, fees and dividends.

### Cash, currency and summary

Each portfolio has one currency (`INR` or `USD`). A transaction's stock currency must match it. Create separate Indian and US portfolios; there is no implicit FX conversion. User base currency is a preference, not an exchange-rate service.

`cashBalance = deposits − withdrawals − buys + net sell proceeds + net dividends − cash-entry fees`.

`portfolioValue` is NAV: security value plus cash. `securitiesValue` is provided separately. `investedAmount` is the remaining cost basis of open positions. `totalPnL = NAV − netContributions`; its percentage uses gross deposits, and is not an annualized return. Today P&L subtracts yesterday's NAV and today's net external cash flows.

A manual BUY is permitted without first recording a DEPOSIT, to support incomplete imported histories. This creates a visible negative cash balance. Vestora does not invent funding: record missing deposits to obtain meaningful NAV, XIRR and portfolio-level returns. P&L and per-security cost basis remain useful, while metrics with invalid denominators return `null`.

### Historical performance and analytics

History replays all earlier transactions, then advances through the requested UTC daily interval once. Price requests run concurrently by symbol. Mock prices are deterministic functions of symbol and absolute date, so overlapping queries agree and past values do not drift with the query start date. Mock mode is deliberately synthetic and includes calendar days. Yahoo mode fetches daily chart closes and carries the last known close forward over weekends/holidays, using exchange-local session dates and never backfilling from future prices. Missing prices for held positions return a data-unavailable error. Both modes use calendar-day statistics (365 annual periods). Splits, taxes, FX, corporate actions, intraday prices and tax-lot accounting are out of scope.

Daily return assumes external flows occur at the **beginning of the day**:

```text
r[t] = NAV[t] / (NAV[t−1] + deposits[t] − withdrawals[t]) − 1
cumulative return = product(1 + r[t]) − 1
```

Insufficient/invalid capital or a negative NAV gives `null`, rather than treating deposits as profit. `absoluteReturn` in analytics is the cumulative linked return above. Period aliases use calendar days (1M = 30, 3M = 90, 1Y = 365); YTD uses the UTC year boundary. MAX starts at the first recorded transaction. Monthly results compound daily returns; first and current months may be partial.

| Metric | Method / insufficient-data rule |
|---|---|
| CAGR | Annualizes the linked return index; requires at least one year and valid positive starting value |
| XIRR | Solves dated external investor flows plus terminal NAV with bounded bisection in log-rate space, ACT/365; requires both signs and distinct dates |
| Volatility | Sample standard deviation of daily linked returns × √365; requires at least 30 valid daily observations |
| Sharpe | Mean daily excess return / sample deviation × √365; risk-free rate explicitly 0; requires 30 observations and nonzero variance |
| Maximum drawdown | Largest peak-to-trough fall in the cash-flow adjusted return index; requires two positive index values |
| Beta | Sample covariance(portfolio, benchmark) / sample benchmark variance on aligned daily returns; requires 30 observations |
| Contribution | Lifetime realized + unrealized P&L + net dividends per security, including closed positions; percentage uses net contributions |

XIRR returns `null` for cash-flow sequences with multiple sign changes because multiple roots can exist; it does not select a misleading arbitrary root. Extremely large rates outside the bounded search also return `null`. Benchmark beta defaults to NIFTY50 for INR and SP500 for USD. Explicit comparisons additionally support SENSEX and NASDAQ100. The demo ledger contains fictional transactions even when Yahoo prices are enabled. Yahoo daily closes can be split-adjusted; corporate-action reconciliation is not implemented, so portfolios crossing a split require ledger adjustment before historical results are meaningful.

## Concurrency and atomicity

Every create, update, delete or import first locks the owned, nondeleted portfolio row with PostgreSQL `SELECT ... FOR UPDATE` inside an interactive transaction at the default Read Committed isolation level. It then reads the current ledger, applies the proposed change, and replays entries ordered by `(transactionDate, sequence)`. Negative security quantities at **any historical point** reject the operation.

Two simultaneous `SELL 8` requests against 10 shares serialize on the portfolio lock. The first commits; the second reads the committed result and fails with available quantity 2. A retroactive BUY deletion that would invalidate a later SELL also fails. Audit insertion and revision increment are in the same database transaction. Any error rolls everything back. Different portfolios can mutate concurrently. All application write paths, including imports and portfolio deletion, use this same lock; direct database users must honor the protocol.

This favors correctness and interview clarity over maximum write throughput. Replaying the ledger is O(n) per write. A future optimization can checkpoint derived state and replay only affected history while preserving the same invariants. No Redis lock is involved in financial correctness.

## Redis and BullMQ

Yahoo quotes use `stock:quote:yahoo:v1:<symbol>` with a **300-second Redis TTL**, measured from a successful fetch. Historical ranges use source-specific keys with the same TTL. A request within five minutes reads Redis. Expiry does not trigger a timer: the next API request (or alert job needing the quote) fetches Yahoo again and resets the TTL. Concurrent misses are coalesced within each process; separate API/worker processes may both fetch a cold key. Upstream errors are not cached and return HTTP 503 / `MARKET_DATA_UNAVAILABLE`; the application never substitutes zero or mock prices. Redis outages fall back to Yahoo.

In Yahoo mode, outer summary/dashboard caches are bypassed so they cannot serve a stale valuation after the underlying quote's five-minute expiry. Financial calculations still read the current ledger. Mock mode retains 60-second quote caching and revision-keyed summary/dashboard caching (45/30 seconds). Cache namespaces include the source, preventing synthetic values from leaking into Yahoo results. Ownership is checked before market access.

Revision increments commit atomically with transaction writes. An old in-flight read can populate only its old versioned key, so it cannot restore stale data for later requests after a write. Superseded keys expire naturally; no wildcard deletion or Redis/database dual-write transaction is necessary. Redis cache failures fall through to computation.

Only the worker process registers the 60-second BullMQ alert scheduler. It batches alerts, fetches unique-symbol quotes, and atomically changes matching ACTIVE alerts to TRIGGERED while inserting a notification. The update checks the alert version, so concurrently edited conditions cannot trigger a stale notification. Retries and multiple workers are safe.

CSV confirmation persists `QUEUED` before enqueueing. This row is a small durable outbox using the existing ImportJob table. Workers periodically recover pending dispatches. Jobs have stable IDs, bounded retries, exponential backoff and bounded completed/failed retention. The processor locks the portfolio, rechecks the import state and current ledger, then inserts all accepted rows and marks COMPLETED in one transaction. A retry after a successful commit is a no-op. A ledger conflict fails the complete import instead of leaving partial results. Preview errors remain separate from execution errors.

## API documentation

See [the API contract](docs/API.md) for endpoint tables, request examples, envelopes, filters, limits, token behavior and CSV workflow. Swagger documents DTOs and JWT authorization. [Deployment notes](docs/DEPLOYMENT.md) cover operational requirements and the preserved legacy prototype.

## Yahoo Finance configuration

`MARKET_DATA_PROVIDER=yahoo` is the default in local configuration and Docker Compose. Use `MARKET_DATA_PROVIDER=mock` for offline development; automated integration tests explicitly select mock mode and do not depend on Yahoo availability.

The adapter uses the supported `yahoo-finance2` v4 client. NSE symbols map to `.NS`, BSE to `.BO`; US symbols stay unchanged. Benchmarks map to `^NSEI`, `^BSESN`, `^NDX`, and `^GSPC`. It uses stock-master exchange/currency fields instead of blindly appending `.NS` as the legacy prototype did. Quote currency must match the stock currency.

Quotes expose `source`, `updatedAt` (Yahoo market timestamp), and `fetchedAt` (our fetch timestamp). Holding responses include these under `marketData`, plus nullable `peRatio` and `latestEarnings` (reported trailing-twelve-month EPS, not a fabricated price/PE estimate). Summary includes `marketDataSource`. Prices can be exchange-delayed; a freshly fetched quote is not a guarantee of real-time trading data. The client is an [unofficial Yahoo Finance API](https://github.com/gadicc/yahoo-finance2), with no uptime guarantee.

The legacy `services/portfolio.service.js` was used as a reference; NestJS endpoints use the new provider without importing the Google-scraping fallback or the prototype's in-memory cache.

## Develop locally

Use Node.js 22 or newer and npm. Prisma 6.19 is pinned for its stable schema/client API; package-lock.json pins resolved versions. Audited transitive overrides are explicit in package.json and must be rechecked when upgrading Prisma.

```sh
cp .env.example .env
npm ci
npm run db:generate
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed
npm run start:dev
# In a second terminal:
npm run worker:dev
```

`prisma` commands load `.env`; the Nest ConfigModule validates it at startup. `db:seed` needs `DEMO_PASSWORD` in the shell environment (for example `DEMO_PASSWORD='VestoraDemo123!' npm run db:seed`). The Docker migration job supplies it automatically. No real credentials belong in Git.

| Environment variable | Purpose |
|---|---|
| `MARKET_DATA_PROVIDER` | `yahoo` (default) or `mock` |
| `DATABASE_URL` | PostgreSQL connection URL |
| `REDIS_HOST`, `REDIS_PORT` | Redis endpoint |
| `QUEUE_PREFIX` | BullMQ namespace, default `vestora` |
| `REDIS_PASSWORD` | Optional Redis authentication |
| `JWT_SECRET` | Access-token signing secret, minimum 32 characters |
| `JWT_REFRESH_SECRET` | Different refresh-token secret, minimum 32 characters |
| `PORT` | API port, default 3001 |
| `NODE_ENV` | development, test or production |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins |
| `DEMO_PASSWORD` | Explicit seed password, at least 12 characters |

The API and worker use non-root runtime containers. Development/build tools are excluded from the runtime image; the migration job uses a tooling build target. PostgreSQL and Redis are bound to loopback for local development.

## Testing

```sh
npm run typecheck
npm run build
npm test
npm run test:cov
npm run format:check
```

Unit tests cover average-cost buys/sells, fees, full liquidation/re-entry, fractional arithmetic, insufficient holdings, unrealized P&L, allocation, summary, dated quantities, cash-flow neutral history and analytics edge cases.

Integration tests run the real Nest HTTP stack with PostgreSQL, Redis and a BullMQ consumer. They check ownership isolation, DTO validation, refresh rotation/reuse, concurrent sells, retroactive rollback, cache revision changes, CSV preview/queue processing, notification idempotency and soft deletion. A dedicated database name ending in `_test` is mandatory. They clean only the users they create; never point them at a production database. Each test run uses a unique queue prefix and removes its own queues afterward.

```sh
docker compose up -d postgres redis
docker compose exec postgres createdb -U vestora vestora_test
export DATABASE_URL='postgresql://vestora:vestora_local@localhost:5432/vestora_test?schema=public'
export REDIS_HOST=localhost REDIS_PORT=6379 NODE_ENV=test
export JWT_SECRET='test-access-secret-at-least-32-characters'
export JWT_REFRESH_SECRET='test-refresh-secret-at-least-32-characters'
npm run db:migrate
npm run test:integration
```

GitHub Actions runs generation, formatting, type checks, build, unit tests, migrations and integration tests with disposable PostgreSQL/Redis service containers.

## Deliberate scope and next steps

The requested four phases are implemented as one modular application: core ledger/authentication; dashboard/history/watchlists; queues/imports/analytics; and containerization/testing/operations. External hosting is environment-specific and is documented rather than silently deployed.

Next improvements should be driven by measured needs: a licensed market-data provider, trading calendars and corporate actions, explicit FX conversion, FIFO/tax lots, incremental history checkpoints, shared distributed rate limiting for multiple API replicas, configurable risk-free benchmarks, import preview streaming, refresh-session management/password recovery, and email/push adapters for persisted notifications.

Framework references: [NestJS authentication](https://docs.nestjs.com/security/authentication), [NestJS rate limiting](https://docs.nestjs.com/security/rate-limiting), [BullMQ job schedulers](https://docs.bullmq.io/guide/job-schedulers/), and [PostgreSQL row-level locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).
