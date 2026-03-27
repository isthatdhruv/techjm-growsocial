const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const APP_URL = process.env.NEXT_PUBLIC_APP_URL

async function setup() {
  if (!BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN not set')
    process.exit(1)
  }
  if (!APP_URL) {
    console.error('NEXT_PUBLIC_APP_URL not set')
    process.exit(1)
  }

  const webhookUrl = `${APP_URL}/api/webhooks/telegram`
  console.log(`Setting webhook to: ${webhookUrl}`)

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
  )
  const result = await response.json()
  console.log('Webhook result:', result)
}

setup()
