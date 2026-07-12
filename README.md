# Social Poster

Personal cross-platform social media posting tool. Compose once, schedule, and
publish to X/Twitter, Instagram, Facebook, LinkedIn, TikTok, and YouTube Shorts.

## Architecture

- **PlatformAdapter interface** (`src/adapters/PlatformAdapter.js`) — every
  platform implements `getAuthUrl()`, `handleOAuthCallback()`, `validate(post)`,
  and `publish(account, post)`. Adding a new platform = writing one adapter file
  and registering it in `src/adapters/index.js`. Core routing/scheduling code
  never needs to change.
- **Postgres + Prisma** — stores connected accounts (encrypted tokens), posts,
  per-platform targets, and publish attempts (for the audit log / retries).
- **BullMQ + Redis** — the publish queue. Scheduled posts become delayed jobs;
  the worker calls `adapter.publish()` and records the result.
- **Express API** — connect/disconnect accounts, create/schedule/list posts,
  read publish status.

## Setup

1. `cp .env.example .env` and fill in:
   - `DATABASE_URL` (Postgres)
   - `REDIS_URL`
   - `TOKEN_ENCRYPTION_KEY` — 32-byte key, generate with
     `openssl rand -hex 32`
   - OAuth client id/secret for each platform you actually use (see notes below)
2. `npm install`
3. `npx prisma migrate dev --name init`
4. `npm run dev` — starts the API on :3000
5. `npm run worker` — starts the publish worker (separate process)
6. Open `public/index.html` (or `npm run dev` also serves it statically) for a
   bare-bones composer UI to test end-to-end.

## Platform status in this scaffold

| Platform  | Adapter status | Notes |
|-----------|----------------|-------|
| X/Twitter | **Fully wired** (reference implementation) | Uses `twitter-api-v2`. Needs Elevated/Basic API access for media uploads. |
| Instagram | Stub — needs your Meta App + Business account | Image must be hosted at a public URL before publishing (Graph API requirement, no direct upload). |
| Facebook  | Stub — needs your Meta App + Page | Shares the Meta Graph API client with Instagram. |
| LinkedIn  | Stub — needs `w_member_social` scope | Text + single image supported in stub; article shares TODO. |
| TikTok    | Stub — **requires app review before posting on users' behalf** | Content Posting API, video-only. Don't expect this to work until TikTok approves your app. |
| YouTube Shorts | Stub — needs Data API v3 + resumable upload | Video only, quota-limited (uploads are expensive quota-wise). |

Start by getting the **Twitter adapter working end-to-end** with your own
account, since it's the fully wired reference implementation. Once that's
solid, copy its shape into the next adapter you need — the stubs already show
you exactly which methods to fill in.

## Deploying to Railway

This repo includes a `Procfile` (web/worker/release process types) and
`railway.json` (Nixpacks build config). Railway needs **two services**
from this one repo — API and worker — plus Postgres and Redis plugins.

1. **Create the project**: `railway login`, then `railway init` in this
   directory (or import the repo from GitHub in the Railway dashboard).
2. **Add plugins**: in the Railway dashboard, add a **PostgreSQL** plugin
   and a **Redis** plugin to the project. Railway auto-injects its own
   connection variables — check what it names them and either use those
   directly or map them to `DATABASE_URL`/`REDIS_URL` under your service's
   Variables tab (this app expects those exact names).
3. **Set the rest of the env vars**: in each service's Variables tab, add
   `TOKEN_ENCRYPTION_KEY` (generate with `openssl rand -hex 32`) and the
   OAuth client id/secret pairs for whichever platforms you've configured.
   These need to be set on **both** the web and worker services.
4. **Create the web service**: point it at this repo. Railway will detect
   `railway.json` and use `node src/server.js` as the start command
   automatically. Under Settings → Networking, generate a public domain —
   that's your `APP_BASE_URL` and the base for your OAuth callback URLs.
5. **Create the worker service**: add a second service from the *same*
   repo, then override its start command in Settings → Deploy → Custom
   Start Command to `node src/queue/publishWorker.js` (it would otherwise
   inherit the web command from `railway.json`). This is the step people
   most often skip — without it, posts get scheduled but never publish.
6. **Run the migration once**: `railway run npx prisma migrate deploy`
   from your local machine (targeting the linked Railway project), or set
   it as a one-off via Railway's Pre-Deploy Command feature on the web
   service if your plan supports it.
7. **Update OAuth callback URLs**: swap every `..._CALLBACK_URL` env var
   (and the matching value in each platform's developer portal) from
   `localhost` to your Railway domain, e.g.
   `https://your-app.up.railway.app/accounts/twitter/callback`.
8. **Verify**: hit `https://your-app.up.railway.app/health`, then open the
   root URL to use the composer UI and reconnect your accounts against the
   production callback URLs.

## Adding a new platform later

1. Create `src/adapters/yourPlatformAdapter.js` implementing `PlatformAdapter`.
2. Register it in `src/adapters/index.js`.
3. Add its OAuth client id/secret to `.env.example` and `.env`.
4. Nothing else changes — routes, queue, and DB schema are platform-agnostic.
