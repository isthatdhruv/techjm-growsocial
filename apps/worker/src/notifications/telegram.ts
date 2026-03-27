import TelegramBot from 'node-telegram-bot-api'

let bot: TelegramBot | null = null

export function getTelegramBot(): TelegramBot | null {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return null
  }

  if (!bot) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false })
  }

  return bot
}

// ═══ Message Formatters ═══

export async function sendDailyDigest(
  chatId: string,
  topics: { title: string; score: number; tier: string; id: string }[],
): Promise<void> {
  const bot = getTelegramBot()
  if (!bot || !chatId) return

  const topicLines = topics
    .slice(0, 5)
    .map((t, i) => {
      const tierEmoji =
        t.tier === 'definitive'
          ? '🔴'
          : t.tier === 'strong'
            ? '🟠'
            : t.tier === 'confirmed'
              ? '🟡'
              : '⚪'
      return `${i + 1}. ${tierEmoji} *${escapeMarkdown(t.title)}*\n   Score: ${t.score.toFixed(1)} \\| Consensus: ${t.tier}`
    })
    .join('\n\n')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const message = `🔍 *Daily Topic Digest*\n\n${topicLines}\n\n📊 ${topics.length} topics found total\\.\n🔗 [Review in Dashboard](${escapeMarkdown(appUrl)}/dashboard/topics)`

  await bot
    .sendMessage(chatId, message, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    })
    .catch((err) => console.error('Telegram send failed:', err.message))
}

export async function sendPublishConfirmation(
  chatId: string,
  post: { platform: string; caption: string; externalUrl?: string },
): Promise<void> {
  const bot = getTelegramBot()
  if (!bot || !chatId) return

  const platformEmoji = post.platform === 'linkedin' ? '💼' : '𝕏'
  const preview = escapeMarkdown(post.caption.slice(0, 120).replace(/\n/g, ' '))
  const linkLine = post.externalUrl
    ? `\n🔗 [View Post](${escapeMarkdown(post.externalUrl)})`
    : ''

  const message = `${platformEmoji} *Post Published\\!*\n\n"${preview}\\.\\.\\."${linkLine}`

  await bot
    .sendMessage(chatId, message, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    })
    .catch((err) => console.error('Telegram send failed:', err.message))
}

export async function sendPublishFailure(
  chatId: string,
  post: { platform: string; caption: string; error: string; retryCount: number },
): Promise<void> {
  const bot = getTelegramBot()
  if (!bot || !chatId) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const preview = escapeMarkdown(post.caption.slice(0, 80).replace(/\n/g, ' '))
  const message = `❌ *Publish Failed*\n\nPlatform: ${post.platform}\nPost: "${preview}\\.\\.\\."\nError: ${escapeMarkdown(post.error)}\nAttempt: ${post.retryCount + 1}/4\n\n🔗 [View in Queue](${escapeMarkdown(appUrl)}/dashboard/queue)`

  await bot
    .sendMessage(chatId, message, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    })
    .catch((err) => console.error('Telegram send failed:', err.message))
}

export async function sendTokenExpiryWarning(
  chatId: string,
  platform: string,
  daysLeft: number,
): Promise<void> {
  const bot = getTelegramBot()
  if (!bot || !chatId) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const urgency = daysLeft <= 3 ? '🔴' : '🟡'
  const message = `${urgency} *OAuth Token Expiring*\n\nYour ${platform} connection expires in *${daysLeft} days*\\.\nReconnect now to avoid publishing interruptions\\.\n\n🔗 [Reconnect in Settings](${escapeMarkdown(appUrl)}/settings)`

  await bot
    .sendMessage(chatId, message, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    })
    .catch((err) => console.error('Telegram send failed:', err.message))
}

export async function sendConnectionHealthAlert(
  chatId: string,
  platform: string,
  status: string,
  error: string,
): Promise<void> {
  const bot = getTelegramBot()
  if (!bot || !chatId) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const message = `⚠️ *Connection Issue*\n\n${platform} connection is *${escapeMarkdown(status)}*\\.\nError: ${escapeMarkdown(error)}\n\n🔗 [Fix in Settings](${escapeMarkdown(appUrl)}/settings)`

  await bot
    .sendMessage(chatId, message, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    })
    .catch((err) => console.error('Telegram send failed:', err.message))
}

export async function sendWeeklyReport(
  chatId: string,
  stats: {
    postsPublished: number
    totalEngagement: number
    avgEngagement: number
    bestPost: { caption: string; score: number } | null
    weightsUpdated: boolean
  },
): Promise<void> {
  const bot = getTelegramBot()
  if (!bot || !chatId) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const bestLine = stats.bestPost
    ? `\n🏆 Best post: "${escapeMarkdown(stats.bestPost.caption.slice(0, 60))}\\.\\.\\." \\(${stats.bestPost.score.toFixed(1)}\\)`
    : ''
  const learningLine = stats.weightsUpdated
    ? '\n🧠 AI scoring weights updated based on your engagement data'
    : ''

  const message = `📊 *Weekly Report*\n\n📝 Posts published: ${stats.postsPublished}\n❤️ Total engagement: ${stats.totalEngagement.toFixed(0)}\n📈 Avg per post: ${stats.avgEngagement.toFixed(1)}${bestLine}${learningLine}\n\n🔗 [Full Analytics](${escapeMarkdown(appUrl)}/dashboard/analytics)`

  await bot
    .sendMessage(chatId, message, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    })
    .catch((err) => console.error('Telegram send failed:', err.message))
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}
