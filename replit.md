# VINZ PREDICT

An AI-powered crypto and stock market prediction website showing live prices, curated news with sentiment analysis, and AI-driven buy/sell/hold signals for assets.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/crypto-saham run dev` — run the frontend (port 18124)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec (only if spec changes)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, TanStack Query, wouter, recharts, framer-motion, shadcn/ui
- API: Express 5 + pino logging
- DB: PostgreSQL + Drizzle ORM (not currently used)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/routes/` — Express route handlers (market, predictions, news)
- `artifacts/api-server/src/services/` — coingecko.ts, stocks.ts, news.ts, predictions.ts, cache.ts
- `artifacts/crypto-saham/src/pages/` — Dashboard, CryptoMarket, StockMarket, Predictions, PredictionDetail, News
- `artifacts/crypto-saham/src/components/shared/` — PriceChange, SignalBadge
- `lib/api-spec/` — OpenAPI spec (source of truth for all API contracts)
- `lib/api-zod/` — Generated Zod schemas from spec
- `lib/api-client-react/` — Generated TanStack Query hooks from spec

## Architecture decisions

- Contract-first API: OpenAPI spec → Orval codegen → Zod validation + React Query hooks
- All external API calls have fallback data so the app is always functional
- CoinGecko free tier: crypto list/prices work (cached 2min), history 429-rate-limited → synthetic fallback generated from current price + 24h change
- Yahoo Finance: returns 401 → hardcoded IDX + global stock fallback data
- CryptoCompare / CryptoPanic: require API keys → curated FALLBACK_NEWS used instead
- Alternative.me Fear & Greed API: works without key (`https://api.alternative.me/fng/?limit=1`)
- NewsItem internal type uses `tags` (not `relatedAssets`) and `body` (not `summary`) — mapped to API schema in `toApiArticle()`

## Product

- **Dashboard**: Real-time Fear & Greed gauge, trending coins, top crypto table, top AI predictions
- **Crypto Market**: Live prices for 50 coins from CoinGecko, sortable by any column
- **Stock Market**: IDX (BEI) saham Indonesia + global stocks with IDR/USD prices
- **Predictions**: AI signal cards (BUY/SELL/HOLD/NEUTRAL) with confidence bars and sentiment scores for crypto and stocks
- **Prediction Detail**: 7/14/30/90-day price chart (recharts), RSI, support/resistance, MA7, related news
- **News Feed**: Curated crypto + stock news with sentiment badges, sentiment summary bar

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do NOT regenerate Orval unless the OpenAPI spec changes — hooks from `@workspace/api-client-react` are already correct
- `getCryptoPredictions(limit)` uses `limit` as a cache key — calling with 100 vs 20 makes two separate CoinGecko calls; `null` values for `price_change_percentage_24h` must always be guarded with `?? 0`
- `NewsItem` service type uses `.tags[]` (not `.relatedAssets`), `.body` (not `.summary`), `.categories[]` (not `.type`)
- History endpoint fallback generates synthetic price history seeded from `coin.id` when CoinGecko returns 429
- Yahoo Finance always returns 401; stock data comes from hardcoded fallback in `stocks.ts`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
