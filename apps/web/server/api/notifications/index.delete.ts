import { deleteAllNotifications } from '@fetcharr/db'

/** Leert das Center komplett — die Einträge sind reine Historie. */
export default defineEventHandler(async () => {
  const db = await useDb()

  return { deleted: deleteAllNotifications(db), unread: 0 }
})
