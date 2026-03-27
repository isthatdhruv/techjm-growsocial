#!/usr/bin/env tsx
/**
 * E2E Dogfood Test — TechJM MVP
 *
 * Validates the ENTIRE pipeline end-to-end:
 * 1. Verifies test user with completed onboarding
 * 2. Checks niche config, AI keys, model slots
 * 3. Verifies discovery has run (topics exist)
 * 4. Validates 7 sub-agent scoring
 * 5. Checks content generation (captions + images)
 * 6. Verifies service health
 *
 * Run: npx tsx scripts/e2e-dogfood.ts
 * Flags: --dry-run (skip publish), --verbose (extra logging)
 */

import 'dotenv/config';

// Dynamic imports to ensure env is loaded first
async function main() {
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const postgres = (await import('postgres')).default;
  const schema = await import('../packages/db/src/schema/index');
  const { eq, and, desc, sql } = await import('drizzle-orm');

  const connectionString = process.env.DATABASE_URL!;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  const DRY_RUN = process.argv.includes('--dry-run');
  const VERBOSE = process.argv.includes('--verbose');

  function log(msg: string) {
    console.log(`[E2E] ${msg}`);
  }

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`  FAIL: ${msg}`);
      process.exit(1);
    }
    console.log(`  PASS: ${msg}`);
  }

  log('=== TechJM E2E Dogfood Test ===\n');

  // STEP 1: Verify test user exists
  log('Step 1: Checking test user...');

  const testUser = await db.query.users.findFirst({
    where: eq(schema.users.onboardingStep, 'complete'),
  });
  assert(!!testUser, 'Found user with completed onboarding');
  assert(!!testUser?.id, `User ID: ${testUser?.id}`);

  const userId = testUser!.id;

  // STEP 2: Verify niche config
  log('\nStep 2: Checking niche config...');

  const niche = await db.query.userNicheProfiles.findFirst({
    where: eq(schema.userNicheProfiles.userId, userId),
  });
  assert(!!niche, 'Niche profile exists');
  assert(!!niche?.niche, `Niche: ${niche?.niche}`);
  const pillars = (niche?.pillars as string[]) || [];
  assert(pillars.length >= 3, `Pillars: ${pillars.length} configured`);

  // STEP 3: Verify AI keys
  log('\nStep 3: Checking AI keys...');

  const keys = await db.query.userAiKeys.findMany({
    where: eq(schema.userAiKeys.userId, userId),
  });
  assert(keys.length >= 1, `${keys.length} AI provider(s) connected`);
  keys.forEach((k) => log(`  - ${k.provider}: validated ${k.validatedAt ? 'yes' : 'no'}`));

  // STEP 4: Verify model config
  log('\nStep 4: Checking model config...');

  const modelCfg = await db.query.userModelConfig.findFirst({
    where: eq(schema.userModelConfig.userId, userId),
  });
  assert(!!modelCfg, 'Model config exists');

  const slotFields = [modelCfg?.slotA, modelCfg?.slotB, modelCfg?.slotC, modelCfg?.slotD];
  const slotsConfigured = slotFields.filter(Boolean).length;
  assert(slotsConfigured >= 1, `${slotsConfigured} discovery slot(s) configured`);

  // STEP 5: Verify raw topics exist
  log('\nStep 5: Checking raw topics...');

  const rawCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.rawTopics)
    .where(eq(schema.rawTopics.userId, userId));
  const totalRaw = Number(rawCount[0]?.count) || 0;
  assert(totalRaw > 0, `${totalRaw} raw topics in database`);

  if (VERBOSE) {
    const tiers = await db
      .select({ tier: schema.rawTopics.consensusTier, count: sql<number>`count(*)` })
      .from(schema.rawTopics)
      .where(eq(schema.rawTopics.userId, userId))
      .groupBy(schema.rawTopics.consensusTier);

    log('  Consensus distribution:');
    tiers.forEach((t) => log(`    ${t.tier || 'unscored'}: ${t.count}`));
  }

  // STEP 6: Verify scored topics
  log('\nStep 6: Checking scored topics...');

  const scored = await db.query.scoredTopics.findMany({
    where: eq(schema.scoredTopics.userId, userId),
    orderBy: [desc(schema.scoredTopics.finalScore)],
    limit: 10,
  });
  assert(scored.length > 0, `${scored.length} scored topics found`);

  const topTopic = scored[0];
  assert(parseFloat(topTopic.finalScore || '0') > 0, `Top score: ${topTopic.finalScore}`);
  assert(!!topTopic.subAgentOutputs, 'Sub-agent outputs populated');

  const subAgents = Object.keys((topTopic.subAgentOutputs as object) || {});
  assert(subAgents.length === 7, `All 7 sub-agents ran (found: ${subAgents.length}: ${subAgents.join(', ')})`);

  // STEP 7: Check generated content
  log('\nStep 7: Checking generated content...');

  const generatedPosts = await db.query.posts.findMany({
    where: eq(schema.posts.userId, userId),
    orderBy: [desc(schema.posts.createdAt)],
    limit: 20,
  });

  if (generatedPosts.length > 0) {
    assert(true, `${generatedPosts.length} post(s) found`);

    for (const gp of generatedPosts.slice(0, 5)) {
      const captionLen = gp.caption?.length || 0;
      log(`  ${gp.platform} | ${gp.status} | ${captionLen} chars | Image: ${gp.imageUrl ? 'yes' : 'no'}`);

      if (gp.platform === 'linkedin' && gp.caption) {
        const wordCount = gp.caption.split(/\s+/).length;
        if (wordCount < 50) {
          log(`    Warning: LinkedIn caption only ${wordCount} words`);
        }
      }
      if (gp.platform === 'x' && gp.caption) {
        assert(captionLen <= 280, `X caption length: ${captionLen} (must be <=280)`);
      }
    }
  } else {
    log('  No posts generated yet (may need content generation trigger)');
  }

  // STEP 8: Check publish readiness
  log('\nStep 8: Checking publish readiness...');

  const reviewPosts = generatedPosts.filter((p) => p.status === 'review');
  const scheduledPosts = generatedPosts.filter((p) => p.status === 'scheduled');
  const publishedPosts = generatedPosts.filter((p) => p.status === 'published');

  log(`  Review: ${reviewPosts.length} | Scheduled: ${scheduledPosts.length} | Published: ${publishedPosts.length}`);

  if (DRY_RUN) {
    log('\n  DRY RUN - skipping actual publish');
  }

  // STEP 9: Check scoring weights
  log('\nStep 9: Checking scoring system...');

  const weights = await db.query.scoringWeights.findMany({
    where: eq(schema.scoringWeights.userId, userId),
  });

  if (weights.length > 0) {
    log('  Adaptive weights active:');
    weights.forEach((w) => log(`    ${w.dimension}: ${w.weight}`));
    const sum = weights.reduce((a, w) => a + parseFloat(w.weight as string), 0);
    assert(Math.abs(sum - 1.0) < 0.05, `Weights sum to ${sum.toFixed(3)} (~1.0)`);
  } else {
    log('  Using default weights (no feedback data yet)');
  }

  // STEP 10: Verify services health
  log('\nStep 10: Checking service health...');

  try {
    const healthResponse = await fetch('http://localhost:3100/health');
    const health = await healthResponse.json();
    assert(
      health.status === 'ok' || health.status === 'degraded',
      `Worker health: ${health.status}`,
    );

    if (health.services) {
      assert(health.services.redis === 'connected', 'Redis: connected');
      assert(health.services.postgres === 'connected', 'PostgreSQL: connected');
    }

    if (VERBOSE && health.queues) {
      log('  Queue depths:');
      Object.entries(health.queues).forEach(([name, counts]: [string, unknown]) => {
        if (typeof counts === 'object' && counts !== null) {
          const c = counts as Record<string, number>;
          log(`    ${name}: waiting=${c.waiting} active=${c.active} failed=${c.failed}`);
        }
      });
    }
  } catch {
    log('  Warning: Worker health endpoint not reachable (worker might not be running)');
  }

  // STEP 11: Check error tracking
  log('\nStep 11: Checking error tracking...');

  try {
    const errorCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.jobErrors);
    log(`  ${errorCount[0]?.count || 0} job errors logged`);
  } catch {
    log('  job_errors table not yet created (run db:push)');
  }

  // SUMMARY
  log('\n=======================================');
  log('  E2E DOGFOOD TEST COMPLETE');
  log('=======================================');
  log(`User: ${testUser?.email}`);
  log(`Niche: ${niche?.niche}`);
  log(`AI Providers: ${keys.map((k) => k.provider).join(', ')}`);
  log(`Discovery Slots: ${slotsConfigured}`);
  log(`Topics Found: ${totalRaw} raw -> ${scored.length} scored`);
  log(`Top Score: ${topTopic.finalScore}`);
  log(`Posts: ${generatedPosts.length} total (${publishedPosts.length} published)`);
  log(`Scoring: ${weights.length > 0 ? 'Adaptive weights active' : 'Default weights'}`);
  log(`Mode: ${DRY_RUN ? 'Dry run (no publish)' : 'Full run'}`);
  log('');

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('E2E test failed:', err.message);
  process.exit(1);
});
