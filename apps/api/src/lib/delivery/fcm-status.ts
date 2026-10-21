/**
 * Pure classification of an FCM HTTP v1 send response status into a delivery
 * disposition. Kept dependency-free (no env/prisma) so it is trivially testable
 * and so the send loop's control flow reads declaratively.
 *
 * Dispositions:
 * - `ok`          2xx: delivered.
 * - `prune`       404/403: the device token is unregistered or belongs to another
 *                 sender, so drop the dead device token.
 * - `authRefresh` 401: OUR OAuth access token was rejected, not the device token.
 *                 Re-mint the service-account token and retry; never prune here.
 * - `fail`        anything else: a transient/unknown error — log, don't prune.
 */
export type FcmDisposition = 'ok' | 'prune' | 'authRefresh' | 'fail'

export function classifyFcmStatus(status: number): FcmDisposition {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 401) return 'authRefresh'
  if (status === 403 || status === 404) return 'prune'
  return 'fail'
}

/** Keep an allowlisted provider status for diagnosis, never echoed tokens or reminder content. */
export function fcmFailureCode(body: string): string | undefined {
  try {
    const code: unknown = JSON.parse(body)?.error?.status
    const allowed = ['INVALID_ARGUMENT', 'UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND',
      'RESOURCE_EXHAUSTED', 'UNAVAILABLE', 'INTERNAL', 'DEADLINE_EXCEEDED', 'UNKNOWN']
    return typeof code === 'string' && allowed.includes(code) ? code : undefined
  } catch {
    // Non-JSON proxy failures are represented by their HTTP status only.
    return undefined
  }
}
