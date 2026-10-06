# NadScan continuous indexer

An independent Monad mainnet worker and authenticated data API. It runs scan steps continuously while the service process is running; it does not need a visitor's browser. No nad.fun API key is required.

## Current status

Source is prepared; the service is **not deployed**. Render rejected database creation because billing information is missing. The private Sites dashboard still uses its existing indexer. Connecting it to this service and migrating its saved history remain deployment steps, not completed work.

## Features

- Receipt-confirmed buys and sells from supported nad.fun bonding curves and MON pools.
- Durable PostgreSQL cursors, pending receipt queue and duplicate prevention.
- Recent activity priority, bounded scan steps and provider backoff.
- Weighted-average realised P&L including gas, per-sale P&L and return percentage.
- Win rate counts fully closed known-cost positions. Missing history stays provisional.
- Authenticated APIs: `GET /api/data?period=all`, `GET /api/holdings?id=...`, `GET /api/status`, `POST /api/profiles`.
- Public `/health` exposes service health only. No wallet data or credentials.

## Deployment

Use `render.yaml` in the Frankfurt workspace. The selected always-on web service and small PostgreSQL instance cost approximately $13/month before storage, traffic and taxes. Render requires a payment method. Do not use a sleeping free web service for continuous indexing.

Required environment variables:

- `DATABASE_URL`: private Render PostgreSQL connection string.
- `MONAD_RPC_URL`: configured Monad Alchemy HTTPS endpoint.
- `INDEXER_API_KEY`: random secret with at least 32 characters. Only server-side clients receive it.
- `INITIAL_PROFILES`: JSON array containing approved profile records (`id`, `wallet`, `name`, `handle`, optionally `avatar`, `note`, `active`). Used only if the profile table is empty.

Never commit environment values or platform service-access credentials. Do not make the Sites dashboard public to connect it.

## Verify before dashboard cutover

1. Confirm Render deployment is live and `/health` responds.
2. Verify PostgreSQL schema and authenticated profile/data endpoints against real PostgreSQL.
3. Import existing trades, tokens and contiguous scan state through a reviewed migration. Do not mark missing history complete.
4. Verify consecutive successful scan steps with advancing head/cursors and receipt processing while all browser tabs are closed.
5. Configure a server-only proxy in the private dashboard using the new service key; propagate admin profile edits to the worker. Preserve current Site authentication.
6. Verify buy/sell amounts against onchain receipts, then switch the dashboard reads and disable duplicate browser-driven scanning.

## Local checks

Node 22+, `npm install`, `npm test`, `npm run build`. Engine tests mock provider/storage; they do not replace production PostgreSQL and live-chain verification.

## Coverage limits

RPC plan limits determine catch-up speed. A small allowed log range can leave the worker behind even when continuously running. Unsupported swap routes and transferred inventory are excluded from performance calculations; no final ranking is claimed until full required history is indexed.
