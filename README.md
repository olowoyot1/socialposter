# Social Poster

Personal cross-platform social media posting tool. Compose once, schedule, and
publish to X/Twitter, Instagram, Facebook, LinkedIn, TikTok, and YouTube Shorts.

This setup runs entirely on **free tiers**: Vercel (serverless functions),
Neon (Postgres), and cron-job.org (scheduler). No Redis, no separate worker
process, no paid plan required.

## Architecture

- **PlatformAdapter interface** (`src/adapters/PlatformAdapter.js`) — every
  platform implements `getAuthUrl()`, `handleOAuthCallback()`, `validate(post)`,
  and `publish(account, post)`. Adding a new platform = writing one adapter
  file and registering it in `src/adapters/index.js`.
- **Postgres (via Prisma)** — stores connected accounts (encrypted tokens),
  posts, per-platform targets, publish attempts (audit log), and short-lived
  OAuth state (see below).
- **No queue, no worker process.** Scheduled posts are just rows in Postgres
  with a `scheduledFor` timestamp. A `POST /cron/publish-due` endpoint scans
  for due posts and publishes them. An external free scheduler
  (cron-job.org) hits that endpoint every few minutes.
- **Single Express app, deployed as one Vercel serverless function**
  (`api/index.js` wraps `src/app.js` directly — Vercel's Node runtime
  accepts a plain Express handler with no adapter library needed).
  `vercel.json` routes `/accounts/*`, `/posts/*`, `/cron/*`, and `/health`
  to that function; the composer UI at `/` is served as a static file from
  `/public`.

### Why no Redis/BullMQ, and why OAuth state lives in the DB

Serverless functions are stateless between invocations — nothing kept in a
JS variable or in-memory `Map` survives from one request to the next,
because the next request might not even hit the same function instance.
That ruled out two things a "normal" server could get away with:

- **A BullMQ worker process** — there's no persistent process to run it on.
  Scheduling is a DB query instead (`scheduledFor <= now`), triggered by an
  external cron ping.
- **In-memory OAuth PKCE state** — the original version stashed the PKCE
  verifier in a `Map` between `/connect` and `/callback`. On Vercel those
  two requests can land on different instances, silently losing the
  verifier. It's now a short-lived `OAuthState` row in Postgres instead
  (see `prisma/schema.prisma`).

## Local setup

1. `cp .env.example .env` and fill in:
   - `DATABASE_URL` / `DIRECT_URL` — both point at Neon (see step 1 below
     for pooled vs. direct). For pure local dev you can also run a local
     Postgres and use the same URL for both.
   - `TOKEN_ENCRYPTION_KEY` — 32-byte key: `openssl rand -hex 32`
   - `CRON_SECRET` — any random string: `openssl rand -hex 24`
   - OAuth client id/secret for each platform you actually use
2. `npm install` (this also runs `prisma generate` via `postinstall`)
3. `npx prisma migrate dev --name init`
4. `npm run dev` — starts the API on :3000 (this runs the plain Express
   server directly; Vercel's function wrapper in `api/index.js` is only
   used in deployment)
5. To test the scheduler locally without waiting for a real cron:
   `curl -X POST "http://localhost:3000/cron/publish-due" -H "x-cron-secret: $CRON_SECRET"`
6. Open `http://localhost:3000` for the bare-bones composer UI.

## Deploying to Vercel (free tier)

1. **Create a Neon project** at neon.tech (no credit card). On the
   dashboard's Connection Details, grab **two** connection strings:
   - The **pooled** one (host contains `-pooler`) → this is your
     `DATABASE_URL`. Serverless functions can open many concurrent
     connections; only the pooled endpoint handles that without exhausting
     Postgres's connection limit.
   - The **direct** one (no `-pooler`) → this is your `DIRECT_URL`, used
     only when running `prisma migrate`.
   - Both need `?sslmode=require` appended if it's not already there.
2. **Run the initial migration from your own machine** against `DIRECT_URL`
   before deploying: `npx prisma migrate deploy`. (Don't wire this into the
   Vercel build — running schema migrations automatically on every
   serverless deploy is a common source of race conditions; do it manually
   when your schema changes instead.)
3. **Push this repo to GitHub** if you haven't already.
4. **Import the project on vercel.com**: New Project → import your GitHub
   repo. Vercel auto-detects the `api/` folder as serverless functions and
   reads `vercel.json` for routing — no framework preset needed, leave
   "Other" selected if asked.
5. **Set environment variables** in the Vercel project settings:
   `DATABASE_URL`, `DIRECT_URL`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, and
   OAuth credentials for whichever platforms you've configured. Deploy (or
   redeploy) after adding them.
6. **Get your Vercel URL**, e.g. `https://social-poster-xxxx.vercel.app`.
   Set `APP_BASE_URL` to this, and update every `..._CALLBACK_URL` env var
   (and the matching value in each platform's developer portal) to
   `https://social-poster-xxxx.vercel.app/accounts/twitter/callback` etc.
   Redeploy after changing env vars.
7. **Set up the free cron** at cron-job.org (no signup cost, per-minute
   granularity):
   - URL: `https://social-poster-xxxx.vercel.app/cron/publish-due`
   - Method: POST
   - Header: `x-cron-secret: <your CRON_SECRET value>`
   - Schedule: every 5 minutes
   - Unlike Render, Vercel functions don't "spin down" in a way that adds
     cold-start delay to matter here — this cron is purely for firing due
     posts, not for keeping anything awake.
8. **Verify**: hit `/health`, then open the root URL and connect an account
   to confirm the full OAuth → compose → schedule → publish flow works.

### Known limitations of this free stack

- **Timing precision**: posts fire on the next cron tick after their
  scheduled time — expect up to a ~5 minute delay, not exact-second
  accuracy.
- **Neon free tier**: 0.5 GB storage, 100 compute-hours/month, scales to
  zero when idle (small cold-start on first query after idling).
- **Vercel Hobby function limits**: 10-second execution timeout on the
  Hobby plan. Fine for OAuth/API calls to one platform, but if you ever
  batch-publish to many accounts in a single `/cron/publish-due` call and
  it starts approaching that limit, you'd need to either upgrade or split
  the work across more frequent, smaller cron ticks.
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
