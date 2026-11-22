# Deploying

Free Party Games runs on the Cloudflare Workers **free plan**: one Worker serves the static site and the API, and each room is one SQLite-backed Durable Object. No paid service is needed.

## First deploy (from your machine)

```sh
npm i
npx wrangler login      # opens a browser; free Cloudflare account
npm run deploy          # vite build && wrangler deploy
```

Wrangler prints a `https://free-party-games.<your-subdomain>.workers.dev` URL. Open it, host a room, and text the link to friends.

The first deploy applies the `v1` migration in `wrangler.jsonc`, which creates the `RoomDO` class with SQLite storage. Keep that migration as it is; add new migrations below it if the class ever changes.

## Deploying from GitHub (optional)

`.github/workflows/deploy.yml` runs only when started by hand (**Actions → Deploy → Run workflow**). It needs one repo secret:

1. In Cloudflare, create an API token from the **Edit Cloudflare Workers** template.
2. In GitHub, add it under **Settings → Secrets and variables → Actions** as `CLOUDFLARE_API_TOKEN`.

CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on every push and pull request; it never deploys.

## Settings

- **`DEV_BOTS`** (in `wrangler.jsonc` → `vars`) is `"0"`, so production has no **Add bots** button and hides the dev-only Tap Duel game. Set it to `"1"` and redeploy to turn bots on. `npm run worker` and `npm run smoke` already turn it on locally.
- **Rooms clean themselves up**: a room with no connected devices for 2 hours deletes its storage.

## Free-plan limits worth knowing

- Durable Objects: 100,000 requests per day, and SQLite writes are capped per day. A room writes seats, scores and phase changes immediately and batches other game changes to at most one write per second, so a night of games stays far below the limits.
- If you ever exceed a daily limit, requests fail until the next UTC day; nothing is billed on the free plan.

## Running locally

```sh
npm run build && npm run worker   # http://localhost:8787, with dev bots
npm run dev                       # Vite only, proxies /api and /ws to :8787
npm run smoke                     # plays every game over real WebSockets
```
