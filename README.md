# Repliq MVP

Personalized Loom-style outreach videos at scale — generated from a CSV of leads plus a single talking-head recording.

> **Local-first, no auth, no SaaS.** Everything runs on your machine (or a single VPS). Sessions live in Redis with a 24h TTL; rendered videos are stored in Supabase Storage.

## Stack

- **Next.js 15** App Router + React 19 + TypeScript
- **TailwindCSS** + **shadcn/ui** + **Framer Motion**
- **BullMQ** + **Redis** for the job queue
- **Playwright** for full-page screenshots
- **Remotion** for video composition
- **FFmpeg** for thumbnail extraction + post-processing
- **Supabase Storage** for public video + thumbnail delivery

## Quick start

```bash
# 1. Install dependencies (also installs Playwright Chromium)
npm install

# 2. Configure env
cp .env.example .env
# … fill in your Supabase Storage credentials

# 3. Start Redis
docker compose -f docker/docker-compose.yml up -d redis

# 4. Run the web + worker in two terminals
npm run dev          # http://localhost:3000
npm run worker
```

## Scripts

| script              | what it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Next.js dev server                                       |
| `npm run build`     | Production build                                         |
| `npm run start`     | Production Next server                                   |
| `npm run worker`    | BullMQ worker (screenshots, rendering, storage uploads)  |
| `npm run remotion`  | Remotion preview UI for the composition                  |
| `npm run lint`      | ESLint                                                   |
| `npm run typecheck` | `tsc --noEmit`                                           |

## Supabase Storage setup

1. Supabase dashboard → **Storage** → create a bucket (e.g. `repliq-mvp`).
2. Make the bucket public, or configure a public CDN URL for the bucket.
3. Project settings → **API** → copy the project URL and service-role key.
4. Paste the values into `.env`:
   ```env
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   SUPABASE_BUCKET=repliq-mvp
   SUPABASE_PUBLIC_BASE_URL=https://<project-ref>.supabase.co/storage/v1/object/public/repliq-mvp
   ```

## Architecture

See [.cursor/plans/repliq_mvp_architecture_*.plan.md](.cursor/plans/) for the full plan. TL;DR:

- One Next.js process serves the wizard + APIs.
- A separate worker process (`npm run worker`) consumes a BullMQ queue. Each job is one lead and runs through `screenshot → render → thumbnail → upload`.
- Progress is published to Redis pub/sub; the UI subscribes via SSE for live updates.
- No DB — session state is a Redis hash with a 24h TTL.

## Deployment

Built to run as two long-lived Docker containers (`web` + `worker`) plus Redis. See `docker/` and the deployment section of this README (added in the final step of the implementation plan).
