import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { db, userAiKeys, userModelConfig, encryptApiKey } from '@techjm/db'
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

  return NextResponse.json({ keys })
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action, provider, apiKey } = body

  if (!action || !provider) {
    return NextResponse.json({ error: 'action and provider required' }, { status: 400 })
  }

  if (action === 'add') {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return NextResponse.json({ error: 'apiKey required' }, { status: 400 })
    }

    // Validate the key by testing provider API
    const capabilities = await validateProviderKey(provider, apiKey)
    if (!capabilities) {
      return NextResponse.json({ error: 'Invalid API key — validation failed' }, { status: 400 })
    }

    const encrypted = encryptApiKey(apiKey)

    await db.insert(userAiKeys)
      .values({
        userId: user.id,
        provider,
        apiKeyEnc: encrypted,
        capabilities,
        validatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userAiKeys.userId, userAiKeys.provider],
        set: {
          apiKeyEnc: encrypted,
          capabilities,
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
    const capabilities = await validateProviderKey(provider, decrypted)

    if (capabilities) {
      await db.update(userAiKeys)
        .set({ capabilities, validatedAt: new Date() })
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

  return NextResponse.json({ keys })
}

async function validateProviderKey(
  provider: string,
  apiKey: string,
): Promise<Record<string, unknown> | null> {
  try {
    switch (provider) {
      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) return null
        const data = await res.json()
        const models = (data.data || []).map((m: { id: string }) => m.id)
        return {
          models: models.slice(0, 20),
          image_gen: models.some((m: string) => m.includes('dall-e')),
          web_search: false,
        }
      }
      case 'anthropic': {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }],
          }),
          signal: AbortSignal.timeout(15000),
        })
        // 200 or 400 (bad request but valid key) both indicate a valid key
        if (res.status === 401 || res.status === 403) return null
        return {
          models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
          image_gen: false,
          web_search: true,
        }
      }
      case 'google': {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
          { signal: AbortSignal.timeout(10000) },
        )
        if (!res.ok) return null
        return {
          models: ['gemini-2.0-flash', 'gemini-2.5-pro'],
          image_gen: false,
          web_search: true,
        }
      }
      case 'xai': {
        const res = await fetch('https://api.x.ai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) return null
        return {
          models: ['grok-2', 'grok-2-mini'],
          image_gen: false,
          x_search: true,
        }
      }
      case 'deepseek': {
        const res = await fetch('https://api.deepseek.com/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) return null
        return {
          models: ['deepseek-chat', 'deepseek-reasoner'],
          image_gen: false,
          web_search: false,
        }
      }
      case 'replicate': {
        const res = await fetch('https://api.replicate.com/v1/account', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) return null
        return {
          models: [],
          image_gen: true,
          web_search: false,
        }
      }
      default:
        return null
    }
  } catch {
    return null
  }
}
