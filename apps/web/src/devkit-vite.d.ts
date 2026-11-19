/**
 * Types for `@dynamic-solutions-canada/devkit/vite`, which ships as plain JavaScript with no
 * declarations. Remove this file once devkit publishes its own.
 */
declare module '@dynamic-solutions-canada/devkit/vite' {
  /** Vite `server` options decided by devkit's environment; see devkit's README. */
  export function devkitViteServer(env?: Record<string, string | undefined>): {
    port: number
    host: string | true
    allowedHosts: string[] | undefined
    watch: { ignored: string[] }
  }
}
