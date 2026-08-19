import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

import { getFile } from '@fetcharr/db'

import { contentTypeFor, resolveMediaPath } from '../../utils/media.ts'

const CACHE_CONTROL = 'private, max-age=86400'

/** Poster für Grid und Player. Thumbnails ändern sich nach dem Download nicht mehr. */
export default defineEventHandler(async (event) => {
  const uid = getRouterParam(event, 'uid') ?? ''
  const db = await useDb()

  const file = getFile(db, uid)
  if (!file?.thumbnailPath) {
    throw createError({ statusCode: 404, statusMessage: 'Thumbnail not found' })
  }

  const absolute = resolveMediaPath(file.thumbnailPath)
  const stats = await stat(absolute).catch(() => null)
  if (!stats?.isFile()) {
    throw createError({ statusCode: 404, statusMessage: 'Thumbnail is missing on disk' })
  }

  setResponseHeader(event, 'Content-Type', contentTypeFor(absolute))
  setResponseHeader(event, 'Content-Length', stats.size)
  setResponseHeader(event, 'Cache-Control', CACHE_CONTROL)

  return sendStream(event, createReadStream(absolute))
})
