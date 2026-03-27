# TechJM / Grow Social MVP - Developer Setup Guide

Complete step-by-step guide to set up and run the project locally, covering **Phase 1 through Phase 12**.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone & Install](#2-clone--install)
3. [Docker Services](#3-docker-services-postgresql-redis-caddy-uptime-kuma)
4. [Environment Variables](#4-environment-variables)
5. [Firebase Setup](#5-firebase-setup-authentication)
6. [Database Setup](#6-database-setup-phase-2)
7. [AI Provider Keys (BYOK)](#7-ai-provider-keys-byok---phase-3)
8. [Social OAuth Setup](#8-social-oauth-setup---phase-4)
9. [Run the Project](#9-run-the-project)
10. [Verify Everything Works](#10-verify-everything-works)
11. [Project Structure](#11-project-structure)
12. [Available Scripts](#12-available-scripts)
13. [Phase-by-Phase Breakdown](#13-phase-by-phase-breakdown)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Prerequisites

Install these before starting:

| Tool       | Version  | Check Command          | Install                                      |
| ---------- | -------- | ---------------------- | -------------------------------------------- |
| Node.js    | >= 18.x  | `node -v`              | https://nodejs.org or `nvm install 18`       |
| npm        | >= 10.x  | `npm -v`               | Comes with Node.js                           |
| Docker     | >= 24.x  | `docker -v`            | https://docs.docker.com/get-docker/          |
| Docker Compose | >= 2.x | `docker compose version` | Included with Docker Desktop              |
| Git        | >= 2.x   | `git --version`        | https://git-scm.com                          |

---

## 2. Clone & Install

```bash
# Clone the repository
git clone <your-repo-url> grow-social-mvp
cd grow-social-mvp

# Install all dependencies (root + all workspaces)
npm install
```

This installs dependencies for:
- `apps/web` (Next.js frontend)
- `apps/worker` (BullMQ job processor)
- `packages/db` (Drizzle ORM + schemas)
- `packages/shared` (shared types/utilities)
- `packages/ai-adapters` (AI provider integrations)

---

## 3. Docker Services (PostgreSQL, Redis, Caddy, Postiz, Uptime Kuma)

Start all infrastructure services:

```bash
# Start all services in background
docker compose up -d
```

This spins up:

| Service      | Port  | Purpose                        | Credentials              |
| ------------ | ----- | ------------------------------ | ------------------------ |
| PostgreSQL 16 | 5432  | Primary database               | `postgres` / `postgres`  |
| Redis 7      | 6379  | BullMQ job queue + cache       | No auth (local)          |
| Caddy        | 80/443 | Reverse proxy (auto-SSL)      | N/A                      |
| Postiz       | 5000  | Social media publishing proxy  | API key in `.env`        |
| Uptime Kuma  | 3001  | Monitoring dashboard           | Set on first visit       |

> **Note:** Postiz uses a separate `postiz` database in the same PostgreSQL instance (auto-created by `docker/init-db.sql`). If Postiz fails to start or isn't configured, the publishing pipeline falls back to direct LinkedIn/X API calls.

**Verify services are running:**

```bash
# Check all containers are up and healthy
docker compose ps

# Test PostgreSQL connection
docker compose exec postgres pg_isready -U postgres
# Expected: /var/run/postgresql:5432 - accepting connections

# Test Redis connection
docker compose exec redis redis-cli ping
# Expected: PONG
```

**Manage services:**

```bash
# Stop all services
docker compose down

# Stop and remove all data (fresh start)
docker compose down -v

# View logs
docker compose logs -f postgres
docker compose logs -f redis
```

---

## 4. Environment Variables

```bash
# Copy the example env file
cp .env.example .env
```

> **Monorepo note:** Next.js loads `.env` from `apps/web/`, not the root. A symlink bridges this:
> ```bash
> ln -s ../../.env apps/web/.env
> ```
> This symlink is git-ignored. You must restart the dev server after creating it.

Now open `.env` and fill in each section:

### 4.1 Database (already works with Docker defaults)

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/techjm
```

### 4.2 Encryption Key

Generate a 64-character hex string (32 bytes) for AES-256-GCM encryption of API keys:

```bash
# Generate the key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output into `.env`:

```env
DB_ENCRYPTION_KEY=<paste-your-64-char-hex-key-here>
```

### 4.3 Redis & Worker (already works with Docker defaults)

```env
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
WORKER_PORT=3100
```

### 4.4 Firebase (see Section 5 below)

### 4.5 AI Provider Keys (see Section 7 below)

### 4.6 Social OAuth (see Section 8 below)

### 4.7 App Config

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

---

## 5. Firebase Setup (Authentication)

Firebase handles user authentication (Google sign-in). You need both **client-side** and **admin** credentials.

### 5.1 Create a Firebase Project

1. Go to https://console.firebase.google.com
2. Click **"Add project"**
3. Name it (e.g., `techjm-dev`)
4. Disable Google Analytics (optional for dev)
5. Click **Create project**

### 5.2 Enable Authentication

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Enable **Google** as a sign-in provider
3. Set a support email
4. Click **Save**

### 5.3 Get Client-Side Config

1. Go to **Project Settings** (gear icon) > **General**
2. Under **Your apps**, click the **Web** icon (`</>`) to add a web app
3. Register the app (name: `techjm-web`)
4. Copy the config values into `.env`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=techjm-dev.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=techjm-dev
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=techjm-dev.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef123456
```

### 5.4 Get Admin Service Account Key

1. Go to **Project Settings** > **Service accounts**
2. Click **"Generate new private key"**
3. Download the JSON file
4. Convert the entire JSON to a single-line string and paste into `.env`:

```bash
# Quick way to convert JSON file to single line:
cat path/to/serviceAccountKey.json | tr -d '\n' | tr -s ' '
```

```env
FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"techjm-dev","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-...@techjm-dev.iam.gserviceaccount.com",...}
```

> **Important:** The entire JSON must be on one line in the `.env` file.

---

## 6. Database Setup (Phase 2)

With Docker running and `.env` configured:

### 6.1 Push Schema to Database

```bash
# Push all Drizzle schemas to PostgreSQL (creates tables)
npm run db:push
```

This creates tables for:
- `users` - User accounts and onboarding state
- `user_niche_profiles` - Niche/industry selection
- `user_ai_keys` - Encrypted API keys (AES-256-GCM)
- `user_model_config` - AI model slot assignments
- `platform_connections` - OAuth tokens for LinkedIn/X
- `recommendation_matrix` - AI model recommendations per niche
- `raw_topics`, `grounding_cache`, `consensus_tiers` - Topic discovery
- `scored_topics`, `scoring_feedback`, `scoring_weights` - Topic scoring
- `generated_posts`, `publish_log`, `post_performance` - Content pipeline

### 6.2 Seed the Recommendation Matrix

```bash
# Navigate to db package and run seed
cd packages/db
npx tsx src/seed.ts
cd ../..
```

This populates the `recommendation_matrix` table with AI model recommendations for 10 niches (SaaS, AI/ML, Marketing, Fintech, E-commerce, Health, Creator, DevOps, Legal, Budget).

### 6.3 (Optional) Open Drizzle Studio

```bash
# Visual database browser at https://local.drizzle.studio
npm run db:studio
```

---

## 7. AI Provider Keys (BYOK) - Phase 3

The app uses a **Bring Your Own Key** (BYOK) model. Users enter their keys in the onboarding wizard (Step 3). For development/testing, you can add keys to `.env`:

```env
# At minimum, add one of these for testing:
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIzaSy...

# Optional providers:
XAI_API_KEY=xai-...
DEEPSEEK_API_KEY=sk-...
REPLICATE_API_KEY=r8_...
```

**Where to get keys:**

| Provider   | URL                                | Models Used                        |
| ---------- | ---------------------------------- | ---------------------------------- |
| OpenAI     | https://platform.openai.com/api-keys | GPT-4o, GPT-4o-mini            |
| Anthropic  | https://console.anthropic.com      | Claude 3.5 Sonnet, Claude 3 Haiku |
| Google     | https://aistudio.google.com/apikey | Gemini 1.5 Pro, Gemini 1.5 Flash  |
| xAI        | https://console.x.ai               | Grok-2, Grok-2-mini              |
| DeepSeek   | https://platform.deepseek.com      | DeepSeek-Chat, DeepSeek-Reasoner  |
| Replicate  | https://replicate.com/account/api-tokens | Flux, SDXL (images)         |

> These keys are encrypted with AES-256-GCM before database storage and never exposed in API responses.

---

## 8. Social OAuth Setup - Phase 4

Phase 4's onboarding wizard (Step 4) connects LinkedIn and X/Twitter accounts via OAuth.

### 8.1 LinkedIn OAuth

1. Go to https://www.linkedin.com/developers/apps
2. Create a new app
3. Under **Auth** tab:
   - Add redirect URL: `http://localhost:3000/api/auth/linkedin/callback`
   - Copy Client ID and Client Secret
4. Under **Products** tab:
   - Request access to **"Share on LinkedIn"** and **"Sign In with LinkedIn using OpenID Connect"**
5. Add to `.env`:

```env
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/auth/linkedin/callback
```

### 8.2 X/Twitter OAuth

1. Go to https://developer.x.com/en/portal/dashboard
2. Create a new project and app
3. Under **User authentication settings**:
   - Enable OAuth 2.0
   - Set callback URL: `http://localhost:3000/api/auth/x/callback`
   - Set website URL: `http://localhost:3000`
4. Copy Client ID and Client Secret
5. Add to `.env`:

```env
X_CLIENT_ID=your_x_client_id
X_CLIENT_SECRET=your_x_client_secret
X_REDIRECT_URI=http://localhost:3000/api/auth/x/callback
```

---

## 9. Run the Project

### 9.1 Full Stack (Recommended)

```bash
# Start everything in parallel via Turborepo
npm run dev
```

This starts:
- **Web app** at http://localhost:3000 (Next.js with Turbopack)
- **Worker** at http://localhost:3100/health (BullMQ discovery pipeline + health checks)

### 9.2 Individual Services

```bash
# Web only
cd apps/web
npm run dev
# -> http://localhost:3000

# Worker only
cd apps/worker
npm run dev
# -> Health check at http://localhost:3100/health
# -> Registers: fallback-grounding, discovery-cron, discovery-llm, discovery-merge,
#    sub-agent, scoring-orchestrator, caption-gen, image-prompt-gen, image-gen, publish
```

### 9.3 Build for Production

```bash
# Build all packages and apps
npm run build

# Start production web server
cd apps/web
npm start

# Start production worker
cd apps/worker
npm start
```

---

## 10. Verify Everything Works

Run through this checklist to confirm your setup is complete:

### 10.1 Infrastructure

```bash
# Docker services healthy
docker compose ps
# All should show "Up" and "healthy"
```

### 10.2 Database

```bash
# Tables exist
npm run db:studio
# Open https://local.drizzle.studio and verify tables are listed
```

### 10.3 Web App

1. Open http://localhost:3000
2. You should see the landing page with glassmorphism design ("The Ethereal Frontier" theme)
3. Click **"Get Started"** or sign-in button
4. Google sign-in should redirect to Firebase auth
5. After sign-in, you should be redirected to the onboarding wizard

### 10.4 Onboarding Flow (Phase 4)

Walk through each step:

| Step | URL                            | What It Does                                      |
| ---- | ------------------------------ | ------------------------------------------------- |
| 1    | `/onboarding/step-1`          | Sign up / Firebase Google auth                    |
| 2    | `/onboarding/step-2`          | Select niche, content pillars, anti-topics         |
| 3    | `/onboarding/step-3`          | Enter AI provider API keys, assign model slots     |
| 4    | `/onboarding/step-4`          | Connect LinkedIn and/or X/Twitter via OAuth        |
| 5    | `/onboarding/step-5`          | Review settings and launch                         |

### 10.5 API Routes

All API routes:

```
# Auth
POST /api/auth/sync              - Sync Firebase user to database
GET  /api/auth/linkedin           - Start LinkedIn OAuth
GET  /api/auth/linkedin/callback  - LinkedIn OAuth callback
GET  /api/auth/x                  - Start X/Twitter OAuth
GET  /api/auth/x/callback         - X/Twitter OAuth callback

# Onboarding (Phase 4)
POST /api/onboarding/niche       - Save niche profile (Step 2)
GET  /api/onboarding/recommendations - Get AI model recommendations
POST /api/onboarding/validate-key - Validate an AI provider key
POST /api/onboarding/ai-keys     - Save encrypted AI keys (Step 3)
GET  /api/onboarding/ai-keys     - Retrieve saved key metadata
POST /api/onboarding/social-complete  - Mark Step 4 complete
POST /api/onboarding/social-disconnect - Remove a platform connection
POST /api/onboarding/select-org   - Select LinkedIn company page
POST /api/onboarding/launch       - Finalize onboarding + queue first discovery (Step 5)
GET  /api/onboarding/socials      - Get connected platforms

# Discovery Pipeline (Phase 5)
POST /api/discovery/trigger       - Manually trigger topic discovery for authenticated user
GET  /api/discovery/status?runId= - Poll discovery run progress (slots completed, topics found)

# Topic Review (Phase 6)
GET  /api/topics                  - List scored topics (params: status, sort, search, limit, offset)
POST /api/topics/:id/approve      - Approve a scored topic (auto-triggers content generation)
POST /api/topics/:id/reject       - Reject a scored topic
PATCH /api/topics/:id             - Edit topic angle/title

# Content Studio (Phase 7)
GET    /api/posts                 - List posts (params: status, platform, sort, limit, offset)
PATCH  /api/posts/:id             - Edit post caption/hashtags
POST   /api/posts/:id/regenerate-image - Re-generate the post image
DELETE /api/posts/:id             - Delete a post

# Publishing Queue (Phase 8)
POST   /api/posts/:id/schedule    - Schedule post with BullMQ delayed job
POST   /api/posts/:id/publish-now - Queue post for immediate publishing
POST   /api/posts/:id/reschedule  - Cancel existing job and reschedule
POST   /api/posts/:id/cancel      - Cancel scheduled post (reverts to review)
POST   /api/posts/:id/retry       - Retry a failed post (resets retry count)
GET    /api/queue                 - List posts by queue status (upcoming/publishing/published/failed)
GET    /api/queue/stats           - Queue summary (scheduled today/week, published, failed count)

# Analytics (Phase 9)
GET    /api/analytics              - Summary stats, timeline, per-post engagement
GET    /api/analytics/insights     - Data-driven performance insights
GET    /api/analytics/learning     - Feedback loop learning state (Phase 10)

# Settings (Phase 11)
GET    /api/settings/niche         - Get niche profile
PATCH  /api/settings/niche         - Update niche profile (optional weight reset)
GET    /api/settings/ai-keys       - List AI keys (provider + capabilities, no raw key)
PATCH  /api/settings/ai-keys       - Add/remove/revalidate AI provider key
GET    /api/settings/model-config   - Get model slot assignments
PATCH  /api/settings/model-config   - Update model slot assignments
GET    /api/settings/notifications  - Get notification preferences
PATCH  /api/settings/notifications  - Update toggles, digest time, timezone
POST   /api/settings/social/disconnect     - Disconnect a social platform
POST   /api/settings/telegram/generate-code - Generate 6-digit Telegram link code
POST   /api/settings/telegram/test         - Send test Telegram notification
POST   /api/settings/telegram/disconnect   - Unlink Telegram
GET    /api/settings/health-summary        - Sidebar health indicator (hasIssues, expiringSoon)
DELETE /api/settings/account               - Delete account (cascading) + Firebase user
POST   /api/settings/account/export        - Export all user data as JSON download
GET    /api/connections                    - List user's platform connections

# Telegram Webhook (Phase 11 — public endpoint, no auth)
POST   /api/webhooks/telegram      - Telegram bot commands (/link, /status, /stop, /start)
```

### 10.6 Worker

```bash
# Health check endpoint (should return JSON with queue stats)
curl http://localhost:3100/health
# Expected: {"status":"ok","uptime":123,"queues":{...}}

# Worker logs should show on startup:
# Worker started. Health: http://localhost:3100/health
# Workers registered:
#   - health-check (every 5 minutes)
#   - fallback-grounding (cron: 5:55 AM)
#   - discovery-cron (cron: 6:00 AM)
#   - discovery-llm (parallel, concurrency: 8)
#   - discovery-merge (after LLM jobs complete)
#   - sub-agent (parallel, concurrency: 14, rate: 40/min)
#   - scoring-orchestrator (after 7 sub-agents complete)
#   - caption-gen (concurrency: 4, triggered on topic approval)
#   - image-prompt-gen (concurrency: 4, after caption-gen)
#   - image-gen (concurrency: 2, after image-prompt-gen)
#   - publish (concurrency: 4, rate: 10/min, delayed jobs)
#   - engagement-check (concurrency: 6, rate: 15/min, checkpoints: 2h/6h/24h/48h)
#   - feedback-loop (concurrency: 2, triggers after 48h checkpoint)
#   - daily-digest (cron: 8 AM UTC)
#   - weekly-report (cron: Monday 9 AM UTC)
#   - connection-health (cron: 5:30 AM daily)
#   - token-refresh (cron: Sunday 3 AM weekly)
```

### 10.7 Discovery Pipeline (Phase 5)

To manually test the full discovery pipeline:

```bash
# 1. Complete onboarding with at least 1 AI provider key configured
# 2. Trigger discovery manually:
curl -X POST http://localhost:3000/api/discovery/trigger \
  -H "Authorization: Bearer <firebase_token>" \
  -H "Content-Type: application/json"
# Returns: {"success":true,"discoveryRunId":"<uuid>","slotsQueued":4}

# 3. Poll for status:
curl "http://localhost:3000/api/discovery/status?runId=<uuid>" \
  -H "Authorization: Bearer <firebase_token>"
# Returns: {"status":"running"|"complete","slotsCompleted":N,...}

# 4. Check worker logs — should show:
# Starting discovery: user=X, slot=slot_a, provider=openai, model=gpt-5.4-mini
# Adapter returned N topics
# Saved N topics to raw_topics
# Starting merge for user=X, run=<uuid>
# Dedup: 25 raw → 14 unique clusters
# Top 1: [strong] "Some trending topic" (slot_a, slot_c)

# 5. Verify in database:
npm run db:studio
# Open raw_topics table — should show topics with consensus_tier and source_urls
```

### 10.8 Sub-Agent Scoring Pipeline (Phase 6)

After discovery completes, the merge job automatically triggers scoring for each surviving topic:

```bash
# 1. Trigger discovery (same as 10.7) — scoring starts automatically after merge

# 2. Check worker logs — should show after merge completes:
# Queueing sub-agent scoring for 14 topics
# Queued 14 orchestrator flows (98 sub-agent jobs) using anthropic/claude-haiku-4-5-20251001
# Sub-agent sentiment: topic=<uuid>, provider=anthropic
# Sub-agent audience_fit complete: {"audienceFitScore":"8.5",...}
# Orchestrator: computing final score for scored_topic=<uuid>
# Score breakdown: sentiment=7.5, audience=8.5, seo=7.0, gap=9.0, cmf=8.0, engagement=6.5
# Final score: 7.625 x 1.25 x 1.75 = 16.680

# 3. Verify in database:
npm run db:studio
# Open scored_topics table — should show:
#   - final_score populated (numeric)
#   - All 7 sub-agent score columns filled
#   - sub_agent_outputs JSONB has all 7 agent raw outputs
#   - status = 'pending' (ready for review)
#   - consensus_multiplier matches raw_topics tier

# 4. Topic Review Dashboard:
# Open http://localhost:3000/dashboard/topics
# Should show scored topics sorted by score
# Click a topic card → Details expands showing all 7 sub-agent analyses
# Approve/Reject buttons change topic status
# Edit Angle button allows inline editing
```

### 10.9 Content Generation Pipeline (Phase 7)

After scoring completes and topics appear in the review dashboard:

```bash
# 1. Approve a topic in the dashboard:
# Open http://localhost:3000/dashboard/topics
# Click "Approve" on a scored topic
# The approval response includes: {"success":true,"status":"approved","message":"Content generation started","platforms":["linkedin","x"]}

# 2. Check worker logs — should show sequential chain:
# [caption-gen] Caption gen: topic=<uuid>, platforms=linkedin,x
# [caption-gen] Generating linkedin caption with anthropic/claude-sonnet-4-6-20250514
# [caption-gen] Created linkedin post: <uuid> (The hook line that stops...)
# [caption-gen] Generating x caption with anthropic/claude-sonnet-4-6-20250514
# [caption-gen] Created x post: <uuid> (Hot take: ...)
# [image-prompt-gen] Image prompt gen: topic=<uuid>
# [image-prompt-gen] Image prompt: "A clean, modern geometric..."
# [image-gen] Image gen: provider=replicate, model=black-forest-labs/flux-2-pro, posts=2
# [image-gen] Image generated: https://replicate.delivery/...
# [image-gen] Updated 2 posts with image URLs. Status: review

# 3. Verify in database:
npm run db:studio
# Open posts table — should show:
#   - 2 rows per approved topic (linkedin + x)
#   - caption filled with platform-specific content
#   - hashtags JSONB array populated
#   - image_prompt filled
#   - image_url pointing to generated image
#   - image_urls JSONB with platform variants (linkedin, x, square)
#   - status = 'review'

# 4. Content Studio Dashboard:
# Open http://localhost:3000/dashboard/content
# Should show posts grouped by topic
# LinkedIn + X versions side-by-side
# Image preview with Regenerate button
# Click "Edit Caption" → modify text → Save
# Click "Schedule" → pick date/time → Confirm
# Click "Show Platform Preview" → LinkedIn/X feed mockup
```

**Graceful degradation scenarios:**
- If no image provider key → posts created as text-only with `status: 'review'`
- If Cloudinary not configured → uses direct image URLs from provider
- If image generation fails after retries → posts still marked as review (text-only)

### 10.10 Publishing Pipeline (Phase 8)

After content is generated and posts are in `review` status:

```bash
# 1. Schedule a post from the Content Studio or via API:
curl -X POST http://localhost:3000/api/posts/<post-id>/schedule \
  -H "Authorization: Bearer <firebase_token>" \
  -H "Content-Type: application/json" \
  -d '{"scheduledAt":"2026-03-27T09:00:00.000Z"}'
# Returns: {"success":true,"scheduledAt":"...","jobId":"publish-<id>","delay":"123 minutes"}

# 2. Verify BullMQ delayed job exists:
docker compose exec redis redis-cli ZRANGE "bull:publish:delayed" 0 -1
# Should show the job ID

# 3. Check worker logs when the scheduled time arrives:
# Publishing: post=<uuid>, platform=linkedin, attempt=1/4
# Postiz failed: Postiz unreachable. Trying direct API...
# Published via direct API: externalId=urn:li:share:123456
# Published successfully: linkedin post urn:li:share:123456

# 4. Verify publish audit log:
# Open Drizzle Studio → publish_log table
# Should show attempt with success=true, external_id, retry_count=0

# 5. Queue Dashboard:
# Open http://localhost:3000/dashboard/queue
# Upcoming tab → shows scheduled posts with countdown
# Published tab → shows published posts with "View on LinkedIn →" link
# Failed tab → shows failed posts with Retry button

# 6. Test reschedule:
curl -X POST http://localhost:3000/api/posts/<post-id>/reschedule \
  -H "Authorization: Bearer <firebase_token>" \
  -H "Content-Type: application/json" \
  -d '{"scheduledAt":"2026-03-28T14:00:00.000Z"}'

# 7. Test cancel:
curl -X POST http://localhost:3000/api/posts/<post-id>/cancel \
  -H "Authorization: Bearer <firebase_token>"
# Post reverts to review status, BullMQ job removed
```

**Graceful degradation scenarios:**
- If Postiz is down/unconfigured → direct LinkedIn/X API publishing is attempted
- If both Postiz and direct API fail → retries 3 times with exponential backoff (1m, 5m, 15m)
- If all retries exhausted → post marked as `failed`, visible in Queue dashboard for manual retry
- If platform connection missing → immediate failure logged, no retries

### 10.11 Monitoring

Open http://localhost:3001 for Uptime Kuma monitoring dashboard (set up admin on first visit).

---

## 11. Project Structure

```
grow-social-mvp/
├── apps/
│   ├── web/                          # Next.js 15 frontend (port 3000)
│   │   ├── app/
│   │   │   ├── (authenticated)/      # Auth-protected routes
│   │   │   │   ├── dashboard/        # Main dashboard
│   │   │   │   │   ├── topics/       # Topic review dashboard (Phase 6)
│   │   │   │   │   ├── content/      # Content Studio dashboard (Phase 7)
│   │   │   │   │   ├── queue/        # Publishing Queue dashboard (Phase 8)
│   │   │   │   │   └── analytics/    # Analytics dashboard (Phase 9)
│   │   │   │   └── settings/         # Settings page — 5-tab (Phase 11)
│   │   │   ├── api/                  # API routes
│   │   │   │   ├── auth/             # Firebase + OAuth endpoints
│   │   │   │   ├── analytics/        # Analytics + insights + learning (Phase 9-10)
│   │   │   │   ├── connections/      # List platform connections
│   │   │   │   ├── discovery/        # Discovery pipeline endpoints
│   │   │   │   │   ├── trigger/      # POST - manual discovery trigger
│   │   │   │   │   └── status/       # GET - poll discovery run progress
│   │   │   │   ├── topics/           # Topic review endpoints (Phase 6)
│   │   │   │   │   ├── route.ts      # GET - list scored topics
│   │   │   │   │   └── [id]/         # Topic-specific actions
│   │   │   │   │       ├── route.ts  # PATCH - edit angle/title
│   │   │   │   │       ├── approve/  # POST - approve topic + trigger content gen
│   │   │   │   │       └── reject/   # POST - reject topic
│   │   │   │   ├── posts/            # Content API endpoints (Phase 7)
│   │   │   │   │   ├── route.ts      # GET - list posts
│   │   │   │   │   └── [id]/         # Post-specific actions
│   │   │   │   │       ├── route.ts  # PATCH/DELETE - edit/delete post
│   │   │   │   │       ├── schedule/ # POST - schedule with BullMQ delayed job
│   │   │   │   │       ├── publish-now/     # POST - publish immediately (delay=0)
│   │   │   │   │       ├── reschedule/      # POST - cancel + reschedule
│   │   │   │   │       ├── cancel/          # POST - cancel scheduled post
│   │   │   │   │       ├── retry/           # POST - retry failed post
│   │   │   │   │       └── regenerate-image/ # POST - regenerate image
│   │   │   │   ├── queue/            # Publishing Queue endpoints (Phase 8)
│   │   │   │   │   ├── route.ts      # GET - list posts by queue status
│   │   │   │   │   └── stats/        # GET - queue summary stats
│   │   │   │   ├── settings/         # Settings endpoints (Phase 11)
│   │   │   │   │   ├── niche/        # GET/PATCH - niche config
│   │   │   │   │   ├── ai-keys/      # GET/PATCH - AI key management
│   │   │   │   │   ├── model-config/ # GET/PATCH - model slot assignments
│   │   │   │   │   ├── notifications/# GET/PATCH - notification toggles
│   │   │   │   │   ├── social/       # Disconnect platform
│   │   │   │   │   ├── telegram/     # Generate code, test, disconnect
│   │   │   │   │   ├── health-summary/ # Sidebar health indicator
│   │   │   │   │   └── account/      # DELETE + export
│   │   │   │   ├── webhooks/         # External webhooks
│   │   │   │   │   └── telegram/     # Telegram bot commands (public)
│   │   │   │   └── onboarding/       # Onboarding data endpoints
│   │   │   ├── components/           # Shared UI components
│   │   │   │   ├── glass-card.tsx    # Glassmorphism card component
│   │   │   │   └── onboarding/       # Onboarding-specific components
│   │   │   ├── onboarding/           # 5-step onboarding wizard
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx          # Onboarding entry
│   │   │   │   ├── step-1/           # Auth/signup
│   │   │   │   ├── step-2/           # Niche selection
│   │   │   │   ├── step-3/           # AI keys
│   │   │   │   ├── step-4/           # Social connections
│   │   │   │   └── step-5/           # Review & launch
│   │   │   ├── globals.css           # Tailwind + design system tokens
│   │   │   ├── layout.tsx            # Root layout
│   │   │   └── page.tsx              # Landing page
│   │   ├── hooks/                    # Custom React hooks
│   │   │   └── use-auth.ts           # Firebase auth hook
│   │   ├── lib/                      # Utility libraries
│   │   │   ├── firebase.ts           # Client-side Firebase (lazy init)
│   │   │   ├── firebase-admin.ts     # Server-side Firebase Admin (lazy init)
│   │   │   ├── auth-helpers.ts       # Token verification helpers
│   │   │   └── queue-client.ts       # BullMQ client for enqueueing jobs
│   │   ├── providers/                # React context providers
│   │   │   └── auth-provider.tsx     # Firebase auth context
│   │   ├── stores/                   # Zustand state stores
│   │   │   └── onboarding-store.ts   # 5-step wizard state
│   │   ├── next.config.ts
│   │   ├── postcss.config.mjs
│   │   └── tsconfig.json
│   │
│   └── worker/                       # BullMQ job processor (port 3100)
│       └── src/
│           ├── index.ts              # Worker entry, cron scheduling, health server
│           ├── queues.ts             # Queue definitions + job data types
│           ├── redis.ts              # Redis connection config
│           ├── notifications/        # Phase 11: Telegram notification helpers
│           │   ├── telegram.ts       # Bot singleton + 6 message formatters
│           │   └── publish-notify.ts # Publish result notification dispatcher
│           └── jobs/
│               ├── fallback/
│               │   └── grounding.job.ts  # 5:55 AM - scrape HN/Reddit/RSS for grounding
│               ├── discovery/
│               │   ├── cron.job.ts    # 6:00 AM - fan-out LLM jobs per user
│               │   ├── llm.job.ts     # Core: call AI adapter, save raw_topics
│               │   └── merge.job.ts   # Fuzzy dedup + consensus merge → triggers scoring
│               ├── sub-agents/        # Phase 6: 7-sub-agent scoring pipeline
│               │   ├── sub-agent.job.ts     # Runs individual sub-agent LLM analysis
│               │   ├── orchestrator.job.ts  # Aggregates 7 scores into final composite
│               │   ├── model-selector.ts    # Picks cheapest model from user's providers
│               │   └── prompts/             # MBA framework prompt templates
│               │       ├── sentiment.ts          # Brand Sentiment Mapping
│               │       ├── audience-fit.ts       # TAM/SAM Segmentation
│               │       ├── seo.ts                # Search Demand Analysis
│               │       ├── competitor-gap.ts     # Porter's Competitive Analysis
│               │       ├── content-market-fit.ts # BCG Matrix
│               │       ├── engagement-predictor.ts # Historical Regression
│               │       └── pillar-balancer.ts    # Modern Portfolio Theory
│               ├── content/           # Phase 7: Caption & Image Generation
│               │   ├── caption-gen.job.ts    # Generate platform-specific captions
│               │   ├── image-prompt-gen.job.ts # Generate image prompt from caption
│               │   └── image-gen.job.ts      # Generate image + Cloudinary upload
│               ├── publish/           # Phase 8: Publishing Pipeline
│               │   ├── publish.job.ts       # Main publish processor (Postiz + direct fallback)
│               │   ├── postiz-client.ts     # Postiz API integration
│               │   ├── direct-publisher.ts  # Direct LinkedIn/X API publishing
│               │   └── log.ts              # Publish audit log helper
│               ├── engagement/        # Phase 9: Engagement Tracking
│               │   ├── engagement-check.job.ts  # 4-checkpoint engagement processor
│               │   ├── linkedin-metrics.ts      # LinkedIn API metrics fetcher
│               │   └── x-metrics.ts             # X API v2 metrics fetcher
│               ├── feedback/          # Phase 10: Adaptive Feedback Loop
│               │   ├── feedback-loop.job.ts     # Main feedback orchestrator
│               │   ├── weight-adjuster.ts       # Pearson correlation weight update
│               │   ├── caption-learner.ts       # Hook/CTA/length pattern learning
│               │   └── time-optimizer.ts        # Optimal posting time computation
│               ├── notifications/     # Phase 11: Telegram Notifications
│               │   ├── daily-digest.job.ts      # Daily topic digest (8 AM UTC)
│               │   └── weekly-report.job.ts     # Weekly performance report (Mon 9 AM)
│               └── health/            # Phase 11: Connection Health Monitoring
│                   ├── connection-health.job.ts  # Daily health check (5:30 AM)
│                   └── token-refresh.job.ts      # Weekly token refresh (Sun 3 AM)
│
├── packages/
│   ├── db/                           # Database package (Drizzle ORM)
│   │   ├── src/
│   │   │   ├── schema/               # All database table schemas
│   │   │   │   ├── index.ts          # Barrel export
│   │   │   │   ├── auth.ts           # users table
│   │   │   │   ├── niche.ts          # user_niche_profiles
│   │   │   │   ├── ai-keys.ts        # user_ai_keys, user_model_config
│   │   │   │   ├── connections.ts    # platform_connections
│   │   │   │   ├── recommendations.ts # recommendation_matrix
│   │   │   │   ├── topics.ts         # raw_topics, grounding, consensus
│   │   │   │   ├── scoring.ts        # scored_topics, feedback, weights
│   │   │   │   ├── posts.ts          # generated_posts, publish_log, topic_performance
│   │   │   │   └── notifications.ts  # notification_preferences (Phase 11)
│   │   │   ├── index.ts              # DB client + schema exports
│   │   │   ├── encryption.ts         # AES-256-GCM encrypt/decrypt
│   │   │   └── seed.ts               # Recommendation matrix seed data
│   │   └── drizzle.config.ts         # Drizzle Kit config
│   │
│   ├── shared/                       # Shared types & utilities
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types.ts              # Shared TypeScript types
│   │       ├── constants.ts          # App constants
│   │       └── env.ts                # Environment validation
│   │
│   └── ai-adapters/                  # AI provider integrations
│       └── src/
│           ├── index.ts              # Barrel export
│           ├── types.ts              # AIAdapter interface
│           ├── factory.ts            # AdapterFactory (provider selection)
│           ├── utils.ts              # JSON parsing, error handling
│           ├── providers/            # Provider implementations
│           │   └── openai.ts         # OpenAI adapter
│           ├── prompts/              # Prompt engineering templates
│           │   ├── discovery.ts      # Topic discovery prompts
│           │   ├── sub-agent.ts      # 7-sub-agent analysis prompts
│           │   └── caption.ts        # Caption + image prompt generation
│           └── fallback/             # Fallback/grounding chain
│
├── .env.example                      # Environment variable template
├── .env                              # Local environment (git-ignored)
├── docker/
│   └── init-db.sql                   # Creates Postiz database on first init
├── docker-compose.yml                # PostgreSQL, Redis, Caddy, Postiz, Uptime Kuma
├── Caddyfile                         # Reverse proxy config
├── turbo.json                        # Turborepo build pipeline
├── tsconfig.json                     # Root TypeScript config
├── eslint.config.mjs                 # ESLint config
├── .prettierrc                       # Prettier formatting rules
└── package.json                      # Root monorepo config (npm workspaces)
```

---

## 12. Available Scripts

### Root Level (run from project root)

| Command             | Description                                      |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Start all apps in parallel (web + worker)        |
| `npm run build`     | Build all packages and apps                      |
| `npm run lint`      | Lint entire monorepo                             |
| `npm run db:push`   | Push Drizzle schema to PostgreSQL                |
| `npm run db:studio` | Open Drizzle Studio (visual DB browser)          |
| `npm run format`    | Format all files with Prettier                   |

### Web App (`apps/web`)

| Command          | Description                           |
| ---------------- | ------------------------------------- |
| `npm run dev`    | Start Next.js dev server (Turbopack)  |
| `npm run build`  | Production build                      |
| `npm start`      | Start production server               |
| `npm run lint`   | Lint web app                          |

### Worker (`apps/worker`)

| Command          | Description                           |
| ---------------- | ------------------------------------- |
| `npm run dev`    | Watch mode (tsx)                      |
| `npm run build`  | Compile TypeScript to `dist/`         |
| `npm start`      | Run compiled worker                   |

### DB Package (`packages/db`)

| Command              | Description                                |
| -------------------- | ------------------------------------------ |
| `npm run db:push`    | Push schema to database                    |
| `npm run db:studio`  | Open Drizzle Studio                        |
| `npm run db:generate`| Generate migration files                   |
| `npm run db:seed`    | Seed recommendation matrix                 |
| `npm run build`      | Compile TypeScript                         |

### AI Adapters (`packages/ai-adapters`)

| Command              | Description                                |
| -------------------- | ------------------------------------------ |
| `npm run test`       | Run tests (Vitest)                         |
| `npm run test:watch` | Run tests in watch mode                    |
| `npm run build`      | Compile TypeScript                         |

---

## 13. Phase-by-Phase Breakdown

### Phase 1: Infrastructure Skeleton

**What was built:**
- Turborepo monorepo with npm workspaces
- Next.js 15 web app with Tailwind CSS v4
- BullMQ worker with Redis connection
- Docker Compose services (Postgres, Redis, Caddy, Uptime Kuma)
- Shared packages (`db`, `shared`, `ai-adapters`)
- ESLint + Prettier configuration
- "The Ethereal Frontier" glassmorphism design system

**Key files:**
- `package.json`, `turbo.json`, `docker-compose.yml`
- `apps/web/app/globals.css` (design tokens)
- `apps/worker/src/index.ts` (health check worker)

---

### Phase 2: Database Schema + Firebase Auth + Encryption

**What was built:**
- 11 database tables via Drizzle ORM schemas
- Firebase Authentication (Google sign-in)
- AES-256-GCM encryption for API keys at rest
- Auth sync API route (`/api/auth/sync`)
- Server-side token verification with Firebase Admin
- Database seed script for recommendation matrix

**Key files:**
- `packages/db/src/schema/*.ts` (all table definitions)
- `packages/db/src/encryption.ts` (encrypt/decrypt utilities)
- `apps/web/lib/firebase.ts` (client auth)
- `apps/web/lib/firebase-admin.ts` (server auth)
- `apps/web/app/api/auth/sync/route.ts`

---

### Phase 3: AI Adapters Package

**What was built:**
- `AIAdapter` TypeScript interface for all providers
- OpenAI provider implementation (full interface)
- AdapterFactory for provider selection and fallback
- Prompt engineering templates:
  - Topic discovery prompts
  - 7-sub-agent analysis system
  - Caption and image prompt generation
- JSON parsing utilities and error handling
- Vitest test setup

**Key files:**
- `packages/ai-adapters/src/types.ts` (interface)
- `packages/ai-adapters/src/providers/openai.ts`
- `packages/ai-adapters/src/factory.ts`
- `packages/ai-adapters/src/prompts/*.ts`

---

### Phase 4: Onboarding Wizard (5-Step)

**What was built:**
- 5-step onboarding wizard with Zustand state management
- Step 1: Firebase Google sign-in
- Step 2: Niche selection, content pillars, anti-topics
- Step 3: AI API key entry, validation, model slot assignment
- Step 4: LinkedIn and X/Twitter OAuth connection
- Step 5: Review configuration and launch
- 7 onboarding API routes for data persistence
- 4 OAuth API routes (LinkedIn + X/Twitter init + callback)
- Reusable UI components (ProgressBar, ChipSelect, TagInput, ProviderKeyInput, ModelSlotSelector)

**Key files:**
- `apps/web/app/onboarding/step-[1-5]/page.tsx`
- `apps/web/stores/onboarding-store.ts`
- `apps/web/app/api/onboarding/*.ts`
- `apps/web/app/api/auth/linkedin/*.ts`
- `apps/web/app/api/auth/x/*.ts`
- `apps/web/app/components/onboarding/*.tsx`

---

### Phase 5: 4-LLM Topic Discovery Pipeline

**What was built:**
- Full BullMQ worker with 5 queue processors and HTTP health endpoint (port 3100)
- **Fallback grounding cron** (5:55 AM): scrapes HackerNews, Reddit, RSS, ProductHunt, DevTo for trending content; caches results for 6 hours in `fallback_grounding_cache` table
- **Discovery cron** (6:00 AM): queries all users with `onboarding_step = 'complete'`, creates BullMQ FlowProducer dependency tree (4 parallel LLM children → 1 merge parent) per user
- **Discovery LLM job**: loads user niche context, decrypts API key, determines web search capability, injects fallback grounding data for non-web providers (DeepSeek, Mistral, Replicate), calls `adapter.discoverTopics()`, saves results to `raw_topics`
- **Discovery merge job**: fuzzy deduplication using string-similarity (threshold ≥0.65, weighted 70% title + 30% angle), cross-references source URLs, assigns 4-tier consensus (definitive/strong/confirmed/experimental), deletes duplicate rows
- **Manual trigger API** (`POST /api/discovery/trigger`): for onboarding "Launch" button and testing; triggers fallback grounding if needed, then queues full LLM flow
- **Status polling API** (`GET /api/discovery/status?runId=`): returns slots completed, topics found, merge status, top topics preview
- **Launch route integration**: onboarding launch now automatically queues first discovery run
- Graceful shutdown (SIGTERM/SIGINT) for all workers

**Key files:**
- `apps/worker/src/index.ts` (worker entry + health server)
- `apps/worker/src/queues.ts` (queue definitions + types)
- `apps/worker/src/redis.ts` (connection config)
- `apps/worker/src/jobs/fallback/grounding.job.ts`
- `apps/worker/src/jobs/discovery/cron.job.ts`
- `apps/worker/src/jobs/discovery/llm.job.ts`
- `apps/worker/src/jobs/discovery/merge.job.ts`
- `apps/web/app/api/discovery/trigger/route.ts`
- `apps/web/app/api/discovery/status/route.ts`
- `apps/web/lib/queue-client.ts`

### Phase 6: 7 Sub-Agent Scoring Pipeline + Topic Review Dashboard

**What was built:**
- 7 specialized sub-agent BullMQ jobs that run in parallel on each discovered topic, each applying a focused MBA analysis framework:
  - **Sentiment** (Brand Sentiment Mapping): polarity -1..1, emotional charge, risk assessment
  - **Audience Fit** (TAM/SAM Segmentation): relevance 1-10, persona matching, scroll-stop power
  - **SEO** (Search Demand Analysis): discoverability 1-10, hashtags, keywords, trending signal
  - **Competitor Gap** (Porter's Analysis): gap 1-10, saturation level, differentiation angle
  - **Content-Market Fit** (BCG Matrix): fit 1-10, CTA suggestion, authority signal
  - **Engagement Predictor** (Historical Regression): predicted likes/comments, virality potential
  - **Pillar Balancer** (Portfolio Theory): content diversification boost 0.5-2.0x
- **Scoring Orchestrator**: after all 7 sub-agents complete, computes weighted composite score using configurable weights (sentiment 15%, audience 20%, SEO 15%, competitor gap 15%, CMF 20%, engagement 15%), then applies pillar boost and consensus multiplier
- **Model Auto-Selector**: picks cheapest available model from user's connected providers for sub-agent work (Haiku > GPT-5.4-nano > Gemini Flash > DeepSeek > Mistral)
- **Auto-trigger**: discovery merge job now automatically queues scoring for all surviving topics using BullMQ FlowProducer (7 children → 1 orchestrator parent per topic)
- **Topic Review Dashboard** (`/dashboard/topics`): lists scored topics with status tabs (Pending/Approved/Rejected/All), sort by score/newest/consensus, search, expandable sub-agent detail panels, inline angle editing, approve/reject actions
- **Topic Review API routes**: GET list, POST approve, POST reject, PATCH edit with Zod validation
- Updated dashboard with live topic stats and Topic Review link

**Key files:**
- `apps/worker/src/jobs/sub-agents/sub-agent.job.ts` (sub-agent processor)
- `apps/worker/src/jobs/sub-agents/orchestrator.job.ts` (score aggregation)
- `apps/worker/src/jobs/sub-agents/model-selector.ts` (auto-select cheapest model)
- `apps/worker/src/jobs/sub-agents/prompts/*.ts` (7 prompt templates)
- `apps/worker/src/jobs/discovery/merge.job.ts` (updated: auto-triggers scoring)
- `apps/web/app/api/topics/route.ts` (GET scored topics)
- `apps/web/app/api/topics/[id]/approve/route.ts`
- `apps/web/app/api/topics/[id]/reject/route.ts`
- `apps/web/app/api/topics/[id]/route.ts` (PATCH edit)
- `apps/web/app/(authenticated)/dashboard/topics/page.tsx` (review dashboard)

### Phase 7: Caption & Image Generation + Content Studio

**What was built:**
- **3-job content generation pipeline** triggered automatically when a topic is approved:
  1. **caption-gen** (concurrency: 4): generates platform-specific captions (LinkedIn long-form 150-250 words + X punchy <240 chars) using the user's caption model. Injects all 7 sub-agent outputs as context (SEO keywords/hashtags, audience personas, CTA suggestions, competitor angles, learned patterns). Creates post rows in the `posts` table with `status: 'generating'`.
  2. **image-prompt-gen** (concurrency: 4): takes the LinkedIn caption + brand kit to generate an optimized image generation prompt via the caption model. Stores prompt on post rows. Auto-selects image provider from user's keys (Replicate Flux > OpenAI gpt-image-1). Gracefully degrades to text-only posts if no image provider available.
  3. **image-gen** (concurrency: 2): generates the actual image via the adapter, optionally uploads to Cloudinary with platform-specific variants (LinkedIn 1200x627, X 1600x900, Square 1080x1080). Updates all post rows to `status: 'review'`. On failure after retries, marks posts as review (text-only).
- **Topic approval auto-trigger**: `POST /api/topics/:id/approve` now detects connected platforms and queues the caption-gen job, starting the sequential chain
- **Model auto-selector** updated with `image` task priority (Replicate > OpenAI)
- **6 Content API routes**: list posts with filtering/pagination, edit caption/hashtags with X 280-char validation, schedule with future date validation, publish-now (Phase 8 placeholder), regenerate image, delete
- **Content Studio dashboard** (`/dashboard/content`): status filter tabs (Ready for Review/Scheduled/Generating/All), post cards grouped by topic showing LinkedIn + X versions side-by-side, image preview with regenerate button, inline caption editing with word/char count, schedule picker with date + 15-minute time increments, publish now with confirmation, delete with confirmation, platform preview mockups (LinkedIn feed post and X/Twitter tweet simulation), auto-polling for generating status updates
- **Dashboard home** updated with content stats (posts ready for review, scheduled) and active Content Studio link
- **Sidebar + mobile nav** updated with Content link to `/dashboard/content`

**Key files:**
- `apps/worker/src/jobs/content/caption-gen.job.ts` (caption generation)
- `apps/worker/src/jobs/content/image-prompt-gen.job.ts` (image prompt generation)
- `apps/worker/src/jobs/content/image-gen.job.ts` (image generation + Cloudinary)
- `apps/worker/src/queues.ts` (3 new queues + job data types)
- `apps/worker/src/index.ts` (3 new workers registered)
- `apps/web/app/api/topics/[id]/approve/route.ts` (updated: triggers content pipeline)
- `apps/web/app/api/posts/route.ts` (GET list posts)
- `apps/web/app/api/posts/[id]/route.ts` (PATCH edit, DELETE)
- `apps/web/app/api/posts/[id]/schedule/route.ts`
- `apps/web/app/api/posts/[id]/publish-now/route.ts`
- `apps/web/app/api/posts/[id]/regenerate-image/route.ts`
- `apps/web/app/(authenticated)/dashboard/content/page.tsx` (Content Studio)
- `apps/web/lib/queue-client.ts` (updated: caption + image queues)

**Environment variables (optional):**
```env
# Cloudinary (optional — image gen works without it, uses direct URLs)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Phase 8: Publishing Pipeline + Queue Dashboard

**What was built:**
- **Postiz Docker integration**: Postiz container added to `docker-compose.yml` with its own PostgreSQL database (auto-created via `docker/init-db.sql`). Publishing tries Postiz first, falls back to direct API if Postiz is unavailable or unconfigured.
- **Direct API publishing** (fallback): LinkedIn REST API v2 (image upload + post creation with `x-restli-id` response parsing) and X/Twitter API v2 (media upload via base64 + tweet creation). Graceful degradation to text-only if media upload fails.
- **BullMQ delayed jobs**: scheduling a post creates a delayed BullMQ job that fires at the exact `scheduledAt` timestamp. Job ID is deterministic (`publish-${postId}`) for cancel/reschedule support.
- **Retry logic with exponential backoff**: failed publishes retry up to 3 times (1 min → 5 min → 15 min). After exhausting retries, post status is set to `failed`. Manual retry resets the count.
- **Publish audit log**: every publish attempt (success or failure) is logged to the `publish_log` table with platform, external ID, error message, and retry count.
- **Rate limiting**: publish worker limited to 10 jobs/minute with concurrency 4, preventing API rate limit violations.
- **6 API routes**: schedule (creates delayed job), publish-now (delay=0), reschedule (removes old job + creates new), cancel (removes job + reverts to review), retry (re-queues failed), queue listing + stats.
- **Queue Management Dashboard** (`/dashboard/queue`): tabbed view (Upcoming/Publishing/Published/Failed), summary stats (scheduled today/week, published this week, failed count), post cards with platform badges and time displays, inline reschedule picker, publish-now/cancel/retry actions, auto-refresh on publishing tab (5s), external link to published posts on LinkedIn/X.
- **Dashboard home** updated with Publishing Queue section link and failed count alert.
- **Sidebar + mobile nav** updated with active Queue link.

**Key files:**
- `apps/worker/src/jobs/publish/publish.job.ts` (main publish processor)
- `apps/worker/src/jobs/publish/postiz-client.ts` (Postiz API)
- `apps/worker/src/jobs/publish/direct-publisher.ts` (LinkedIn + X direct)
- `apps/worker/src/jobs/publish/log.ts` (audit log helper)
- `apps/worker/src/queues.ts` (publish queue + PublishJobData)
- `apps/worker/src/index.ts` (publish worker registered)
- `apps/web/app/api/posts/[id]/schedule/route.ts` (BullMQ delayed job)
- `apps/web/app/api/posts/[id]/publish-now/route.ts` (immediate publish)
- `apps/web/app/api/posts/[id]/reschedule/route.ts` (cancel + reschedule)
- `apps/web/app/api/posts/[id]/cancel/route.ts` (cancel scheduled)
- `apps/web/app/api/posts/[id]/retry/route.ts` (retry failed)
- `apps/web/app/api/queue/route.ts` (queue listing)
- `apps/web/app/api/queue/stats/route.ts` (queue summary)
- `apps/web/app/(authenticated)/dashboard/queue/page.tsx` (queue dashboard)
- `apps/web/lib/queue-client.ts` (publish queue instance)
- `docker-compose.yml` (Postiz container)
- `docker/init-db.sql` (Postiz database init)

**Environment variables:**
```env
# Postiz (optional — falls back to direct API if not configured)
POSTIZ_API_URL=http://localhost:5000
POSTIZ_API_KEY=your_postiz_api_key
```

### Phase 9: Engagement Tracking + Analytics Dashboard

**What was built:**
- **4-checkpoint engagement tracking**: After every successful publish, 4 delayed BullMQ jobs are automatically queued at T+2h, T+6h, T+24h, T+48h. Each job polls the platform API for real engagement metrics (impressions, likes, comments, shares).
- **LinkedIn metrics fetcher**: Calls LinkedIn REST API `/rest/socialMetadata` (with `/v2/socialActions` fallback) for likes/comments/shares, and `/rest/organizationalEntityShareStatistics` for org post impressions. Personal posts use an estimated impressions heuristic (likes × 30).
- **X metrics fetcher**: Calls X API v2 `/tweets/{id}` with `public_metrics`, `non_public_metrics`, and `organic_metrics` fields. Combines retweets + quote tweets as total shares.
- **Engagement score formula**: `likes(0.2) + comments(0.4) + shares(0.3) + normalizedImpressions(0.1)` where `normalizedImpressions = impressions / 100`.
- **topic_performance storage**: Each checkpoint upserts a row in `topic_performance` with all metrics + computed score + timestamp. Retries update existing rows rather than duplicating.
- **Token handling**: Encrypted access token passed with job data to avoid DB reads. Falls back to re-reading from `platform_connections` if decryption fails (token rotation scenario).
- **Rate limiting**: Engagement check worker limited to 15 API calls/min with concurrency 6, preventing platform API rate limit violations. Failed jobs retry 3× with exponential backoff (1 min base).
- **Analytics API** (`/api/analytics`): Returns summary stats (totalEngagement, avgPerPost, trendPercent, bestPlatform, bestPillar), timeline data for charts, and per-post checkpoint breakdowns. Supports date range filtering (7d/30d/90d/all).
- **Analytics Insights API** (`/api/analytics/insights`): Pure data-driven insights engine (no LLM calls) computing 5 insight types: best posting time, best content pillar, platform comparison, controversy sweet spot, and consensus tier performance. Requires 10+ published posts with 48h data. Returns top 5 insights sorted by magnitude.
- **Analytics Dashboard** (`/dashboard/analytics`): Full-featured page with date range picker, 4 summary cards (total engagement, avg per post, best platform, best pillar), engagement-over-time area chart (LinkedIn vs X), sortable post performance table with expandable checkpoint details, and performance insights section.
- **Recharts charts**: `EngagementChart` (dual-series area chart for timeline) and `CheckpointChart` (mini area chart showing engagement growth across 4 checkpoints per post).
- **Dashboard home** updated with analytics/performance section link.
- **Sidebar** updated with Analytics nav item linking to `/dashboard/analytics`.
- **Phase 10 trigger**: 48h checkpoint automatically queues a `feedback-loop` job for adaptive learning (see Phase 10).

**Key files:**
- `apps/worker/src/queues.ts` (ENGAGEMENT_CHECK queue + EngagementCheckJobData interface)
- `apps/worker/src/jobs/engagement/engagement-check.job.ts` (main engagement processor)
- `apps/worker/src/jobs/engagement/linkedin-metrics.ts` (LinkedIn API metrics fetcher)
- `apps/worker/src/jobs/engagement/x-metrics.ts` (X API v2 metrics fetcher)
- `apps/worker/src/jobs/publish/publish.job.ts` (engagement check scheduling after publish)
- `apps/worker/src/index.ts` (engagement check worker registered)
- `apps/web/app/api/analytics/route.ts` (main analytics data endpoint)
- `apps/web/app/api/analytics/insights/route.ts` (data-driven insights engine)
- `apps/web/app/(authenticated)/dashboard/analytics/page.tsx` (analytics dashboard)
- `apps/web/app/components/analytics/EngagementChart.tsx` (timeline chart)
- `apps/web/app/components/analytics/CheckpointChart.tsx` (per-post checkpoint chart)

**Dependencies added:**
```
recharts ^3.8.1  (in apps/web)
```

**No new environment variables required.** Engagement tracking uses existing platform OAuth tokens from `platform_connections`.

---

### Phase 10: Adaptive Feedback Loop

**What was built:**
- **Feedback loop auto-trigger**: After the T+48h engagement checkpoint completes, a `feedback-loop` BullMQ job is automatically queued with zero delay. This closes the loop: discovery → scoring → content gen → publishing → engagement tracking → **learning**.
- **Core feedback job** (`feedback-loop.job.ts`): Loads the scored topic's predicted `finalScore` and the actual 48h engagement score, computes a normalized score delta (using z-score normalization against all 48h data), stores a `scoring_feedback` record with a weights snapshot, then dispatches 3 learning modules.
- **Cold start protection**: Learning modules only activate after 10+ posts have 48h engagement data. Before that, feedback records are collected as baseline without adjusting weights. Log output: "Need 10 posts for learning. Have N. Collecting baseline only."
- **Weight adjuster** (`weight-adjuster.ts`): Computes Pearson correlation between each of the 6 scoring dimensions (sentiment, audience_fit, seo, competitor_gap, content_market_fit, engagement_pred) and actual engagement across the last 50 posts. Adjusts weights using a gradient-like update: `new = old + learning_rate × (correlation − avg_correlation)`. Weights are clamped to [0.05, 0.40] bounds and normalized to sum to 1.0. Uses `onConflictDoUpdate` for upsert on the `scoring_weights` table (unique on userId + dimension).
- **Caption learner** (`caption-learner.ts`): Analyzes top 20 performing posts to extract patterns. Classifies caption hooks into 7 types (question, statistic, contrarian, story, educational, bold_claim, general). Extracts top CTAs (last 2 sentences), optimal caption word count per platform, and hashtag count performance. All patterns saved to `user_niche_profiles.brand_kit.learned_patterns`.
- **Time optimizer** (`time-optimizer.ts`): Aggregates engagement by hour-of-day and day-of-week using PostgreSQL `EXTRACT()`, requires 2+ data points per slot for statistical significance. Identifies top 5 best and 3 worst time slots. Computes day-of-week rankings and weekday vs weekend comparison. Generates human-readable recommendations. Saved to `user_niche_profiles.brand_kit.optimal_times`.
- **Learning API** (`/api/analytics/learning`): Returns complete learning state — maturity stage (collecting/adjusting/learning/optimized with post count thresholds 10/30/75), current vs default scoring weights, learned caption patterns, optimal posting times, and last 10 feedback records (predicted vs actual scores).
- **Analytics dashboard — Learning Progress section**: New section at the bottom of `/dashboard/analytics` showing:
  - Maturity progress bar with 4 stages and posts-until-next-stage indicator
  - Scoring weight visualization: horizontal bars for each dimension, ghost outline showing default weight, green ↑ or red ↓ arrows for changes
  - Learned patterns display: top hook types with engagement averages, optimal caption lengths, best hashtag counts
  - Weekly posting heatmap: 7-day × 17-hour grid (6AM–10PM) color-coded by engagement (green=high, yellow=medium, red=low, gray=no data) with legend
  - Human-readable time recommendations
- **Content Studio — optimal time suggestions**: Schedule picker now fetches `brand_kit.optimal_times` and shows up to 3 quick-select buttons for the best posting slots (e.g., "Tuesday 9:00 — 4.2 avg"). Clicking auto-fills the date/time fields with the next occurrence of that slot.
- **Topic Review — adaptive weights badge**: Each scored topic card displays "Adaptive weights (updated 2h ago)" (green, when 10+ posts analyzed) or "Default weights (collecting data…)" (gray, during cold start), with a tooltip showing total posts analyzed.

**Key files:**
- `apps/worker/src/queues.ts` (FEEDBACK_LOOP queue + FeedbackLoopJobData interface)
- `apps/worker/src/jobs/feedback/feedback-loop.job.ts` (main feedback orchestrator)
- `apps/worker/src/jobs/feedback/weight-adjuster.ts` (Pearson correlation + weight gradient update)
- `apps/worker/src/jobs/feedback/caption-learner.ts` (hook/CTA/length/hashtag pattern learning)
- `apps/worker/src/jobs/feedback/time-optimizer.ts` (optimal posting time computation)
- `apps/worker/src/jobs/engagement/engagement-check.job.ts` (48h trigger point)
- `apps/worker/src/index.ts` (feedback loop worker registered)
- `apps/web/app/api/analytics/learning/route.ts` (learning progress API)
- `apps/web/app/(authenticated)/dashboard/analytics/page.tsx` (Learning Progress section + WeeklyHeatmap)
- `apps/web/app/(authenticated)/dashboard/content/page.tsx` (optimal time suggestions in schedule picker)
- `apps/web/app/(authenticated)/dashboard/topics/page.tsx` (adaptive weights badge on topic cards)

**Database tables used:**
- `scoring_feedback` — stores predicted vs actual scores, score delta, and weights snapshot per post
- `scoring_weights` — per-user adaptive weights with unique constraint on (userId, dimension)
- `user_niche_profiles.brand_kit` — JSONB field stores `learned_patterns` and `optimal_times`

**No new environment variables required.** The feedback loop uses existing database and Redis connections.

---

### Phase 11: Telegram Notifications + Settings Page + Connection Health

**What was built:**
- **Telegram bot integration**: Singleton bot instance using `node-telegram-bot-api` (polling disabled — webhook only). 6 message formatters with MarkdownV2 escaping: daily digest, publish confirmation, publish failure, token expiry warning, connection health alert, weekly report.
- **Telegram linking flow**: User generates a 6-digit code in Settings → Notifications. Code stored in Redis with 10-minute TTL (`telegram_link:{code} → userId`). User sends `/link CODE` to `@TechJMBot` via Telegram. Webhook validates the code, saves the chat ID to `notification_preferences`, and confirms. Commands: `/status` (pipeline counts), `/stop` (pause), `/start` (resume).
- **Publish notifications**: After every successful publish, Telegram sends a confirmation with platform emoji, caption preview, and "View Post" link. After all retries exhausted (post marked failed), sends failure notification with error details and link to queue dashboard.
- **Daily digest cron** (8 AM UTC): Queries all users with Telegram enabled + daily digest on. Sends top pending scored topics with consensus tier emojis and scores. Skips users with no pending topics.
- **Weekly report cron** (Monday 9 AM UTC): Sends posts published, total/avg engagement, best post of the week, and whether AI scoring weights were updated. Only to users with weekly report enabled.
- **Connection health cron** (5:30 AM daily, before discovery at 6 AM): Lightweight API health check for each platform connection (LinkedIn `/v2/userinfo`, X `/2/users/me`). Marks connections as healthy/degraded/expired. Sends Telegram alert when a connection fails. Checks token expiry and warns users 7 days in advance.
- **Token refresh cron** (Sunday 3 AM weekly): Finds connections expiring within 14 days that have refresh tokens. Calls LinkedIn OAuth refresh endpoint or X OAuth2 token endpoint. Encrypts and saves new tokens. Handles both platforms' different refresh flows.
- **notification_preferences table**: Stores Telegram chat ID, 6 notification toggle booleans (daily digest, publish success/failure, token expiry, weekly report, connection health), digest time, timezone. Unique per user.
- **Settings page** (`/settings`): 5-tab interface:
  - **Niche tab**: Edit niche, content pillars, target audience, tone, anti-topics. Optional scoring weight reset when niche changes.
  - **AI Keys tab**: Provider cards grid (OpenAI, Anthropic, Google, xAI, DeepSeek, Replicate) with add/remove/revalidate. Each connected provider shows capability badges (Image Gen, Web Search, X Search), model list chips, and last validated date. "Get a key" links to each provider's API console. Model slot assignment dropdowns for all 7 slots (Discovery A-D, Sub-Agent, Caption, Image) with provider/model selection validated against connected keys.
  - **Social Platforms tab**: Per-platform cards showing connection health (green/yellow/red dot), token expiry countdown, account name, last health check. Reconnect button (re-runs OAuth flow) and Disconnect button with confirmation.
  - **Notifications tab**: Telegram linking flow (generate code, countdown timer, copy button, deep link to bot). After connected: send test message, disconnect. 6 notification toggle switches with instant save (no submit button). Digest settings: time picker (06:00-22:00, 30-min increments) and timezone selector (14 common zones, auto-detected from browser).
  - **Account tab**: Display info (email, name, plan, join date). Export all data as JSON download. Danger zone: delete account with `DELETE` confirmation — cascading delete across all tables + Firebase Auth user.
- **AI Keys management API**: Add/remove AI provider keys with live validation against each provider's API. Revalidate existing keys. Provider removal cascades to clear model config slots that used that provider. Model config API validates assigned providers have valid keys before saving.
- **Sidebar health indicators**: Settings nav item fetches `/api/settings/health-summary` on load. Shows red dot if any connection is expired/degraded, yellow dot if any token expires within 7 days.
- **Webhook setup script** (`scripts/setup-telegram-webhook.ts`): Run once after deployment to register the Telegram webhook URL with BotFather.

**Key files:**
- `packages/db/src/schema/notifications.ts` (notification_preferences table)
- `apps/worker/src/notifications/telegram.ts` (bot singleton + 6 message formatters)
- `apps/worker/src/notifications/publish-notify.ts` (publish result notification helper)
- `apps/worker/src/jobs/publish/publish.job.ts` (notification hooks added)
- `apps/worker/src/jobs/notifications/daily-digest.job.ts` (daily cron)
- `apps/worker/src/jobs/notifications/weekly-report.job.ts` (weekly cron)
- `apps/worker/src/jobs/health/connection-health.job.ts` (daily health check)
- `apps/worker/src/jobs/health/token-refresh.job.ts` (weekly token refresh)
- `apps/worker/src/index.ts` (4 new workers registered + crons scheduled)
- `apps/web/app/api/webhooks/telegram/route.ts` (Telegram webhook — public endpoint)
- `apps/web/app/api/settings/telegram/generate-code/route.ts` (6-digit code generation)
- `apps/web/app/api/settings/telegram/test/route.ts` (send test message)
- `apps/web/app/api/settings/telegram/disconnect/route.ts` (unlink Telegram)
- `apps/web/app/api/settings/niche/route.ts` (GET/PATCH niche config)
- `apps/web/app/api/settings/ai-keys/route.ts` (GET/PATCH add/remove/revalidate AI keys)
- `apps/web/app/api/settings/model-config/route.ts` (GET/PATCH model slot assignments)
- `apps/web/app/api/settings/notifications/route.ts` (GET/PATCH notification toggles)
- `apps/web/app/api/settings/social/disconnect/route.ts` (disconnect platform)
- `apps/web/app/api/settings/health-summary/route.ts` (sidebar health check)
- `apps/web/app/api/settings/account/route.ts` (DELETE account)
- `apps/web/app/api/settings/account/export/route.ts` (JSON data export)
- `apps/web/app/api/connections/route.ts` (list user connections)
- `apps/web/app/(authenticated)/settings/page.tsx` (5-tab settings page)
- `apps/web/app/components/layout/sidebar.tsx` (health dot indicators)
- `apps/web/app/components/layout/mobile-nav.tsx` (settings link updated)
- `apps/web/lib/redis.ts` (IORedis client for web app)
- `scripts/setup-telegram-webhook.ts` (one-time webhook registration)

**Dependencies added:**
```
node-telegram-bot-api ^0.66.0  (in apps/worker)
@types/node-telegram-bot-api   (in apps/worker, devDependency)
```

**New environment variables:**
```bash
# Telegram Bot (optional — notifications disabled if not set)
TELEGRAM_BOT_TOKEN=           # From @BotFather /newbot
TELEGRAM_BOT_USERNAME=TechJMBot  # Bot username without @

# Required for token refresh cron (already set in Phase 4 if using OAuth)
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
X_CLIENT_ID=
X_CLIENT_SECRET=
```

**Post-deployment setup:**
```bash
# Register Telegram webhook (run once)
TELEGRAM_BOT_TOKEN=xxx NEXT_PUBLIC_APP_URL=https://yourapp.com npx tsx scripts/setup-telegram-webhook.ts
```

---

### Phase 12: Production Readiness — Monitoring + Backup + Rate Limiting + Error Handling

**What was built:**
- **Uptime Kuma monitor setup** (`scripts/setup-uptime-kuma.ts`): Prints monitor definitions for PostgreSQL (TCP:5432), Redis (TCP:6379), Worker Health (HTTP:3100), Next.js (HTTP:3000), Postiz (HTTP:5000), Firebase Auth, Bull Board (HTTP:3101), and optionally OpenAI/Anthropic APIs. Includes Telegram alert channel setup instructions using the same bot from Phase 11.
- **PostgreSQL backup automation** (`apps/worker/src/jobs/backup/pg-dump.job.ts`): BullMQ-scheduled `pg_dump | gzip` backups. Daily backups every 6 hours (7-day retention), weekly backups Sunday 2 AM (30-day retention). Verifies backup file size (>1KB), optional S3 upload via `BACKUP_S3_BUCKET`, automatic cleanup of expired backups.
- **Redis-based rate limiter** (`packages/rate-limiter`): New workspace package. Sliding-window rate limiter using Redis sorted sets. Per-user limits for 7 action types: discovery trigger (10/day), caption generation (30/day), image generation (20/day), sub-agent calls (300/day), publishing (20/day), API general (200/hour), key validation (20/hour). Returns 429 with `Retry-After` header when exceeded.
- **Rate limit middleware** (`apps/web/lib/rate-limit.ts`): Next.js helper wrapping the rate limiter for API routes. Applied to `/api/discovery/trigger`, `/api/onboarding/validate-key`, and `/api/posts/[id]/publish-now`.
- **Structured error handling** (`apps/worker/src/lib/error-handler.ts`): `withErrorHandling()` wrapper applied to all 17 worker job processors. Categorizes errors into 7 types (INVALID_KEY, RATE_LIMITED, PROVIDER_ERROR, TOKEN_EXPIRED, DATA_NOT_FOUND, NETWORK_ERROR, INTERNAL_ERROR). Logs structured errors to `job_errors` table with job data context, user ID, stack trace. Console output is JSON-structured for log aggregation.
- **job_errors table** (`packages/db/src/schema/errors.ts`): New table with indexes on (user_id, created_at) and error_category. Tracks resolved/unresolved status with timestamps.
- **BullMQ admin dashboard** (`apps/worker/src/admin/bull-board.ts`): Express server on port 3101 serving Bull Board UI. Shows all 14 queues (including backup) with job counts, statuses, retry controls, and payload inspection.
- **Error dashboard** (`/admin/errors`): Admin-only page showing job errors with category/time filters, stats cards (total, unresolved, most common), expandable detail view (context, stack trace), and resolve button. API at `/api/admin/errors` with pagination and category filtering.
- **Queue admin page** (`/admin/queues`): Admin-only page embedding Bull Board via iframe, with direct link to port 3101.
- **Enhanced worker health endpoint**: `/health` now returns services status (Redis, PostgreSQL), queue depths with all states (waiting, active, completed, failed, delayed), memory usage, uptime, and degraded status detection (>50 failed jobs). `/metrics` endpoint returns Prometheus-compatible text format.
- **E2E dogfood test** (`scripts/e2e-dogfood.ts`): Comprehensive pipeline validation script. Checks: user with completed onboarding, niche config (3+ pillars), AI keys, model slots, raw topics, scored topics with 7 sub-agent outputs, generated content (platform-specific length validation), publish readiness, adaptive scoring weights, service health, and error tracking. Supports `--dry-run` and `--verbose` flags.

**Key files:**
- `packages/rate-limiter/src/index.ts` (RateLimiter class + RATE_LIMITS config)
- `packages/rate-limiter/package.json` (@techjm/rate-limiter workspace package)
- `apps/web/lib/rate-limit.ts` (withRateLimit middleware)
- `apps/worker/src/lib/error-handler.ts` (withErrorHandling + categorizeError)
- `apps/worker/src/jobs/backup/pg-dump.job.ts` (pg_dump worker + scheduler)
- `apps/worker/src/admin/bull-board.ts` (Bull Board Express server)
- `apps/worker/src/index.ts` (backup worker + bull board + enhanced health endpoint)
- `apps/worker/src/queues.ts` (BACKUP queue added)
- `packages/db/src/schema/errors.ts` (job_errors table + errorCategoryEnum)
- `apps/web/app/api/admin/errors/route.ts` (error dashboard API)
- `apps/web/app/(authenticated)/admin/errors/page.tsx` (error dashboard UI)
- `apps/web/app/(authenticated)/admin/queues/page.tsx` (queue admin UI)
- `scripts/setup-uptime-kuma.ts` (monitor setup helper)
- `scripts/e2e-dogfood.ts` (E2E pipeline validation)

**Dependencies added:**
```
@bull-board/api ^6.6.2     (in apps/worker)
@bull-board/express ^6.6.2 (in apps/worker)
express ^4.21.0            (in apps/worker)
@types/express ^5.0.0      (in apps/worker, devDependency)
@techjm/rate-limiter *     (in apps/web and apps/worker)
```

**New environment variables:**
```bash
# Backup (optional)
BACKUP_DIR=/tmp/techjm-backups       # Local backup directory
BACKUP_S3_BUCKET=                    # Optional: S3 bucket for offsite backups
```

**Post-deployment:**
```bash
# Set up Uptime Kuma monitors
npx tsx scripts/setup-uptime-kuma.ts

# Push new job_errors table
npm run db:push

# Run E2E validation
npx tsx scripts/e2e-dogfood.ts --dry-run

# Access admin dashboards
# Bull Board: http://localhost:3101/admin/queues
# Error Dashboard: http://localhost:3000/admin/errors
# Worker Health: http://localhost:3100/health
# Prometheus Metrics: http://localhost:3100/metrics
```

---

## 14. Troubleshooting

### Docker services won't start

```bash
# Check if ports are already in use
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :3001  # Uptime Kuma

# Kill conflicting processes or change ports in docker-compose.yml
```

### `npm install` fails

```bash
# Clear npm cache and node_modules
rm -rf node_modules apps/*/node_modules packages/*/node_modules package-lock.json
npm install
```

### `db:push` fails with connection error

```bash
# Ensure PostgreSQL is running and healthy
docker compose ps
docker compose logs postgres

# Verify DATABASE_URL in .env matches Docker config
# Default: postgresql://postgres:postgres@localhost:5432/techjm
```

### Firebase Admin SDK error on build

The Firebase Admin SDK requires the `FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY` env var. If not set, the build will still succeed (lazy initialization), but API routes using auth will fail at runtime.

```bash
# Verify the env var is valid JSON
node -e "JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY)"
```

### `DB_ENCRYPTION_KEY` error

```bash
# Must be exactly 64 hex characters (32 bytes)
# Generate a valid key:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Verify length:
echo -n "$DB_ENCRYPTION_KEY" | wc -c
# Should output: 64
```

### Build fails with import errors

If you see errors about `.js` extensions in imports:

```bash
# Clean build artifacts and rebuild
npm run build
```

### Web app shows blank page

```bash
# Check Next.js dev server logs for errors
cd apps/web
npm run dev

# Common issue: missing NEXT_PUBLIC_* env vars
# These must be prefixed with NEXT_PUBLIC_ to be available in the browser
```

### Worker can't connect to Redis

```bash
# Verify Redis is running
docker compose exec redis redis-cli ping

# Check REDIS_URL in .env
# Default: redis://localhost:6379
```

### Worker health check returns error

```bash
# Check if port 3100 is already in use
lsof -i :3100

# Change the port via env var
WORKER_PORT=3200 npm run dev --workspace=apps/worker
```

### Discovery trigger returns 400

Common causes:
- User's `onboarding_step` is not `'complete'` — finish all 5 onboarding steps first
- No model config saved — complete Step 3 (AI keys + model slot assignment)
- No valid slots — ensure at least one slot has a matching API key provider

### Discovery LLM job fails with INVALID_KEY

The user's API key stored in the database is invalid or expired. Re-validate the key:
1. Go to the provider's console and verify the key is active
2. Re-enter the key in the onboarding wizard (Step 3) or settings

### Scoring jobs not starting after discovery

If discovery completes but sub-agent scoring doesn't trigger:
- Check that the user has at least one AI provider key configured
- Worker logs should show "Queueing sub-agent scoring for N topics" after merge
- If you see "WARNING: No AI provider available", ensure `user_ai_keys` has a valid entry
- Verify Redis is running — scoring uses the same FlowProducer as discovery

### Topic dashboard shows "No topics found" even after scoring

- Check the `scored_topics` table in Drizzle Studio — are there rows with `status = 'pending'`?
- Verify the Firebase auth token is being sent in API requests (check browser Network tab)
- If `status = 'scoring'`, sub-agents are still running — wait for orchestrator to complete

### Content not generating after topic approval

- Check worker logs for `[caption-gen]` entries — if missing, the queue may not be connected
- Verify Redis is running: `docker compose exec redis redis-cli ping`
- Check that the user has at least one AI provider key in `user_ai_keys` — caption generation needs a text model
- If you see "No AI provider available", the auto-selector found no matching keys

### Image generation fails

- Check worker logs for `[image-gen]` error messages
- Verify the user has a key for an image-capable provider (Replicate or OpenAI with gpt-image-1 access)
- If Cloudinary upload fails, images still work via direct URLs from the provider
- Posts will be marked as `status: 'review'` (text-only) if all image gen attempts fail

### Content Studio shows "No content yet"

- Ensure you've approved at least one topic in `/dashboard/topics`
- Check that the status filter tab matches — "Ready for Review" is the default
- Posts in `generating` status will appear under the "Generating" tab
- Auto-polling refreshes every 5 seconds when generating posts exist

### Scheduled post doesn't publish at the right time

- BullMQ delayed jobs depend on Redis being available — ensure Redis is running
- Check that the worker is running: `curl http://localhost:3100/health`
- Verify the job exists in Redis: `docker compose exec redis redis-cli ZRANGE "bull:publish:delayed" 0 -1`
- Worker logs should show the publish attempt at the scheduled time

### Publishing fails with "No platform connection"

- The user must have a connected LinkedIn or X account (onboarding Step 4)
- Check `platform_connections` table for an entry matching the user + platform
- Connection health should be `healthy` — expired tokens need re-authentication

### Postiz container won't start

- Postiz is optional — the publishing pipeline falls back to direct API calls
- Check `docker compose logs postiz` for startup errors
- Ensure the `postiz` database was created (check with `docker compose exec postgres psql -U postgres -l`)
- If persistent issues, remove the Postiz service from `docker-compose.yml` — direct publishing still works

### Queue dashboard shows no posts

- Posts must be in `scheduled`, `publishing`, `published`, or `failed` status to appear
- Schedule a post from Content Studio first, or use the schedule API directly
- Check that the Firebase auth token is being sent in requests

### Engagement checks not firing after publish

- Verify the worker is running and shows `engagement-check` in startup logs
- Check Redis for delayed jobs: `docker compose exec redis redis-cli ZRANGE "bull:engagement-check:delayed" 0 -1`
- Worker logs should show "Queued 4 engagement checks: 2h, 6h, 24h, 48h" after each successful publish
- For testing, temporarily change the first checkpoint delay in `publish.job.ts` to 30 seconds

### Engagement check fails with TOKEN_EXPIRED

- The user's platform OAuth token has expired since the post was published
- User needs to re-authenticate their LinkedIn/X connection
- These jobs will not retry (token issue won't resolve itself)

### Analytics dashboard shows no data

- Engagement data requires published posts that have passed at least the 2h checkpoint
- Check `topic_performance` table for rows: `SELECT * FROM topic_performance ORDER BY measured_at DESC LIMIT 10;`
- If the table is empty, engagement checks haven't completed yet — check worker logs
- Insights require 10+ posts with 48h checkpoint data

### Firebase `auth/invalid-api-key` error

Next.js in a monorepo loads `.env` from the app directory (`apps/web/`), not the monorepo root. A symlink is set up (`apps/web/.env → ../../.env`) to bridge this. If missing:

```bash
# Create symlink (already in .gitignore)
ln -s ../../.env apps/web/.env

# IMPORTANT: Restart the dev server after creating the symlink
# Next.js only reads .env files at startup
```

### Telegram bot not receiving messages

- Verify `TELEGRAM_BOT_TOKEN` is set in `.env`
- Run the webhook setup script: `TELEGRAM_BOT_TOKEN=xxx NEXT_PUBLIC_APP_URL=https://yourapp.com npx tsx scripts/setup-telegram-webhook.ts`
- For local development, you need a public URL (use ngrok or similar) since Telegram requires HTTPS webhooks
- Check bot status: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

### Telegram notifications not sending

- Check `notification_preferences` table — user must have `telegram_chat_id` set and `telegram_enabled = true`
- Verify the specific notification toggle is enabled (e.g., `notify_publish_success`)
- If `TELEGRAM_BOT_TOKEN` is not set, all notification code gracefully skips (no errors)
- Test manually: go to Settings → Notifications → "Send Test Message"

### Bull Board not loading

- Verify the worker is running and port 3101 is accessible
- Check worker startup logs for "Bull Board running at http://localhost:3101/admin/queues"
- If port conflict: the bull board starts on a fixed port — kill any other process using 3101

### Rate limit returning 429 unexpectedly

- Rate limits are per-user, per-action with sliding windows
- Check Redis: `docker compose exec redis redis-cli KEYS "ratelimit:*"`
- To reset a specific limit: `docker compose exec redis redis-cli DEL "ratelimit:discovery:trigger:<userId>"`
- Default limits are in `packages/rate-limiter/src/index.ts` — adjust `RATE_LIMITS` as needed

### Backup job fails with "pg_dump not found"

- `pg_dump` must be installed on the host machine (not just in Docker)
- Install: `sudo apt install postgresql-client` (Ubuntu) or `brew install libpq` (macOS)
- Alternatively, the backup will skip if `pg_dump` is unavailable — check worker logs

### E2E dogfood test fails

- Ensure a user exists with `onboarding_step = 'complete'` in the database
- The test requires the full pipeline to have run at least once (discovery → scoring → content)
- Run with `--verbose` for additional diagnostic output
- For a fresh database, complete onboarding for at least one user first

### LinkedIn metrics return all zeros

- Personal LinkedIn profiles don't expose impression counts via API — the system estimates them
- Org page metrics require the `r_organization_social` OAuth scope
- Check if the LinkedIn API version header matches (currently `202401`)

---

## Quick Start (TL;DR)

```bash
# 1. Clone and install
git clone <repo-url> grow-social-mvp && cd grow-social-mvp
npm install

# 2. Start infrastructure
docker compose up -d

# 3. Configure environment
cp .env.example .env
# Edit .env - at minimum fill in:
#   DB_ENCRYPTION_KEY (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
#   All NEXT_PUBLIC_FIREBASE_* values
#   FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY

# 4. Set up database
npm run db:push
cd packages/db && npx tsx src/seed.ts && cd ../..

# 5. Start development
npm run dev

# 6. Open http://localhost:3000
```
