import { db, posts, topicPerformance, userNicheProfiles } from '@techjm/db'
import { eq, and, sql } from 'drizzle-orm'
import { Job } from 'bullmq'

export interface TimeOptimizerResult {
  bestSlots: number
  optimal: OptimalTimes
}

export interface OptimalTimes {
  best_hours: { hour: number; day_of_week: number; avg_engagement: number; sample_size: number }[]
  best_days: { day_of_week: number; avg_engagement: number; day_name: string }[]
  worst_hours: { hour: number; day_of_week: number; avg_engagement: number }[]
  recommendations: string[]
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function computeOptimalTimes(
  userId: string,
  job: Job,
): Promise<TimeOptimizerResult> {
  // 1. Aggregate engagement by hour and day of week
  const timeData = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${posts.publishedAt})`,
      dayOfWeek: sql<number>`EXTRACT(DOW FROM ${posts.publishedAt})`,
      avgEngagement: sql<number>`AVG(${topicPerformance.engagementScore}::numeric)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(posts)
    .innerJoin(
      topicPerformance,
      and(eq(topicPerformance.postId, posts.id), eq(topicPerformance.checkpoint, '48h')),
    )
    .where(eq(posts.userId, userId))
    .groupBy(
      sql`EXTRACT(HOUR FROM ${posts.publishedAt})`,
      sql`EXTRACT(DOW FROM ${posts.publishedAt})`,
    )
    .having(sql`COUNT(*) >= 2`)

  if (timeData.length < 3) {
    job.log('Not enough time data for optimization')
    return { bestSlots: 0, optimal: emptyTimes() }
  }

  // 2. Find best hour+day combinations
  const sorted = timeData
    .map((t) => ({
      hour: Number(t.hour),
      day_of_week: Number(t.dayOfWeek),
      avg_engagement: Number(t.avgEngagement),
      sample_size: Number(t.count),
    }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement)

  const bestHours = sorted.slice(0, 5)
  const worstHours = sorted.slice(-3).reverse()

  // 3. Aggregate by day of week only
  const dayData = await db
    .select({
      dayOfWeek: sql<number>`EXTRACT(DOW FROM ${posts.publishedAt})`,
      avgEngagement: sql<number>`AVG(${topicPerformance.engagementScore}::numeric)`,
    })
    .from(posts)
    .innerJoin(
      topicPerformance,
      and(eq(topicPerformance.postId, posts.id), eq(topicPerformance.checkpoint, '48h')),
    )
    .where(eq(posts.userId, userId))
    .groupBy(sql`EXTRACT(DOW FROM ${posts.publishedAt})`)

  const bestDays = dayData
    .map((d) => ({
      day_of_week: Number(d.dayOfWeek),
      avg_engagement: Number(d.avgEngagement),
      day_name: DAY_NAMES[Number(d.dayOfWeek)],
    }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement)

  // 4. Generate human-readable recommendations
  const recommendations: string[] = []

  if (bestHours.length > 0) {
    const top = bestHours[0]
    recommendations.push(
      `Best posting time: ${DAY_NAMES[top.day_of_week]} at ${top.hour}:00 (${top.avg_engagement.toFixed(1)} avg engagement from ${top.sample_size} posts)`,
    )
  }

  if (bestDays.length > 0) {
    const topDay = bestDays[0]
    const worstDay = bestDays[bestDays.length - 1]
    if (topDay.avg_engagement > worstDay.avg_engagement * 1.3) {
      recommendations.push(
        `${topDay.day_name} outperforms ${worstDay.day_name} by ${((topDay.avg_engagement / worstDay.avg_engagement - 1) * 100).toFixed(0)}%`,
      )
    }
  }

  if (worstHours.length > 0) {
    const bottom = worstHours[0]
    recommendations.push(
      `Avoid posting at ${bottom.hour}:00 on ${DAY_NAMES[bottom.day_of_week]} (${bottom.avg_engagement.toFixed(1)} avg — your lowest)`,
    )
  }

  // Weekday vs weekend comparison
  const weekdayAvg = bestDays.filter((d) => d.day_of_week >= 1 && d.day_of_week <= 5)
  const weekendAvg = bestDays.filter((d) => d.day_of_week === 0 || d.day_of_week === 6)
  if (weekdayAvg.length > 0 && weekendAvg.length > 0) {
    const wdAvg =
      weekdayAvg.reduce((a, b) => a + b.avg_engagement, 0) / weekdayAvg.length
    const weAvg =
      weekendAvg.reduce((a, b) => a + b.avg_engagement, 0) / weekendAvg.length
    if (Math.abs(wdAvg - weAvg) / Math.max(wdAvg, weAvg) > 0.15) {
      recommendations.push(
        wdAvg > weAvg
          ? `Weekdays perform ${((wdAvg / weAvg - 1) * 100).toFixed(0)}% better than weekends`
          : `Weekends perform ${((weAvg / wdAvg - 1) * 100).toFixed(0)}% better than weekdays`,
      )
    }
  }

  const optimal: OptimalTimes = {
    best_hours: bestHours,
    best_days: bestDays,
    worst_hours: worstHours,
    recommendations,
  }

  // 5. Save to user's brand kit
  const niche = await db.query.userNicheProfiles.findFirst({
    where: eq(userNicheProfiles.userId, userId),
  })

  if (niche) {
    const currentBrandKit = (niche.brandKit as Record<string, unknown>) || {}
    const updatedBrandKit = {
      ...currentBrandKit,
      optimal_times: optimal,
      times_updated_at: new Date().toISOString(),
    }

    await db
      .update(userNicheProfiles)
      .set({ brandKit: updatedBrandKit, updatedAt: new Date() })
      .where(eq(userNicheProfiles.userId, userId))

    job.log(
      `Saved ${bestHours.length} optimal time slots and ${recommendations.length} recommendations`,
    )
  }

  return { bestSlots: bestHours.length, optimal }
}

function emptyTimes(): OptimalTimes {
  return { best_hours: [], best_days: [], worst_hours: [], recommendations: [] }
}
