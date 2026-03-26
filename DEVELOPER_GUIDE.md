# TechJM / Grow Social MVP - Developer Setup Guide

Complete step-by-step guide to set up and run the project locally, covering **Phase 1 through Phase 8**.

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
│   │   │   │   └── dashboard/        # Main dashboard
│   │   │   │       ├── topics/       # Topic review dashboard (Phase 6)
│   │   │   │       ├── content/      # Content Studio dashboard (Phase 7)
│   │   │   │       └── queue/        # Publishing Queue dashboard (Phase 8)
│   │   │   ├── api/                  # API routes
│   │   │   │   ├── auth/             # Firebase + OAuth endpoints
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
│               └── publish/           # Phase 8: Publishing Pipeline
│                   ├── publish.job.ts       # Main publish processor (Postiz + direct fallback)
│                   ├── postiz-client.ts     # Postiz API integration
│                   ├── direct-publisher.ts  # Direct LinkedIn/X API publishing
│                   └── log.ts              # Publish audit log helper
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
│   │   │   │   └── posts.ts          # generated_posts, publish_log
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
