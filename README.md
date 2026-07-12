# Social Poster

Personal cross-platform social media posting tool. Compose once, schedule, and
publish to X/Twitter, Instagram, Facebook, LinkedIn, TikTok, and YouTube Shorts.

This setup runs entirely on **free tiers**: Render (web service), Neon
(Postgres), and cron-job.org (scheduler). No Redis, no separate worker
process, no paid plan required.

## Architecture

- **PlatformAdapter interface** (`src/adapters/PlatformAdapter.js`) — every
  platform implements `getAuthUrl()`, `handleOAuthCallback()`, `validate(post)`,
  and `publish(account, post)`. Adding a new platform = writing one adapter
  file and registering it in `src/adapters/index.js`.
- **Postgres (via Prisma)** — stores connected accounts (encrypted tokens),
  posts, per-platform targets, and publish attempts (audit log).
- **No queue, no worker process.** Scheduled posts are just rows in Postgres
  with a `scheduledFor` timestamp. A `POST /cron/publish-due` endpoint scans
  for due posts and publishes them. An external free scheduler
  (cron-job.org) hits that endpoint every few minutes — this is the
  free-tier substitute for a BullMQ worker, which Render's free plan
  doesn't support anyway.
- **Express API** — connect/disconnect accounts, create/schedule/list posts,
  read publish status.

### Why no Redis/BullMQ

Render's free tier only runs **web services**, not background workers — a
persistent BullMQ worker process would need a paid plan. Rather than fight
that, scheduling is just a DB query (`scheduledFor <= now AND not yet
published`) triggered by an external ping. It's less elegant than a real
job queue but genuinely free and reliable enough for a personal posting
tool checking every 5 minutes.

## Local setup

1. `cp .env.example .env` and fill in:
   - `DATABASE_URL` — point at Neon even for local dev, or run a local
     Postgres if you prefer.
   - `TOKEN_ENCRYPTION_KEY` — 32-byte key: `openssl rand -hex 32`
   - `CRON_SECRET` — any random string: `openssl rand -hex 24`
   - OAuth client id/secret for each platform you actually use
2. `npm install`
3. `npx prisma migrate dev --name init`
4. `npm run dev` — starts the API on :3000
5. To test the scheduler locally without waiting for a real cron:
   `curl -X POST "http://localhost:3000/cron/publish-due" -H "x-cron-secret: $CRON_SECRET"`
6. Open `http://localhost:3000` for the bare-bones composer UI.

## Deploying to Render (free tier)

1. **Create a Neon project** at neon.tech (no credit card). Copy the
   connection string from the dashboard — it looks like
   `postgresql://user:pass@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require`.
   Neon's free plan has **no expiry**, unlike Render's own free Postgres
   which is deleted after 30 days — that's why this setup uses Neon instead
   of Render's database.
2. **Push this repo to GitHub** if you haven't already.
3. **Create the Render service**: New → Blueprint, point it at your repo.
   Render will read `render.yaml` and set up one free web service. (If you'd
   rather click through the UI instead of using the Blueprint: New → Web
   Service, runtime Node, build command
   `npm install && npx prisma generate && npx prisma migrate deploy`, start
   command `node src/server.js`.)
4. **Set the env vars** Render prompts for (marked `sync: false` in
   `render.yaml`, so it'll ask): `DATABASE_URL` (your Neon string),
   `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, and OAuth credentials for whichever
   platforms you've configured.
5. **Get your Render URL** once deployed, e.g.
   `https://social-poster-xxxx.onrender.com`. Set `APP_BASE_URL` to this,
   and update every `..._CALLBACK_URL` env var (and the matching value in
   each platform's developer portal) to
   `https://social-poster-xxxx.onrender.com/accounts/twitter/callback` etc.
6. **Set up the free cron** at cron-job.org (no signup cost, per-minute
   granularity):
   - URL: `https://social-poster-xxxx.onrender.com/cron/publish-due`
   - Method: POST
   - Header: `x-cron-secret: <your CRON_SECRET value>`
   - Schedule: every 5 minutes
   - This does double duty: it fires due posts *and* keeps the free web
     service from spinning down after 15 minutes of inactivity (which
     would otherwise add a 30-60s cold-start delay to the next request).
7. **Verify**: hit `/health`, then open the root URL and connect an
   account to confirm the full OAuth → compose → schedule → publish flow
   works.

### Known limitations of this free stack

- **Timing precision**: posts fire on the next cron tick after their
  scheduled time, so expect up to a ~5 minute delay (whatever your
  cron-job.org interval is), not exact-second accuracy.
- **Neon free tier**: 0.5 GB storage, 100 compute-hours/month, scales to
  zero when idle (small cold-start on first query after idling — fine for
  this use case).
- **If cron-job.org itself goes down** or you forget to set it up, nothing
  publishes — there's no automatic fallback. Check the job's execution
  history on cron-job.org occasionally.

## Platform status in this scaffold

| Platform  | Adapter status | Notes |
|-----------|----------------|-------|
| X/Twitter | **Fully wired** (reference implementation) | Uses `twitter-api-v2`. Needs Elevated/Basic API access for media uploads. |
| Instagram | Stub — needs your Meta App + Business account | Image must be hosted at a public URL before publishing (Graph API requirement, no direct upload). |
| Facebook  | Stub — needs your Meta App + Page | Shares the Meta Graph API client with Instagram. |
| LinkedIn  | Stub — needs `w_member_social` scope | Text + single image supported in stub; article shares TODO. |
| TikTok    | Stub — **requires app review before posting on users' behalf** | Content Posting API, video-only. Don't expect this to work until TikTok approves your app. |
| YouTube Shorts | Stub — needs Data API v3 + resumable upload | Video only, quota-limited (uploads are expensive quota-wise). |

Start by getting the **Twitter adapter working end-to-end**, since it's the
fully wired reference implementation. Once that's solid, copy its shape
into the next adapter you need — the stubs already show you exactly which
methods to fill in.

## Adding a new platform later

1. Create `src/adapters/yourPlatformAdapter.js` implementing `PlatformAdapter`.
2. Register it in `src/adapters/index.js`.
3. Add its OAuth client id/secret to `.env.example` and `.env`.
4. Nothing else changes — routes, the cron endpoint, and the DB schema are
   platform-agnostic.
