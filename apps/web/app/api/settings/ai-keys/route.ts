import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { db, userAiKeys, userModelConfig, encryptApiKey } from '@techjm/db'
import { validateProviderApiKey } from '@/lib/ai-provider'
import { getResolvedProviderKeys } from '@/lib/ai-key-resolver'
import { eq, and } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const keys = await db.query.userAiKeys.findMany({
    where: eq(userAiKeys.userId, user.id),
    columns: {
      id: true,
      provider: true,
      capabilities: true,
      validatedAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    keys,
    resolvedProviders: await getResolvedProviderKeys(user.id),
  })
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action, provider, apiKey, baseUrl } = body

  if (!action || !provider) {
    return NextResponse.json({ error: 'action and provider required' }, { status: 400 })
  }

  if (action === 'add') {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return NextResponse.json({ error: 'apiKey required' }, { status: 400 })
    }

    // Validate the key by testing provider API
    const capabilities = await validateProviderKey(provider, apiKey, baseUrl)
    if (!capabilities) {
      return NextResponse.json({ error: 'Invalid API key — validation failed' }, { status: 400 })
    }

    const encrypted = encryptApiKey(apiKey)

    await db.insert(userAiKeys)
      .values({
        userId: user.id,
        provider,
        apiKeyEnc: encrypted,
        capabilities: {
          ...capabilities,
          ...(baseUrl ? { baseUrl } : {}),
        },
        validatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userAiKeys.userId, userAiKeys.provider],
        set: {
          apiKeyEnc: encrypted,
          capabilities: {
            ...capabilities,
            ...(baseUrl ? { baseUrl } : {}),
          },
          validatedAt: new Date(),
        },
      })
  } else if (action === 'remove') {
    await db.delete(userAiKeys)
      .where(and(eq(userAiKeys.userId, user.id), eq(userAiKeys.provider, provider)))

    // Clear model config slots that used this provider
    const config = await db.query.userModelConfig.findFirst({
      where: eq(userModelConfig.userId, user.id),
    })
    if (config) {
      const updates: Record<string, unknown> = { updatedAt: new Date() }
      for (const slot of ['slotA', 'slotB', 'slotC', 'slotD', 'subAgentModel', 'captionModel', 'imageModel'] as const) {
        const val = config[slot] as { provider?: string } | null
        if (val?.provider === provider) {
          updates[slot] = null
        }
      }
      await db.update(userModelConfig)
        .set(updates)
        .where(eq(userModelConfig.userId, user.id))
    }
  } else if (action === 'revalidate') {
    const existing = await db.query.userAiKeys.findFirst({
      where: and(eq(userAiKeys.userId, user.id), eq(userAiKeys.provider, provider)),
    })
    if (!existing) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 })
    }

    const { decryptApiKey } = await import('@techjm/db')
    const decrypted = decryptApiKey(existing.apiKeyEnc)
    const existingCaps = (existing.capabilities as Record<string, unknown> | null) || {}
    const capabilities = await validateProviderKey(
      provider,
      decrypted,
      (existingCaps.baseUrl as string | undefined) || undefined,
    )

    if (capabilities) {
      await db.update(userAiKeys)
        .set({
          capabilities: {
            ...capabilities,
            ...(existingCaps.baseUrl ? { baseUrl: existingCaps.baseUrl } : {}),
          },
          validatedAt: new Date(),
        })
        .where(eq(userAiKeys.id, existing.id))
    } else {
      return NextResponse.json({ error: 'Validation failed — key may be expired' }, { status: 400 })
    }
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Return updated keys list (no actual keys)
  const keys = await db.query.userAiKeys.findMany({
    where: eq(userAiKeys.userId, user.id),
    columns: {
      id: true,
      provider: true,
      capabilities: true,
      validatedAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    keys,
    resolvedProviders: await getResolvedProviderKeys(user.id),
  })
}

async function validateProviderKey(
  provider: string,
  apiKey: string,
  baseUrl?: string,
): Promise<Record<string, unknown> | null> {
  try {
    const result = await validateProviderApiKey(provider as any, apiKey, baseUrl)
    if (!result.valid) return null

    return {
      models: result.available_models,
      available_models: result.available_models,
      image_gen: result.image_gen,
      web_search: result.web_search,
      x_search: result.x_search,
    }
  } catch {
    return null
  }
}
