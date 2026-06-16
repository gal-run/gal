export interface FirestoreTimestampJson {
  _seconds: number | string
  _nanoseconds?: number | string
}

type FirestoreTimestampObject = {
  toDate?: () => Date
}

export type SessionTimelineTimestamp =
  | string
  | Date
  | FirestoreTimestampJson
  | FirestoreTimestampObject
  | null
  | undefined

function isFirestoreTimestampJson(value: unknown): value is FirestoreTimestampJson {
  if (!value || typeof value !== 'object') return false

  const maybeTimestamp = value as Partial<FirestoreTimestampJson>
  return Number.isFinite(Number(maybeTimestamp._seconds))
}

/**
 * Coerce session timestamps from API payloads into a JS Date.
 * Production session payloads can contain Firestore JSON objects with
 * _seconds/_nanoseconds instead of ISO strings.
 */
export function toTimelineDate(value: SessionTimelineTimestamp): Date | null {
  if (!value) return null

  const maybeTimestamp = value as FirestoreTimestampObject
  if (typeof maybeTimestamp.toDate === 'function') {
    return maybeTimestamp.toDate()
  }

  if (isFirestoreTimestampJson(value)) {
    const seconds = Number(value._seconds)
    const nanoseconds = Number(value._nanoseconds ?? 0)
    const timestamp = new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000))
    return Number.isNaN(timestamp.getTime()) ? null : timestamp
  }

  const timestamp = new Date(value as string | Date)
  return Number.isNaN(timestamp.getTime()) ? null : timestamp
}

export function formatTimelineTime(value: SessionTimelineTimestamp): string {
  const date = toTimelineDate(value)
  if (!date) return ''

  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
