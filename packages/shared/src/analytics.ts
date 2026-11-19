/**
 * Web analytics contracts: the self-hosted, cookieless Umami tracker the web app loads in
 * browsers only (LOG-9, D-117). The server decides whether analytics is on; the web app decides
 * that a native host never loads it.
 */
import { z } from 'zod'

/** The tracker's settings, as the web app needs them to add its script. */
export const clientAnalyticsConfigSchema = z.object({
  scriptUrl: z.url(),
  websiteId: z.uuid(),
  /** Hosts tracking may run on (`data-domains`): the public host only. */
  domains: z.array(z.string().min(1)).min(1),
})
export type ClientAnalyticsConfig = z.infer<typeof clientAnalyticsConfigSchema>

/** Response for GET /api/analytics-config: null when analytics is off. */
export const analyticsConfigResponseSchema = z.object({
  analytics: clientAnalyticsConfigSchema.nullable(),
})
export type AnalyticsConfigResponse = z.infer<
  typeof analyticsConfigResponseSchema
>
