import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, users, userAiKeys, userModelConfig } from '@techjm/db';
import { encryptApiKey } from '@techjm/db/encryption';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const validProviders = ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'mistral', 'replicate'] as const;

const slotConfigSchema = z
  .object({ provider: z.string(), model: z.string() })
  .nullable()
  .optional();

const bodySchema = z.object({
  keys: z.array(
    z.object({
      provider: z.enum(validProviders),
      apiKey: z.string().min(1),
      capabilities: z.object({
        web_search: z.boolean(),
        x_search: z.boolean(),
        image_gen: z.boolean(),
        models: z.array(z.string()),
      }),
    }),
  ),
  modelConfig: z.object({
    slotA: slotConfigSchema,
    slotB: slotConfigSchema,
    slotC: slotConfigSchema,
    slotD: slotConfigSchema,
    subAgentModel: slotConfigSchema,
    captionModel: slotConfigSchema,
    imageModel: slotConfigSchema,
  }),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { keys, modelConfig } = parsed.data;

    // Upsert each provider key
    for (const key of keys) {
      const encrypted = encryptApiKey(key.apiKey);

      const existing = await db
        .select()
        .from(userAiKeys)
        .where(and(eq(userAiKeys.userId, user.id), eq(userAiKeys.provider, key.provider)))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(userAiKeys)
          .set({
            apiKeyEnc: encrypted,
            capabilities: {
              web_search: key.capabilities.web_search,
              x_search: key.capabilities.x_search,
              image_gen: key.capabilities.image_gen,
              models: key.capabilities.models,
            },
            validatedAt: new Date(),
          })
          .where(and(eq(userAiKeys.userId, user.id), eq(userAiKeys.provider, key.provider)));
      } else {
        await db.insert(userAiKeys).values({
          userId: user.id,
          provider: key.provider,
          apiKeyEnc: encrypted,
          capabilities: {
            web_search: key.capabilities.web_search,
            x_search: key.capabilities.x_search,
            image_gen: key.capabilities.image_gen,
            models: key.capabilities.models,
          },
          validatedAt: new Date(),
        });
      }
    }

    // Upsert model config
    const existingConfig = await db
      .select()
      .from(userModelConfig)
      .where(eq(userModelConfig.userId, user.id))
      .limit(1);

    if (existingConfig.length > 0) {
      await db
        .update(userModelConfig)
        .set({
          slotA: modelConfig.slotA,
          slotB: modelConfig.slotB,
          slotC: modelConfig.slotC,
          slotD: modelConfig.slotD,
          subAgentModel: modelConfig.subAgentModel,
          captionModel: modelConfig.captionModel,
          imageModel: modelConfig.imageModel,
          updatedAt: new Date(),
        })
        .where(eq(userModelConfig.userId, user.id));
    } else {
      await db.insert(userModelConfig).values({
        userId: user.id,
        slotA: modelConfig.slotA,
        slotB: modelConfig.slotB,
        slotC: modelConfig.slotC,
        slotD: modelConfig.slotD,
        subAgentModel: modelConfig.subAgentModel,
        captionModel: modelConfig.captionModel,
        imageModel: modelConfig.imageModel,
      });
    }

    // Advance onboarding step
    const stepNum = parseInt(user.onboardingStep);
    if (!isNaN(stepNum) && stepNum <= 3) {
      await db
        .update(users)
        .set({ onboardingStep: '4', updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('AI keys save error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const keys = await db
      .select({
        provider: userAiKeys.provider,
        capabilities: userAiKeys.capabilities,
        validatedAt: userAiKeys.validatedAt,
      })
      .from(userAiKeys)
      .where(eq(userAiKeys.userId, user.id));

    const [config] = await db
      .select()
      .from(userModelConfig)
      .where(eq(userModelConfig.userId, user.id))
      .limit(1);

    return NextResponse.json({ keys, modelConfig: config || null });
  } catch (err) {
    console.error('AI keys fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
