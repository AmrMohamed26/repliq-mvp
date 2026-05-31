# Production deploy (Vercel + Railway)

The public app is **split across two services**. Local `npm run dev` + `npm run worker:dev` is not enough for https://repliq-mvp.vercel.app unless production services are updated too.

## 1. Push code

```bash
git push origin main
```

## 2. Vercel (UI + APIs)

- Project linked to this repo, branch `main`.
- After push, wait for the deployment to finish (Vercel dashboard → Deployments).
- Required env for **Production and Preview** (Settings → Environment Variables):
  - `REDIS_URL` (Upstash — **must match Railway**; empty value breaks runtime, not build)
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`, `SUPABASE_PUBLIC_BASE_URL`
  - `NEXT_PUBLIC_APP_URL=https://repliq-mvp.vercel.app`

Verify UI deploy:

```bash
curl -s https://repliq-mvp.vercel.app/api/health | jq .
```

Expect JSON with `deploySha` matching your commit (not HTML 404).

## 3. Railway (worker)

- Service built from `Dockerfile.worker` (`railway.toml`).
- Start command: `npm run worker`
- **Same** `REDIS_URL` and Supabase vars as Vercel.
- Do **not** set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` on Railway (Docker installs Chromium).
- Recommended: **≥ 2 GB RAM** (Remotion + Playwright).

Redeploy after every `main` push that touches `workers/`, `Dockerfile.worker`, or pipeline code.

## 4. Run a new batch on production

Old `/v/[leadId]` links keep **old** thumbnails until reprocessed.

1. Open https://repliq-mvp.vercel.app
2. New session → CSV + talking-head → **Process**
3. Wait until the lead is **Done** (Railway logs: job completed)
4. Open the **new** watch link (`/v/...`)

New leads should have `posterThumbnailUrl` (sharp poster) and the updated watch/email UI.

## 5. Troubleshooting

| Check | Command / action |
|-------|------------------|
| Vercel live commit | `GET /api/health` → `deploySha` |
| Worker running | `GET /api/health/queue` → `active > 0` while processing, or `waiting === 0` when idle |
| Worker down | `workerLikelyDown: true` → restart Railway service |
| UI works locally only | Railway not redeployed or batch ran on **local** worker only |
| Pixelated / wrong play button | Old lead — run a **new** batch after both deploys |
