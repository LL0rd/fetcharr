import { Cron } from 'croner'

import { getSubscription, listSubscriptions } from '@fetcharr/db'
import type { Db, Subscription } from '@fetcharr/db'

/** Abo-Liste inklusive Archiv-Zähler und dem nächsten Prüfzeitpunkt aus dem Cron. */

export interface SubscriptionListEntry extends Subscription {
  archiveCount: number
  nextCheckAt: Date | null
}

export default defineEventHandler(async (event) => {
  const db = await useDb()
  const counts = archiveCounts(db)

  const subscriptions = listSubscriptions(db).map((subscription) => ({
    ...subscription,
    archiveCount: counts.get(subscription.id) ?? 0,
    nextCheckAt: nextCheckAt(subscription),
  }))

  return { subscriptions, total: subscriptions.length }
})

/** Wirft 404, damit die Handler sich das immer gleiche Vorspiel sparen. */
export function requireSubscription(db: Db, id: string): Subscription {
  const subscription = getSubscription(db, id)
  if (!subscription) {
    throw createError({ statusCode: 404, statusMessage: 'Subscription not found' })
  }
  return subscription
}

/**
 * TODO(orchestrator): Der Zähler gehört zum Archiv-Repository — hier steht er,
 * solange `/api/archive` noch parallel entsteht.
 */
export function archiveCounts(db: Db): Map<string, number> {
  const rows = db.$client
    .prepare('SELECT sub_id, COUNT(*) AS n FROM archive WHERE sub_id IS NOT NULL GROUP BY sub_id')
    .all() as { sub_id: string; n: number }[]

  return new Map(rows.map((row) => [row.sub_id, row.n]))
}

/**
 * Pausierte Abos haben keinen nächsten Lauf — croner würde sonst einen Termin
 * melden, den der Scheduler nie ausführt.
 */
export function nextCheckAt(subscription: Subscription): Date | null {
  if (subscription.paused) return null

  try {
    return new Cron(subscription.cron).nextRun()
  }
  catch {
    return null
  }
}

export function withNextCheck(subscription: Subscription) {
  return { ...subscription, nextCheckAt: nextCheckAt(subscription) }
}
