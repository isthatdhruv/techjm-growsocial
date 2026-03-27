import { db, notificationPreferences } from '@techjm/db'
import { eq } from 'drizzle-orm'
import { sendPublishConfirmation, sendPublishFailure } from './telegram.js'

export async function notifyPublishResult(
  userId: string,
  success: boolean,
  postData: {
    platform: string
    caption: string
    externalUrl?: string
    error?: string
    retryCount?: number
  },
): Promise<void> {
  const prefs = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, userId),
  })

  if (!prefs?.telegramChatId || !prefs.telegramEnabled) return

  if (success && prefs.notifyPublishSuccess) {
    await sendPublishConfirmation(prefs.telegramChatId, {
      platform: postData.platform,
      caption: postData.caption,
      externalUrl: postData.externalUrl,
    })
  }

  if (!success && prefs.notifyPublishFailure) {
    await sendPublishFailure(prefs.telegramChatId, {
      platform: postData.platform,
      caption: postData.caption,
      error: postData.error || 'Unknown error',
      retryCount: postData.retryCount || 0,
    })
  }
}
