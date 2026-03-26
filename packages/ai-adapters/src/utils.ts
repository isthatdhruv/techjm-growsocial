/**
 * Parse JSON from LLM response text, handling markdown fences and common issues.
 */
export function parseJsonResponse<T>(text: string): T {
  // Strip markdown JSON fences
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  return JSON.parse(cleaned) as T;
}

/**
 * Map common API error codes to descriptive messages.
 */
export function mapApiError(err: unknown, provider: string): string {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('authentication')) {
      return `Invalid API key for ${provider}`;
    }
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
      return `Rate limited by ${provider} — try again later`;
    }
    if (msg.includes('500') || msg.includes('internal server error')) {
      return `${provider} server error — try again later`;
    }
    if (msg.includes('403') || msg.includes('forbidden')) {
      return `API key lacks permissions for ${provider}`;
    }
    return err.message;
  }
  return `Unknown error from ${provider}`;
}
