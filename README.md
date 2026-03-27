# Grow Social MVP

AI-powered social media content automation platform that discovers trending topics via 4 parallel LLMs, analyzes them with 7 specialized sub-agents, generates platform-optimized content, and publishes to LinkedIn & X — learning from engagement data to improve over time.

## Key Features

- **4-LLM Discovery** — Queries GPT-4o, Claude 3.5, Gemini, and Grok in parallel to surface trending topics in your niche
- **7 Sub-Agent Analysis** — Sentiment, audience fit, SEO, competitor gap, content-market fit, engagement prediction, and pillar balance scoring
- **Consensus Deduplication** — Topics mentioned by multiple LLMs are ranked higher (definitive / strong / confirmed / experimental tiers)
- **Auto Content Generation** — Platform-optimized captions and AI-generated images for LinkedIn and X
- **Scheduled Publishing** — Publish immediately or schedule posts across connected platforms
- **Adaptive Feedback Loop** — Tracks engagement at 2h, 6h, 24h, and 48h checkpoints; adjusts scoring weights based on actual performance
- **BYOK (Bring Your Own Keys)** — Users provide their own AI provider API keys; no platform-level AI costs
- **Fallback Grounding** — When API keys are unavailable, scrapes Hacker News, Reddit, RSS feeds, ProductHunt, and Dev.to
- **Telegram Notifications** — Daily digests and weekly performance reports via Telegram bot

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Architecture](#architecture)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [API Reference](#api-reference)
- [Worker Jobs](#worker-jobs)
- [Database Schema](#database-schema)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 15 (App Router) | UI + API routes |
| **UI Framework** | React 19 | Component library |
| **Styling** | Tailwind CSS 4.0 | Utility-first CSS with glassmorphism design |
| **State** | Zustand | Client-side state management |
| **Auth** | Firebase Authentication | Google OAuth + email/password |
| **Database** | PostgreSQL 16 | Primary data store |
| **ORM** | Drizzle ORM 0.38 | Type-safe database access + migrations |
| **Cache / Queue** | Redis 7 | BullMQ job storage + rate limiting |
| **Job Queue** | BullMQ 5.25 | Distributed background job processing |
| **AI Providers** | 7 adapters (OpenAI, Anthropic, Google, XAI, DeepSeek, Mistral, Replicate) | Multi-LLM support |
| **Image CDN** | Cloudinary | Image generation + upload |
| **Social Publishing** | Postiz (self-hosted) | LinkedIn/X OAuth proxy |
| **Monitoring** | Uptime Kuma | Health checks |
| **Reverse Proxy** | Caddy 2 | Auto-TLS + routing |
| **Build System** | Turborepo 2.3 | Monorepo orchestration |
| **Language** | TypeScript 5.7 (strict) | End-to-end type safety |
| **Runtime** | Node.js 18+ | ES Modules |

---

## Prerequisites

- **Node.js** 18 or higher
- **npm** 9+ (workspaces used for monorepo)
- **Docker** and **Docker Compose** (for PostgreSQL, Redis, and supporting services)
- **Firebase project** with Authentication enabled (Google sign-in provider)
- At least one **AI provider API key** (OpenAI, Anthropic, Google, XAI, DeepSeek, Mistral, or Replicate)
- **LinkedIn** and/or **X developer app** credentials (for social publishing)

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/grow-social-mvp.git
cd grow-social-mvp
```

### 2. Install Dependencies

```bash
npm install
```

This installs dependencies for all workspaces: `apps/web`, `apps/worker`, `packages/db`, `packages/ai-adapters`, `packages/rate-limiter`, and `packages/shared`.

### 3. Start Infrastructure Services

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** on port `5432` (user: `postgres`, password: `postgres`, database: `techjm`)
- **Redis 7** on port `6379` (noeviction policy for BullMQ compatibility)
- **Caddy** on ports `80`/`443` (reverse proxy with auto-TLS)
- **Postiz** on port `5000` (social publishing proxy)
- **Uptime Kuma** on port `3001` (monitoring dashboard)

### 4. Configure Environment Variables

```bash
cp .env.example .env
```

At minimum, fill in these values:

| Variable | Description | How to Get |
|----------|-------------|------------|
| `DATABASE_URL` | PostgreSQL connection | Pre-filled for Docker: `postgresql://postgres:postgres@localhost:5432/techjm` |
| `DB_ENCRYPTION_KEY` | 32-byte hex key for encrypting API keys at rest | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `REDIS_URL` | Redis connection | Pre-filled for Docker: `redis://localhost:6379` |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase client config (6 values) | Firebase Console > Project Settings > Web App |
| `FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY` | Firebase Admin SDK JSON (single-line) | Firebase Console > Service Accounts > Generate New Private Key |

See [Environment Variables](#environment-variables) for the complete reference.

### 5. Set Up the Database

Push the schema to PostgreSQL:

```bash
npm run db:push -w packages/db
```

Seed the recommendation matrix (used during onboarding):

```bash
npx tsx packages/db/src/seed.ts
```

### 6. Start Development Servers

```bash
npm run dev
```

This runs Turborepo's `dev` task across all workspaces in parallel:
- **Web app** (Next.js) at [http://localhost:3000](http://localhost:3000)
- **Worker** (BullMQ processor) watching for background jobs

Alternatively, start them individually:

```bash
# Terminal 1: Web app
npm run dev -w apps/web

# Terminal 2: Worker
npm run dev -w apps/worker
```

### 7. Complete Onboarding

1. Open [http://localhost:3000](http://localhost:3000)
2. Sign in with Google (or email/password if configured)
3. **Step 2** — Define your niche: pillars, target audience, tone, competitors
4. **Step 3** — Add at least one AI provider API key
5. **Step 4** — Connect LinkedIn and/or X accounts via OAuth
6. **Step 5** — Review settings and launch your first discovery

---

## Architecture

### Monorepo Structure

```
grow-social-mvp/
├── apps/
│   ├── web/                          # Next.js 15 frontend + API routes
│   │   ├── app/
│   │   │   ├── (authenticated)/      # Protected pages (dashboard, settings, admin)
│   │   │   │   ├── dashboard/
│   │   │   │   │   ├── topics/       # Topic review & approval
│   │   │   │   │   ├── content/      # Post management & scheduling
│   │   │   │   │   └── analytics/    # Engagement dashboards & charts
│   │   │   │   ├── settings/         # Account, niche, AI keys, notifications
│   │   │   │   └── admin/            # Error logs & queue monitoring
│   │   │   ├── api/                  # API route handlers
│   │   │   │   ├── auth/             # Firebase sync + OAuth flows
│   │   │   │   ├── topics/           # Topic CRUD + approve/reject
│   │   │   │   ├── posts/            # Post CRUD + publish
│   │   │   │   ├── onboarding/       # 5-step onboarding endpoints
│   │   │   │   ├── discovery/        # Discovery trigger
│   │   │   │   ├── settings/         # User settings management
│   │   │   │   ├── analytics/        # Performance data
│   │   │   │   ├── connections/      # Social connection health
│   │   │   │   ├── admin/            # Admin error/queue views
│   │   │   │   └── webhooks/         # Telegram webhook receiver
│   │   │   ├── onboarding/           # 5-step onboarding wizard
│   │   │   └── components/           # Shared UI components
│   │   ├── lib/                      # Utilities (redis, rate-limit, firebase-admin)
│   │   └── providers/                # React context providers (auth)
│   │
│   └── worker/                       # BullMQ job processor
│       ├── src/
│       │   ├── index.ts              # Entry point: queue registration + health endpoint
│       │   ├── queues.ts             # Queue definitions + concurrency config
│       │   ├── jobs/
│       │   │   ├── discovery/        # 4-LLM discovery pipeline
│       │   │   ├── sub-agents/       # 7 scoring sub-agents + orchestrator
│       │   │   ├── content/          # Caption + image generation
│       │   │   ├── publish/          # Social platform publishing
│       │   │   ├── engagement/       # Metric polling at checkpoints
│       │   │   ├── feedback/         # Adaptive weight adjustment
│       │   │   ├── notifications/    # Telegram daily digest + weekly report
│       │   │   ├── health/           # OAuth token health + refresh
│       │   │   ├── backup/           # PostgreSQL backups
│       │   │   └── fallback/         # Grounding service (HN, Reddit, RSS)
│       │   ├── lib/                  # Worker utilities
│       │   ├── admin/                # Bull Board admin UI setup
│       │   └── notifications/        # Telegram bot integration
│       └── package.json
│
├── packages/
│   ├── db/                           # Database layer
│   │   ├── src/schema/               # Drizzle table definitions
│   │   │   ├── _enums.ts             # Shared PostgreSQL enums
│   │   │   ├── _relations.ts         # Centralized table relations
│   │   │   ├── auth.ts               # users, user_niche_profiles
│   │   │   ├── ai-keys.ts            # user_ai_keys, user_model_config
│   │   │   ├── connections.ts        # platform_connections
│   │   │   ├── topics.ts             # raw_topics, fallback_grounding_cache
│   │   │   ├── scoring.ts            # scored_topics
│   │   │   ├── posts.ts              # posts, publish_log
│   │   │   ├── recommendations.ts    # recommendation_matrix
│   │   │   ├── niche.ts              # niche-related helpers
│   │   │   ├── notifications.ts      # notification preferences
│   │   │   └── errors.ts             # job_errors tracking
│   │   ├── drizzle/                  # Generated migration files
│   │   └── drizzle.config.ts         # Drizzle Kit configuration
│   │
│   ├── ai-adapters/                  # Multi-provider LLM abstraction
│   │   └── src/
│   │       ├── factory.ts            # Provider → adapter mapping
│   │       ├── openai.ts             # GPT-4o, GPT-5.4 family
│   │       ├── anthropic.ts          # Claude 3.5 Sonnet, Haiku
│   │       ├── google.ts             # Gemini family
│   │       ├── xai.ts                # Grok with X search
│   │       ├── deepseek.ts           # DeepSeek reasoning models
│   │       ├── mistral.ts            # Mistral open-source models
│   │       └── replicate.ts          # Open-source model inference
│   │
│   ├── rate-limiter/                 # Redis sliding-window rate limiter
│   │   └── src/index.ts              # Per-user, per-action rate limiting
│   │
│   └── shared/                       # Shared types & validation
│       └── src/                      # Zod schemas + TypeScript types
│
├── scripts/
│   ├── e2e-dogfood.ts                # End-to-end smoke test
│   ├── setup-telegram-webhook.ts     # Configure Telegram bot webhook
│   └── setup-uptime-kuma.ts          # Configure monitoring checks
│
├── docker-compose.yml                # Infrastructure services
├── turbo.json                        # Turborepo task configuration
├── package.json                      # Root workspace config
└── DEVELOPER_GUIDE.md                # Comprehensive 86KB setup & architecture guide
```

### Request Lifecycle

```
Browser → Next.js App Router → API Route Handler → Firebase Token Verification
                                       ↓
                              Drizzle ORM → PostgreSQL
                                       ↓
                              BullMQ (enqueue job) → Redis
                                       ↓
                              Worker picks up job → AI Adapter → LLM Provider
                                       ↓
                              Results saved → PostgreSQL
                                       ↓
                              Frontend polls/refreshes → Updated UI
```

### Discovery Pipeline Flow

```
User triggers discovery (or daily cron fires)
         ↓
┌─────────────────────────────────┐
│  BullMQ FlowProducer creates:   │
│  1 parent merge job              │
│  4 child LLM jobs (one per slot) │
└─────────────────────────────────┘
         ↓
┌──────────────────────────────────────────────────────┐
│  Slot A (GPT-4o)  │  Slot B (Claude)  │  Slot C ...  │
│  → raw_topics      │  → raw_topics     │  → raw_topics│
└──────────────────────────────────────────────────────┘
         ↓ (all children complete)
┌──────────────────────────────────┐
│  Merge job runs:                  │
│  - Deduplicates by title + angle  │
│  - Assigns consensus tier         │
│  - Creates scored_topics          │
│  - Queues scoring orchestrators   │
└──────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────────┐
│  Per topic: 7 sub-agent jobs queued (rate: 40/min)     │
│  sentiment | audience | SEO | competitor | CMF |       │
│  engagement | pillar                                   │
└────────────────────────────────────────────────────────┘
         ↓ (all 7 complete)
┌──────────────────────────────────┐
│  Scoring orchestrator:            │
│  - Aggregates 7 scores            │
│  - Applies user's adaptive weights│
│  - Computes finalScore (0-100)    │
│  - Applies consensus multiplier   │
└──────────────────────────────────┘
         ↓
Topics appear in dashboard sorted by score
```

### Engagement Feedback Loop

```
Post published → engagement-check job scheduled at 2h, 6h, 24h, 48h
         ↓
Polls platform API for impressions, likes, comments, shares
         ↓
Stores in topic_performance table (per checkpoint)
         ↓
feedback-loop job compares predicted vs. actual engagement
         ↓
Adjusts per-user scoring_weights (bounded 0.050 - 0.400)
         ↓
Next discovery cycle uses updated weights for scoring
```

---

## Environment Variables

### Required

| Variable | Description | How to Get |
|----------|-------------|------------|
| `DATABASE_URL` | PostgreSQL connection string | Docker default: `postgresql://postgres:postgres@localhost:5432/techjm` |
| `DB_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM encryption of API keys | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `REDIS_URL` | Redis connection string | Docker default: `redis://localhost:6379` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web API key | Firebase Console > Project Settings |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID | Firebase Console |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | `your-project.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | Firebase Console |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID | Firebase Console |
| `FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY` | Firebase Admin SDK JSON (single-line, escaped) | Firebase Console > Service Accounts > Generate Key |

### AI Provider Keys (BYOK)

Users add their own keys during onboarding. These are optional platform-level defaults for testing:

| Variable | Provider | Models |
|----------|----------|--------|
| `OPENAI_API_KEY` | OpenAI | GPT-4o, GPT-5.4 family |
| `ANTHROPIC_API_KEY` | Anthropic | Claude 3.5 Sonnet, Haiku |
| `GOOGLE_API_KEY` | Google | Gemini family |
| `XAI_API_KEY` | xAI | Grok (with X search) |
| `DEEPSEEK_API_KEY` | DeepSeek | DeepSeek reasoning models |
| `REPLICATE_API_KEY` | Replicate | Open-source model inference |

### Social OAuth

| Variable | Description |
|----------|-------------|
| `LINKEDIN_CLIENT_ID` | LinkedIn app client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn app client secret |
| `LINKEDIN_REDIRECT_URI` | OAuth callback URL (default: `http://localhost:3000/api/auth/linkedin/callback`) |
| `X_CLIENT_ID` | X/Twitter app client ID |
| `X_CLIENT_SECRET` | X/Twitter app client secret |
| `X_REDIRECT_URI` | OAuth callback URL (default: `http://localhost:3000/api/auth/x/callback`) |

### Integrations

| Variable | Description | Required |
|----------|-------------|----------|
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | For image generation |
| `CLOUDINARY_API_KEY` | Cloudinary API key | For image generation |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | For image generation |
| `POSTIZ_API_URL` | Postiz API URL | Default: `http://localhost:5000` |
| `POSTIZ_API_KEY` | Postiz API key | For social publishing |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | For notifications |
| `TELEGRAM_CHAT_ID` | Telegram chat ID | For notifications |

### Application

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_URL` | Public-facing app URL | `http://localhost:3000` |
| `NODE_ENV` | Environment | `development` |

---

## Available Scripts

### Root (Turborepo)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all apps in parallel (web + worker) |
| `npm run build` | Build all workspaces |
| `npm run lint` | Lint all workspaces |
| `npm run db:push` | Push schema changes to PostgreSQL |
| `npm run db:studio` | Open Drizzle Studio (database GUI) |
| `npm run format` | Format all code with Prettier |

### Web App (`apps/web`)

| Command | Description |
|---------|-------------|
| `npm run dev -w apps/web` | Start Next.js dev server with Turbopack |
| `npm run build -w apps/web` | Production build |
| `npm run start -w apps/web` | Start production server |
| `npm run lint -w apps/web` | Run ESLint |

### Worker (`apps/worker`)

| Command | Description |
|---------|-------------|
| `npm run dev -w apps/worker` | Start worker with hot reload (tsx watch) |
| `npm run build -w apps/worker` | Compile TypeScript |
| `npm run start -w apps/worker` | Run compiled worker |

### Database (`packages/db`)

| Command | Description |
|---------|-------------|
| `npm run db:push -w packages/db` | Push schema to database (no migration files) |
| `npm run db:studio -w packages/db` | Open Drizzle Studio at `https://local.drizzle.studio` |
| `npx drizzle-kit generate -w packages/db` | Generate SQL migration files |
| `npx tsx packages/db/src/seed.ts` | Seed recommendation matrix data |

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/sync` | Sync Firebase user with backend database |
| `GET` | `/api/auth/linkedin` | Initiate LinkedIn OAuth flow |
| `GET` | `/api/auth/linkedin/callback` | LinkedIn OAuth callback |
| `GET` | `/api/auth/x` | Initiate X/Twitter OAuth flow |
| `GET` | `/api/auth/x/callback` | X/Twitter OAuth callback |

### Onboarding

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/onboarding/niche` | Step 2: Set niche profile (pillars, audience, tone) |
| `POST` | `/api/onboarding/ai-keys` | Step 3: Add AI provider API keys |
| `POST` | `/api/onboarding/validate-key` | Validate an API key before saving |
| `POST` | `/api/onboarding/socials` | Step 4: Connect social accounts |
| `POST` | `/api/onboarding/social-complete` | Mark social connection as complete |
| `POST` | `/api/onboarding/social-disconnect` | Disconnect a social platform |
| `POST` | `/api/onboarding/recommendations` | Step 5: Get AI model recommendations |
| `POST` | `/api/onboarding/select-org` | Select LinkedIn organization |
| `POST` | `/api/onboarding/launch` | Complete onboarding and queue first discovery |

### Topics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/topics` | List scored topics (filterable by status, paginated) |
| `POST` | `/api/topics` | Create or update a topic |
| `GET` | `/api/topics/[id]` | Get topic details with all sub-agent scores |
| `POST` | `/api/topics/[id]/approve` | Approve topic for content generation |
| `POST` | `/api/topics/[id]/reject` | Reject topic |

### Posts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/posts` | List posts (filterable by status) |
| `POST` | `/api/posts` | Create a new post |
| `POST` | `/api/posts/[id]` | Update post (edit caption, reschedule) |
| `POST` | `/api/posts/[id]/publish-now` | Publish a post immediately |

### Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/discovery/trigger` | Manually trigger a discovery run |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/POST` | `/api/settings/account` | Get/update user profile |
| `POST` | `/api/settings/account/export` | Export all user data |
| `GET/POST` | `/api/settings/niche` | Get/update niche profile |
| `GET/POST` | `/api/settings/ai-keys` | Manage AI provider keys |
| `GET/POST` | `/api/settings/model-config` | Configure LLM model slots |
| `GET/POST` | `/api/settings/notifications` | Notification preferences |
| `POST` | `/api/settings/telegram/generate-code` | Generate Telegram verification code |
| `POST` | `/api/settings/telegram/test` | Test Telegram connection |
| `POST` | `/api/settings/telegram/disconnect` | Disconnect Telegram |
| `GET` | `/api/settings/health-summary` | Connection health status |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/topic-performance` | Topic engagement metrics |
| `GET` | `/api/analytics/trending` | Trending topics in niche |
| `GET` | `/api/analytics/learning` | Feedback loop learning data |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/errors` | List job errors |
| `GET` | `/api/admin/queues` | Queue status and job counts |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/webhooks/telegram` | Receive Telegram bot messages |

---

## Worker Jobs

The worker processes 18+ job types organized into pipelines:

### Discovery Pipeline

| Job | Queue | Description |
|-----|-------|-------------|
| `discovery-cron` | `discovery-cron` | Daily trigger: queues discovery for all active users |
| `discovery-llm` | `discovery-llm` | Runs one LLM slot (4 jobs per discovery, one per slot) |
| `discovery-merge` | `discovery-merge` | Deduplicates results, assigns consensus tiers, creates scored topics |
| `fallback-grounding` | `fallback-grounding` | Scrapes HN, Reddit, RSS, ProductHunt, Dev.to when no API keys available |

### Scoring Pipeline

| Job | Queue | Description |
|-----|-------|-------------|
| `sub-agent` | `sub-agent` | Runs one of 7 sub-agent analyses on a topic (rate: 40/min) |
| `scoring-orchestrator` | `scoring-orchestrator` | Aggregates 7 sub-agent scores into final score (0-100) |

**Sub-agent types:** `sentiment`, `audience_fit`, `seo`, `competitor_gap`, `content_market_fit`, `engagement_predictor`, `pillar_balancer`

### Content Pipeline

| Job | Queue | Description |
|-----|-------|-------------|
| `caption-gen` | `caption-gen` | Generates platform-optimized captions (LinkedIn: long-form; X: concise) |
| `image-prompt-gen` | `image-prompt-gen` | Creates image prompts from caption content |
| `image-gen` | `image-gen` | Generates images via Cloudinary/DALL-E/Replicate |

### Publishing

| Job | Queue | Description |
|-----|-------|-------------|
| `publish` | `publish` | Publishes post to LinkedIn/X via Postiz or direct API |

### Engagement & Feedback

| Job | Queue | Description |
|-----|-------|-------------|
| `engagement-check` | `engagement-check` | Polls platform APIs at 2h, 6h, 24h, 48h checkpoints |
| `feedback-loop` | `feedback-loop` | Compares predicted vs. actual engagement, adjusts scoring weights |

### Notifications

| Job | Queue | Description |
|-----|-------|-------------|
| `daily-digest` | `notifications` | Daily Telegram summary of new topics and published posts |
| `weekly-report` | `notifications` | Weekly performance report |

### Health & Maintenance

| Job | Queue | Description |
|-----|-------|-------------|
| `connection-health` | `health` | Checks OAuth token status across all connections |
| `token-refresh` | `health` | Refreshes expiring OAuth tokens |
| `backup` | `backup` | PostgreSQL database backup |

### Rate Limits

| Action | Limit |
|--------|-------|
| Discovery trigger | 10/day |
| Caption generation | 30/day |
| Image generation | 20/day |
| Sub-agent calls | 300/day |
| Post publishing | 20/day |
| General API | 200/hour |
| Key validation | 20/hour |

---

## Database Schema

### Core Tables

```
users
├── id (uuid, PK)
├── firebaseUid (text, unique)
├── email (text, unique)
├── name (text)
├── avatarUrl (text)
├── plan (enum: free/starter/pro/admin)
├── onboardingStep (enum: 1-5/complete)
├── createdAt (timestamp)
└── updatedAt (timestamp)

user_niche_profiles
├── id (uuid, PK)
├── userId (uuid, FK → users)
├── niche (text)
├── pillars (text[])           # 3-5 content pillars
├── targetAudience (text)
├── toneKeywords (text[])
├── competitors (text[])
├── antiTopics (text[])        # Topics to avoid
└── createdAt (timestamp)

user_ai_keys
├── id (uuid, PK)
├── userId (uuid, FK → users)
├── provider (enum: openai/anthropic/google/xai/deepseek/mistral/replicate)
├── apiKeyEnc (text)           # AES-256-GCM encrypted
├── capabilities (text[])      # e.g., ['chat', 'web_search']
├── isValid (boolean)
└── validatedAt (timestamp)

user_model_config
├── id (uuid, PK)
├── userId (uuid, FK → users)
├── slotA through slotD        # Discovery LLM slots (provider + model)
├── subAgentModel              # Model for 7 sub-agents
├── captionModel               # Model for caption generation
└── imageModel                 # Model for image prompts

platform_connections
├── id (uuid, PK)
├── userId (uuid, FK → users)
├── platform (enum: linkedin/x/instagram/...)
├── accessTokenEnc (text)      # Encrypted
├── refreshTokenEnc (text)     # Encrypted
├── expiresAt (timestamp)
├── health (enum: healthy/degraded/expired/disconnected)
└── lastCheckedAt (timestamp)
```

### Content Tables

```
raw_topics
├── id (uuid, PK)
├── userId (uuid, FK → users)
├── title (text)
├── angle (text)
├── reasoning (text)
├── sourceUrls (text[])
├── discoverySlot (text)       # Which LLM slot found it
├── consensusCount (integer)   # How many LLMs agreed (1-4)
├── consensusTier (enum: definitive/strong/confirmed/experimental)
└── discoveredAt (timestamp)

scored_topics
├── id (uuid, PK)
├── rawTopicId (uuid, FK → raw_topics)
├── userId (uuid, FK → users)
├── status (enum: pending/approved/rejected)
├── sentimentScore (numeric)
├── audienceFitScore (numeric)
├── seoScore (numeric)
├── competitorGapScore (numeric)
├── cmfScore (numeric)
├── engagementPredLikes (integer)
├── engagementPredComments (integer)
├── pillarBoost (numeric)
├── consensusMultiplier (numeric)
├── finalScore (numeric)       # Weighted aggregate (0-100)
├── subAgentOutputs (jsonb)    # Full sub-agent reasoning
└── scoredAt (timestamp)

posts
├── id (uuid, PK)
├── userId (uuid, FK → users)
├── topicId (uuid, FK → scored_topics)
├── platform (enum: linkedin/x)
├── caption (text)
├── imageUrl (text)
├── status (enum: draft/generating/review/scheduled/publishing/published/failed)
├── scheduledAt (timestamp)
├── publishedAt (timestamp)
└── createdAt (timestamp)
```

### Analytics Tables

```
topic_performance
├── id (uuid, PK)
├── postId (uuid, FK → posts)
├── platform (enum)
├── checkpoint (enum: 2h/6h/24h/48h)
├── impressions (integer)
├── likes (integer)
├── comments (integer)
├── shares (integer)
└── checkedAt (timestamp)

scoring_feedback
├── id (uuid, PK)
├── postId (uuid, FK → posts)
├── topicId (uuid, FK → scored_topics)
├── predictedScore (numeric)
├── actualEngagement (numeric)
├── scoreDelta (numeric)       # predicted - actual
└── createdAt (timestamp)

scoring_weights
├── id (uuid, PK)
├── userId (uuid, FK → users)
├── dimension (text)           # e.g., 'sentiment', 'seo'
├── weight (numeric)           # Bounded 0.050 - 0.400
└── updatedAt (timestamp)
```

### Utility Tables

```
publish_log                    # Publishing audit trail
job_errors                     # Error tracking with categories
recommendation_matrix          # AI model recommendations for onboarding
fallback_grounding_cache       # Cached scraped content (24h TTL)
notification_preferences       # Per-user notification settings
```

To explore the schema interactively:

```bash
npm run db:studio
```

This opens Drizzle Studio at `https://local.drizzle.studio`.

---

## Testing

### End-to-End Smoke Test

```bash
npx tsx scripts/e2e-dogfood.ts
```

Runs the full pipeline: discovery trigger, topic scoring, content generation, and publishing.

### Type Checking

```bash
# All workspaces
npm run build

# Web app only
npx tsc --noEmit -p apps/web/tsconfig.json

# Worker only
npx tsc --noEmit -p apps/worker/tsconfig.json
```

### Linting

```bash
npm run lint
```

### Database Inspection

```bash
# Open Drizzle Studio
npm run db:studio

# Direct PostgreSQL access
psql postgresql://postgres:postgres@localhost:5432/techjm
```

### Worker Health Check

The worker exposes a health endpoint:

```bash
curl http://localhost:4000/health
```

Returns queue depths, active/completed/failed job counts per queue.

### Bull Board (Queue Admin)

The worker serves Bull Board at `http://localhost:4000/admin/queues` for visual queue inspection.

---

## Deployment

### Docker (Recommended)

The project includes a `docker-compose.yml` for infrastructure services. For a full production deployment:

1. Build the applications:

```bash
npm run build
```

2. Start infrastructure:

```bash
docker compose up -d
```

3. Run database migrations:

```bash
npm run db:push -w packages/db
npx tsx packages/db/src/seed.ts
```

4. Start the applications:

```bash
# Web app
NODE_ENV=production npm run start -w apps/web

# Worker
NODE_ENV=production npm run start -w apps/worker
```

### Production Checklist

- [ ] Generate a secure `DB_ENCRYPTION_KEY` (32-byte hex)
- [ ] Set `NODE_ENV=production`
- [ ] Configure `NEXT_PUBLIC_APP_URL` to your domain
- [ ] Set up Firebase Authentication with your production domain
- [ ] Configure OAuth redirect URIs to point to your domain
- [ ] Set Redis `maxmemory-policy` to `noeviction` (critical for BullMQ)
- [ ] Enable PostgreSQL connection pooling for high traffic
- [ ] Configure Caddy with your domain for auto-TLS
- [ ] Set up Telegram bot webhook: `npx tsx scripts/setup-telegram-webhook.ts`
- [ ] Configure Uptime Kuma monitors: `npx tsx scripts/setup-uptime-kuma.ts`
- [ ] Verify worker health endpoint responds: `curl http://localhost:4000/health`

### Monitoring

- **Uptime Kuma** — `http://localhost:3001` — Health checks for web, worker, PostgreSQL, Redis
- **Bull Board** — `http://localhost:4000/admin/queues` — Queue depths, failed jobs, retry management
- **Drizzle Studio** — `npm run db:studio` — Database inspection and queries

---

## Troubleshooting

### Database Connection Errors

**Error:** `connection refused` or `password authentication failed`

```bash
# Verify PostgreSQL is running
docker compose ps
docker compose logs postgres

# Test connection directly
psql postgresql://postgres:postgres@localhost:5432/techjm

# If using custom credentials, verify DATABASE_URL in .env
```

### Redis Connection Errors

**Error:** `ECONNREFUSED` or `NOAUTH`

```bash
# Verify Redis is running
docker compose ps
docker compose logs redis

# Test connection
redis-cli -u redis://localhost:6379 ping
# Should return: PONG

# Verify eviction policy (must be noeviction for BullMQ)
redis-cli CONFIG GET maxmemory-policy
```

### Schema Push Fails (Circular Dependencies)

**Error:** `Cannot access 'X' before initialization` during `db:push`

The schema uses a centralized `_enums.ts` and `_relations.ts` to avoid circular imports. If you encounter this:

```bash
# Check for circular imports
npx madge --circular packages/db/src/schema/

# The fix: ensure all enums are imported from _enums.ts, not from other table files
```

### Firebase Admin SDK Errors

**Error:** `Failed to parse service account key`

The `FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY` must be the full JSON on a single line with proper escaping:

```bash
# Convert multi-line JSON to single-line
cat your-firebase-key.json | jq -c . | sed 's/"/\\"/g'
```

### Onboarding Redirect Loop

**Error:** Stuck between onboarding steps 1 and 2

This happens when the backend database isn't updated before navigation. Verify:

```bash
# Check user's onboarding step in database
psql postgresql://postgres:postgres@localhost:5432/techjm \
  -c "SELECT id, email, onboarding_step FROM users;"
```

### Worker Jobs Not Processing

**Error:** Jobs stuck in `waiting` state

```bash
# Check worker is running
curl http://localhost:4000/health

# Check for failed jobs
curl http://localhost:4000/health | jq '.queues'

# View Bull Board for detailed queue inspection
open http://localhost:4000/admin/queues

# Verify worker has access to environment variables
# Worker needs its own .env symlink:
ls -la apps/worker/.env  # Should be symlink to root .env
```

### Model Config Slots Not Set

**Error:** Discovery returns 400 with "missing model configuration"

After onboarding, verify model config exists:

```sql
SELECT * FROM user_model_config WHERE user_id = 'your-user-id';
```

If slots are null, configure them in Settings > AI Configuration, or set defaults:

```sql
UPDATE user_model_config
SET slot_a_provider = 'openai', slot_a_model = 'gpt-4o'
WHERE user_id = 'your-user-id';
```

### Port Conflicts

| Service | Default Port | Fix |
|---------|-------------|-----|
| Web app | 3000 | `PORT=3001 npm run dev -w apps/web` |
| Worker health | 4000 | Update `PORT` in worker index.ts |
| PostgreSQL | 5432 | Change in `docker-compose.yml` and `DATABASE_URL` |
| Redis | 6379 | Change in `docker-compose.yml` and `REDIS_URL` |
| Postiz | 5000 | Change in `docker-compose.yml` and `POSTIZ_API_URL` |
| Uptime Kuma | 3001 | Change in `docker-compose.yml` |

---

## Further Documentation

For an in-depth guide covering all 12 implementation phases, detailed architecture decisions, and per-phase API documentation, see [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md).

---

## License

Private. All rights reserved.
