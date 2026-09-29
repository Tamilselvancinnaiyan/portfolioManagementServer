# Deployment and operations

The Compose configuration is a complete local demonstration, with explicit local-only passwords and loopback port bindings. It is not a public-internet deployment manifest.

For a hosted deployment:

1. Build the `runtime` Docker target. Run migrations as a separate one-off job using the `build` target and `npx prisma migrate deploy`. Do not run the demo seed on a production database.
2. Use managed PostgreSQL and Redis or equivalent backed-up persistent services. Redis requires `noeviction` for BullMQ. Enable AOF/persistence and monitor memory, failed jobs, and QUEUED imports.
3. Supply secret-managed `DATABASE_URL`, distinct high-entropy `JWT_SECRET` / `JWT_REFRESH_SECRET`, `REDIS_HOST`, `REDIS_PORT`, optional `REDIS_PASSWORD`, `CORS_ORIGINS`, `PORT`, and `NODE_ENV=production`.
4. Place the API behind TLS termination. The current Redis connection configuration targets a private network; add TLS options before using an endpoint requiring Redis TLS. Protect Swagger at ingress if necessary.
5. Run the API and worker as separate processes from the same application image. Only the worker installs the repeat schedule and consumes jobs. Allow graceful termination so active jobs finish; BullMQ retries stalled jobs after abrupt termination.
6. Use `/health` for readiness. PostgreSQL/Redis outages return HTTP 503. The API depends on both for full functionality; cached reads can fall back to PostgreSQL/market provider.
7. Forward JSON logs to your log collector. Track request latency, database lock timeouts, import failures and alert lag. Tokens, passwords and request bodies are excluded from logs.
8. Take database backups, test restoration, and arrange retention for expired refresh sessions, imports, notifications and audit logs. The application does not silently purge this history.

No external cloud deployment is performed by this repository. Infrastructure credentials, a target host, domain and TLS configuration belong to the deployment environment.

## Local commands

```sh
docker compose up --build -d
docker compose ps
docker compose logs -f api worker
docker compose stop
```

`docker compose down` preserves named volumes. `docker compose down -v` permanently deletes local database and queue data; use it only when you intend to reset the demo.

## Legacy prototype

The root `server.js`, `local.js`, `routes/` and `services/` predate Vestora's NestJS implementation and were preserved, including local modifications. The Vestora entry point is `src/main.ts`; Docker and `npm start` use the compiled NestJS app. The old `vercel.json` is only for the legacy Express prototype, not this PostgreSQL/worker deployment. Legacy scraping dependencies are not included in the Vestora runtime.
